import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertHTTP, assertSourceRecall, createReport, parseArguments, preflightReport, verifyArtifact, verifyBuildIdentity,
  withMountedRuntime, writeNewReport
} from '../scripts/smoke-preview.mjs';

const manifest = JSON.parse(await readFile(new URL('../releases/preview.json', import.meta.url), 'utf8'));
const build = {
  version: '0.3.0', sourceRevision: manifest.platforms.find(item => item.id === 'mac-arm64').sourceRevision,
  sourceDirty: false, platform: 'darwin', architecture: 'arm64'
};

test('CLI rejects missing, duplicate and unrecognised arguments without launching anything', () => {
  for (const args of [[], ['--dmg'], ['--dmg', '--report'], ['--anything'], ['--dmg', 'a.dmg', '--dmg', 'b.dmg'], ['--dmg', 'bad\0.dmg']]) {
    assert.throws(() => parseArguments(args));
  }
  assert.equal(parseArguments(['--help']).help, true);
  assert.ok(parseArguments(['--dmg', 'renamed installer.dmg']).dmg.endsWith('renamed installer.dmg'));
});

test('artifact guard hashes bytes and rejects changed, truncated and indirect files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'superbrain-smoke-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'renamed.dmg');
  const bytes = Buffer.from('synthetic archive fixture; never a real disk image');
  await writeFile(file, bytes);
  const asset = { name: 'published.dmg', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.equal((await verifyArtifact(file, asset)).name, 'published.dmg');
  await assert.rejects(verifyArtifact(file, { ...asset, sha256: '0'.repeat(64) }), /SHA-256 differs/);
  await assert.rejects(verifyArtifact(file, { ...asset, bytes: bytes.length + 1 }), /byte size differs/);
  await symlink(file, join(directory, 'link.dmg'));
  await assert.rejects(verifyArtifact(join(directory, 'link.dmg'), asset), /regular file/);
  await assert.rejects(verifyArtifact(directory, asset), /Expected a DMG/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(verifyArtifact(file, asset, controller.signal), /aborted/);
});

test('build identity rejects the wrong release revision, architecture and dirty builds', () => {
  verifyBuildIdentity(build, manifest);
  for (const mutation of [
    { sourceRevision: '0'.repeat(40) }, { version: '0.4.0' }, { sourceDirty: true },
    { platform: 'win32' }, { architecture: 'x64' }
  ]) assert.throws(() => verifyBuildIdentity({ ...build, ...mutation }, manifest));
  const missingRevision = structuredClone(manifest);
  delete missingRevision.platforms.find(item => item.id === 'mac-arm64').sourceRevision;
  assert.throws(() => verifyBuildIdentity(build, missingRevision), /public source revision/);
});

test('an unexpected HTTP result cannot be reported as a passing contract', () => {
  assertHTTP({ status: 403 }, 403, 'Synthetic refusal');
  assert.throws(() => assertHTTP({ status: 200, data: { secret: 'never-log-response' } }, 403, 'Synthetic refusal'), error => {
    assert.match(error.message, /expected HTTP 403, received 200/);
    assert.ok(!error.message.includes('never-log-response'));
    return true;
  });
});

test('the public report excludes caller paths, cookies, secrets and raw records', () => {
  const report = createReport({
    manifest: { ...manifest, privateWorkspace: '/private/real-company' },
    artifact: { name: 'fixture.dmg', bytes: 99, sha256: 'a'.repeat(64), localPath: '/private/real-company' },
    build: { ...build, token: 'private-launch-secret', localPath: '/private/real-company' },
    checks: [{ id: 'fixture-check', description: 'Synthetic check', status: 'passed', cookie: 'private-session-cookie', record: { body: 'confidential-record' } }],
    runtimeNode: 'v24.21.0', runnerNode: 'v24.22.2', operatingSystemRelease: 'synthetic-kernel',
    environment: { token: 'private-provider-token' }
  });
  const text = JSON.stringify(report);
  for (const forbidden of ['real-company', 'private-launch-secret', 'private-session-cookie', 'confidential-record', 'private-provider-token']) assert.ok(!text.includes(forbidden));
  assert.equal(report.scope, 'HTTP contracts of the packaged macOS runtime in a disposable synthetic workspace');
  assert.ok(report.notTested.some(item => item.includes('Native Electron')));
  assert.ok(report.notTested.some(item => item.includes('generated-answer')));
});

