#!/usr/bin/env node
// Original black-box checks. No application modules are imported or copied.
import assert from 'node:assert/strict';
import { spawn, execFile as execFileCallback } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validateManifest } from './verify-release.mjs';

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recordId = 'public-smoke-source';
const marker = 'synthetic-release-proof-739a';

export function parseArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') { options.help = true; continue; }
    assert.ok(['--dmg', '--report'].includes(arg), `Unknown option: ${arg}`);
    assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), `Missing value for ${arg}`);
    const key = arg.slice(2);
    assert.ok(!options[key], `Duplicate option: ${arg}`);
    assert.ok(!args[i + 1].includes('\0'), `Invalid path for ${arg}`);
    options[key] = resolve(args[++i]);
  }
  if (!options.help) assert.ok(options.dmg, 'Provide --dmg with the published Mac installer.');
  return options;
}

export async function verifyArtifact(file, asset, signal) {
  assert.ok(typeof file === 'string' && file.endsWith('.dmg') && !file.includes('\0'), 'Expected a DMG file path.');
  const info = await lstat(file);
  assert.ok(info.isFile() && !info.isSymbolicLink(), 'The installer must be a regular file, not a symlink.');
  assert.equal(info.size, asset.bytes, 'Installer byte size differs from the public manifest.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) {
    signal?.throwIfAborted();
    hash.update(chunk);
  }
  const digest = hash.digest('hex');
  assert.equal(digest, asset.sha256, 'Installer SHA-256 differs from the public manifest.');
  return { name: asset.name, bytes: info.size, sha256: digest };
}

export function verifyBuildIdentity(build, manifest) {
  const platform = manifest.platforms.find(item => item.id === 'mac-arm64');
  assert.match(platform?.sourceRevision ?? '', /^[a-f0-9]{40}$/, 'The Mac manifest needs its public source revision.');
  assert.equal(build.version, manifest.tag.slice(1).split('-preview.')[0], 'Packaged application version differs.');
  assert.equal(build.sourceRevision, platform.sourceRevision, 'Packaged source revision differs.');
  assert.equal(build.sourceDirty, false, 'Packaged build records uncommitted source.');
  assert.equal(build.platform, 'darwin', 'Expected the published Mac runtime.');
  assert.equal(build.architecture, 'arm64', 'Expected the published Apple Silicon runtime.');
}

const attach = (file, mountpoint, signal) => execFile('/usr/bin/hdiutil', [
  'attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mountpoint, file
], { timeout: 60_000, maxBuffer: 1024 * 1024, signal });
const detach = mountpoint => execFile('/usr/bin/hdiutil', ['detach', mountpoint], { timeout: 20_000 });

// A unique mountpoint keeps this run separate from installed apps and user data.
export async function withMountedRuntime(file, action, { mount = attach, unmount = detach, signal } = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'superbrain-public-smoke-'));
  const mountpoint = join(temporary, 'image');
  const data = join(temporary, 'workspace');
  await mkdir(mountpoint);
  await mkdir(data, { mode: 0o700 });
  let mounted = false;
  try {
    await mount(file, mountpoint, signal);
    mounted = true;
    const runtime = join(mountpoint, 'SuperBrain.app', 'Contents', 'Resources', 'runtime');
    return await action({ runtime, data });
  } finally {
    // Also attempt detach after a cancelled attach, which can have mounted partially.
    try { await unmount(mountpoint); }
    catch (error) {
      if (mounted) throw new Error(`Could not detach the temporary image at ${mountpoint}. The temporary directory was retained.`, { cause: error });
    }
    await rm(temporary, { recursive: true, force: true });
  }
}

export function assertHTTP(response, expected, label) {
  assert.equal(response.status, expected, `${label}: expected HTTP ${expected}, received ${response.status}`);
}

export function assertSourceRecall(response, expectedId, expectedMarker) {
  assertHTTP(response, 200, 'Local source recall');
  assert.ok(Array.isArray(response.data?.evidence), 'Local recall returned no structured evidence.');
  assert.ok(response.data.evidence.some(item =>
    item?.id === expectedId && typeof item.body === 'string' && item.body.includes(expectedMarker) &&
    /^[a-f0-9]{64}$/.test(item.sourceVersion ?? '') && Number.isInteger(item.citation) && item.citation > 0
  ), 'Local recall did not return the synthetic source passage with a version and citation.');
}

export async function preflightReport(file) {
  if (file === undefined) return;
  assert.ok(typeof file === 'string' && file.endsWith('.json') && !file.includes('\0'), 'Choose a new .json path for the report.');
  try { await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('Report path already exists; choose a new .json file.');
}

export async function writeNewReport(file, value) {
  await preflightReport(file);
  await mkdir(dirname(file), { recursive: true });
  try { await writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o644, flag: 'wx' }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Report path already exists; choose a new .json file.');
    throw error;
  }
}

function runtimeControl(runtime, data, signal) {
  let child, url, cookie = '', token;
  async function stop() {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    const current = child;
    await new Promise(resolveStop => {
      const timer = setTimeout(() => current.kill('SIGKILL'), 5_000);
      current.once('exit', () => { clearTimeout(timer); resolveStop(); });
      current.kill('SIGTERM');
    });
  }
  async function start() {
    signal?.throwIfAborted();
    token = randomBytes(32).toString('hex');
    cookie = '';
    child = spawn(join(runtime, 'bin', 'node'), [join(runtime, 'server', 'start.mjs')], {
      cwd: data,
      // Inherit no provider credentials, real workspace paths or model setup.
      env: {
        PATH: '/usr/bin:/bin', AI_PROVIDER: 'local', NODE_NO_WARNINGS: '1',
        SUPERBRAIN_DATA_DIR: data, SUPERBRAIN_DB: join(data, 'smoke.sqlite'),
        SUPERBRAIN_PORT: '0', SUPERBRAIN_DESKTOP_TOKEN: token
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    url = await new Promise((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => finish(new Error('Packaged runtime startup timed out.')), 25_000);
      const onAbort = () => finish(new Error('Smoke check interrupted.'));
      const onError = () => finish(new Error('Could not launch the bundled Node runtime.'));
      const onExit = () => finish(new Error('Packaged runtime exited before it was ready.'));
      function finish(error, readyURL) {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        child.removeListener('error', onError);
        child.removeListener('exit', onExit);
        error ? rejectReady(error) : resolveReady(readyURL);
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      child.once('error', onError);
      child.once('exit', onExit);
      child.on('message', message => {
        if (message?.type !== 'ready') return;
        if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(message.url ?? '')) return finish(new Error('Runtime did not announce a loopback address.'));
        finish(null, message.url);
      });
    });
  }
  async function request(path, { method = 'GET', body, headers = {}, desktop = true } = {}) {
    const response = await fetch(url + path, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: {
        ...(desktop ? { 'x-superbrain-desktop': token } : {}),
        ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers
      },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000)
    });
    const text = await response.text();
    let value;
    try { value = JSON.parse(text); } catch { value = text; }
    return { status: response.status, data: value, headers: response.headers };
  }
  async function login() {
    const response = await request('/api/session', { method: 'POST', body: {} });
    assertHTTP(response, 200, 'Create isolated owner session');
    const setCookie = response.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    cookie = setCookie.split(';')[0];
  }
  return { start, stop, request, login, sessionCookie: () => cookie };
}

async function runContracts(control) {
  const checks = [];
  const check = async (id, description, action) => {
    await action();
    checks.push({ id, description, status: 'passed' });
    console.log(`PASS ${id}: ${description}`);
  };
  const { request } = control;
  await control.start();
  await check('launch-auth-required', 'Requests without the launch secret are rejected', async () => assertHTTP(await request('/api/bootstrap', { desktop: false }), 403, 'Launch authentication'));
  await check('launch-auth-invalid', 'An incorrect launch secret is rejected', async () => assertHTTP(await request('/api/bootstrap', { headers: { 'x-superbrain-desktop': 'synthetic-wrong-secret' } }), 403, 'Invalid launch authentication'));
  await check('owner-session-required', 'A launch secret alone does not create an owner session', async () => assertHTTP(await request('/api/bootstrap'), 401, 'Owner session'));
  await check('cross-origin-rejected', 'A cross-origin owner-session request is rejected', async () => assertHTTP(await request('/api/session', { method: 'POST', body: {}, headers: { origin: 'https://example.invalid' } }), 403, 'Origin boundary'));
  await check('owner-cookie-flags', 'The owner session cookie is HttpOnly and SameSite Strict', () => control.login());
  await check('privacy-default-local', 'A fresh isolated workspace starts in Local mode', async () => {
    const response = await request('/api/privacy'); assertHTTP(response, 200, 'Default privacy'); assert.equal(response.data.mode, 'local');
  });
  await check('fictional-demo', 'The fictional demo loads without provider credentials', async () => {
    const response = await request('/api/bootstrap'); assertHTTP(response, 200, 'Demo bootstrap'); assert.equal(response.data.company.demo, true);
  });
  await check('connected-acknowledgement', 'Connected mode is refused without explicit acknowledgement', async () => {
    assertHTTP(await request('/api/privacy', { method: 'POST', body: { mode: 'connected' } }), 400, 'Connection acknowledgement');
  });
  await check('external-client-blocked', 'Local mode rejects the external-client test action', async () => {
    const response = await request('/api/clients/test', { method: 'POST', body: { client: 'claude' } });
    assertHTTP(response, 403, 'Local client boundary'); assert.match(response.data.error, /Local mode/);
  });
  let companyId;
  await check('synthetic-company-create', 'A disposable synthetic company can be created', async () => {
    const response = await request('/api/companies', { method: 'POST', body: { name: 'Synthetic smoke company', founder: 'Fictional Owner', description: 'Disposable public verifier fixture', priorities: [] } });
    assertHTTP(response, 201, 'Synthetic company'); assert.match(response.data.id, /^company-[a-f0-9-]+$/); companyId = response.data.id;
  });
  await check('synthetic-record-save', 'A synthetic record can be saved in that company', async () => {
    const response = await request('/api/records', { method: 'POST', body: { id: recordId, type: 'document', title: 'Synthetic release smoke proof', body: `Fictional marker ${marker}. This record exists only for repeatable verification.`, access: 'shared', space: 'company' } });
    assertHTTP(response, 201, 'Synthetic record'); assert.equal(response.data.id, recordId);
  });
  await check('local-source-recall', 'Local recall returns the saved synthetic source', async () => {
    const response = await request('/api/recall', { method: 'POST', body: { query: marker } });
    assertSourceRecall(response, recordId, marker);
  });
  const previousCookie = control.sessionCookie();
  await control.stop();
  await control.start();
  await check('session-restart-expiry', 'The previous owner session is invalid after restart', async () => {
    assertHTTP(await request('/api/bootstrap', { headers: { cookie: previousCookie } }), 401, 'Restart session');
  });
  await control.login();
  assertHTTP(await request('/api/session/workspace', { method: 'POST', body: { workspace: companyId } }), 200, 'Reopen synthetic company');
  await check('record-restart-persistence', 'The synthetic source survives a clean runtime restart', async () => {
    const response = await request(`/api/records/${recordId}`); assertHTTP(response, 200, 'Persisted source'); assert.ok(response.data.body.includes(marker));
  });
  await check('privacy-restart-local', 'The isolated workspace remains in Local mode after restart', async () => {
    const response = await request('/api/privacy'); assertHTTP(response, 200, 'Restart privacy'); assert.equal(response.data.mode, 'local');
  });
  return checks;
}