test('temporary image and synthetic workspace are cleaned when a contract fails', async () => {
  let temporaryData, mountedPath, detachedPath;
  await assert.rejects(withMountedRuntime('synthetic.dmg', async ({ runtime, data }) => {
    temporaryData = data;
    assert.ok(runtime.includes('SuperBrain.app'));
    await writeFile(join(data, 'synthetic-record'), 'disposable fixture');
    throw new Error('Synthetic contract failure');
  }, {
    mount: async (_file, mountpoint) => { mountedPath = mountpoint; },
    unmount: async mountpoint => { detachedPath = mountpoint; }
  }), /Synthetic contract failure/);
  assert.equal(mountedPath, detachedPath);
  await assert.rejects(readFile(join(temporaryData, 'synthetic-record')), { code: 'ENOENT' });
});

test('a partial mount failure still attempts detach and removes temporary data', async () => {
  let attempted, detached;
  await assert.rejects(withMountedRuntime('synthetic.dmg', async () => { throw new Error('Must not run'); }, {
    mount: async (_file, mountpoint) => { attempted = mountpoint; throw new Error('Synthetic attach failure'); },
    unmount: async mountpoint => { detached = mountpoint; }
  }), /Synthetic attach failure/);
  assert.equal(attempted, detached);
  await assert.rejects(readFile(join(attempted, 'unused')), { code: 'ENOENT' });
});


test('source recall rejects request echoes, metadata-only results and unrelated passages', () => {
  const id = 'fixture-source', marker = 'fictional-marker';
  const evidence = { id, body: `A synthetic source containing ${marker}`, sourceVersion: 'a'.repeat(64), citation: 1 };
  assertSourceRecall({ status: 200, data: { evidence: [evidence] } }, id, marker);
  for (const data of [
    { query: `${id} ${marker}` },
    { evidence: [], metadata: { id, marker } },
    { evidence: [{ id, metadata: { body: marker } }] },
    { evidence: [{ ...evidence, id: 'another-source' }] },
    { evidence: [{ ...evidence, body: 'An unrelated source passage' }] },
    { evidence: [{ ...evidence, sourceVersion: undefined }] },
    { evidence: [{ ...evidence, citation: undefined }] }
  ]) assert.throws(() => assertSourceRecall({ status: 200, data }, id, marker));
});

test('report output refuses existing files and symlinks without changing their contents', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'superbrain-report-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const existing = join(directory, 'existing.json');
  await writeFile(existing, 'preserve this existing content');
  await assert.rejects(preflightReport(existing), /already exists/);
  await assert.rejects(writeNewReport(existing, { overwritten: true }), /already exists/);
  assert.equal(await readFile(existing, 'utf8'), 'preserve this existing content');
  const linked = join(directory, 'linked.json');
  await symlink(existing, linked);
  await assert.rejects(preflightReport(linked), /already exists/);
  await assert.rejects(writeNewReport(linked, { overwritten: true }), /already exists/);
  assert.equal(await readFile(existing, 'utf8'), 'preserve this existing content');
  const dangling = join(directory, 'dangling.json');
  await symlink(join(directory, 'not-created.json'), dangling);
  await assert.rejects(preflightReport(dangling), /already exists/);
  await assert.rejects(preflightReport(join(directory, 'report.dmg')), /new .json/);
});

test('a fresh report is created exclusively after preflight and creates its parent folder', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'superbrain-report-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'new-folder', 'report.json');
  await preflightReport(output);
  await writeNewReport(output, { status: 'passed', synthetic: true });
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { status: 'passed', synthetic: true });
  await assert.rejects(writeNewReport(output, { overwritten: true }), /already exists/);
});