// Explicit allowlists prevent paths, credentials, cookies or raw records entering reports.
export function createReport({ manifest, artifact, build, checks, runtimeNode, runnerNode = process.version, operatingSystemRelease = release() }) {
  return {
    schemaVersion: 1, recordedAt: new Date().toISOString(), status: 'passed',
    scope: 'HTTP contracts of the packaged macOS runtime in a disposable synthetic workspace',
    repository: manifest.repository, releaseTag: manifest.tag,
    artifact: { name: artifact.name, bytes: artifact.bytes, sha256: artifact.sha256 },
    build: { version: build.version, sourceRevision: build.sourceRevision, platform: build.platform, architecture: build.architecture },
    environment: { platform: 'darwin', architecture: arch(), operatingSystemRelease, runnerNode, runtimeNode },
    checks: checks.map(({ id, description, status }) => ({ id, description, status })),
    notTested: [
      'Native Electron interface, installation/uninstallation and operating-system trust prompts',
      'Local model download, generated-answer quality, performance and physical microphone input',
      'Windows or Intel Mac execution, connected provider workflows and multi-user behavior',
      'System-wide network isolation, a comprehensive security audit or real-world customer validation'
    ]
  };
}

export async function runSmoke({ dmg, report, signal }) {
  await preflightReport(report);
  assert.equal(process.platform, 'darwin', 'This smoke harness runs only on an Apple Silicon Mac.');
  assert.equal(process.arch, 'arm64', 'The public Mac preview requires Apple Silicon.');
  const manifest = validateManifest(JSON.parse(await readFile(join(repositoryRoot, 'releases', 'preview.json'), 'utf8')));
  const platform = manifest.platforms.find(item => item.id === 'mac-arm64');
  const expected = manifest.assets.find(item => item.name === platform.installer);
  const artifact = await verifyArtifact(dmg, expected, signal);
  console.log(`Verified exact public installer: ${artifact.name}`);
  const result = await withMountedRuntime(dmg, async ({ runtime, data }) => {
    const build = JSON.parse(await readFile(join(runtime, 'BUILD.json'), 'utf8'));
    verifyBuildIdentity(build, manifest);
    const { stdout } = await execFile(join(runtime, 'bin', 'node'), ['--version'], { timeout: 10_000, signal });
    const control = runtimeControl(runtime, data, signal);
    let checks;
    try { checks = await runContracts(control); }
    finally { await control.stop(); }
    return createReport({ manifest, artifact, build, checks, runtimeNode: stdout.trim() });
  }, { signal });
  if (report) await writeNewReport(report, result);
  console.log(`Passed ${result.checks.length} packaged-runtime checks. Disposable workspace removed and image detached.`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) console.log('Usage: node scripts/smoke-preview.mjs --dmg /path/to/SuperBrain-0.3.0-mac-arm64.dmg [--report report.json]\n\nApple Silicon Mac only; Node.js 22+. Verifies the exact public DMG before running its bundled runtime in a disposable local workspace. No models downloaded, outside providers configured or real workspaces opened. Choose a fresh .json report path; existing files and symlinks are refused. The report excludes local paths, credentials, cookies and raw records.');
    else await runSmoke({ ...options, signal: controller.signal });
  } catch (error) {
    console.error(`Smoke verification failed: ${error.message}`);
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
