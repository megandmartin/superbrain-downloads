#!/usr/bin/env node
// Dependency-free checks for this public distribution repository. Never runs installers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'megandmartin/superbrain-downloads';
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hashPattern = /^[a-f0-9]{64}$/;

export function validateManifest(manifest) {
  assert.ok(manifest && typeof manifest === 'object', 'Manifest must be an object');
  assert.equal(manifest.schemaVersion, 1, 'Unsupported manifest schema');
  assert.equal(manifest.repository, repository, 'Unexpected release repository');
  assert.equal(manifest.channel, 'preview', 'Expected the preview channel');
  assert.equal(manifest.prerelease, true, 'Preview must be identified as a prerelease');
  assert.match(manifest.tag ?? '', /^v\d+\.\d+\.\d+-preview\.\d+$/, 'Invalid preview tag');
  assert.ok(Number.isFinite(Date.parse(manifest.publishedAt)), 'Invalid publication date');
  assert.equal(manifest.releaseUrl, `https://github.com/${repository}/releases/tag/${manifest.tag}`, 'Release URL does not match the tag');
  assert.ok(Array.isArray(manifest.assets) && manifest.assets.length >= 3, 'Missing release assets');
  const names = new Set();
  for (const asset of manifest.assets) {
    assert.match(asset.name ?? '', /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Unsafe asset filename');
    assert.ok(!names.has(asset.name), `Duplicate asset: ${asset.name}`);
    names.add(asset.name);
    assert.ok(['installer', 'checksums', 'notices'].includes(asset.kind), `Invalid asset kind: ${asset.name}`);
    assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, `Invalid byte size: ${asset.name}`);
    assert.match(asset.sha256 ?? '', hashPattern, `Invalid SHA-256: ${asset.name}`);
    assert.equal(asset.url, `https://github.com/${repository}/releases/download/${manifest.tag}/${asset.name}`, `Asset URL does not match its release: ${asset.name}`);
  }
  assert.equal(manifest.assets.filter(asset => asset.kind === 'checksums').length, 1, 'Expected one checksum file');
  assert.equal(manifest.assets.find(asset => asset.kind === 'checksums').name, 'SHA256SUMS.txt', 'Unexpected checksum filename');
  assert.equal(manifest.assets.filter(asset => asset.kind === 'notices').length, 1, 'Expected one notices archive');
  assert.equal(manifest.assets.find(asset => asset.kind === 'notices').name, 'THIRD-PARTY-NOTICES.zip', 'Unexpected notices filename');
  assert.ok(Array.isArray(manifest.platforms) && manifest.platforms.length === 2, 'Expected the Mac and Windows previews');
  const platformIds = new Set();
  const installerNames = new Set();
  for (const platform of manifest.platforms) {
    assert.ok(['mac-arm64', 'windows-x64'].includes(platform.id), 'Unexpected platform');
    assert.ok(!platformIds.has(platform.id), `Duplicate platform: ${platform.id}`);
    platformIds.add(platform.id);
    assert.ok(manifest.assets.some(asset => asset.name === platform.installer && asset.kind === 'installer'), `Missing installer: ${platform.id}`);
    assert.ok(!installerNames.has(platform.installer), 'Platforms must have different installers');
    installerNames.add(platform.installer);
    assert.ok(platform.id === 'mac-arm64' ? /-mac-arm64\.dmg$/.test(platform.installer) : /-win-x64\.exe$/.test(platform.installer), `Installer architecture differs: ${platform.id}`);
    assert.equal(platform.distributionSigned, false, 'This manifest describes unsigned previews');
    assert.equal(platform.state, platform.id === 'mac-arm64' ? 'current-preview' : 'earlier-preview', 'Platform preview state must preserve the build distinction');
    for (const field of ['requirements', 'verification']) {
      assert.ok(typeof platform[field] === 'string' && platform[field].trim(), `Missing ${field}: ${platform.id}`);
    }
    assert.ok(Array.isArray(platform.limits) && platform.limits.length > 0 && platform.limits.every(value => typeof value === 'string' && value.trim()), `Missing limits: ${platform.id}`);
  }
  assert.equal(manifest.assets.filter(asset => asset.kind === 'installer').length, manifest.platforms.length, 'Installer count does not match the platforms');
  return manifest;
}

export function verifyReleaseMetadata(manifest, release) {
  assert.equal(release.draft, false, 'GitHub release is a draft');
  assert.equal(release.prerelease, manifest.prerelease, 'GitHub prerelease state differs');
  assert.equal(release.tag_name, manifest.tag, 'GitHub release tag differs');
  assert.equal(release.html_url, manifest.releaseUrl, 'GitHub release URL differs');
  assert.equal(Date.parse(release.published_at), Date.parse(manifest.publishedAt), 'GitHub publication date differs');
  assert.ok(Array.isArray(release.assets), 'GitHub returned no assets');
  assert.equal(release.assets.length, manifest.assets.length, 'GitHub asset count differs; review the manifest');
  for (const expected of manifest.assets) {
    const matches = release.assets.filter(asset => asset.name === expected.name);
    assert.equal(matches.length, 1, `Missing or duplicate GitHub asset: ${expected.name}`);
    const [actual] = matches;
    assert.equal(actual.state, 'uploaded', `Asset is not uploaded: ${expected.name}`);
    assert.equal(actual.size, expected.bytes, `GitHub byte size differs: ${expected.name}`);
    assert.equal(actual.digest, `sha256:${expected.sha256}`, `GitHub SHA-256 differs: ${expected.name}`);
    assert.equal(actual.browser_download_url, expected.url, `GitHub asset URL differs: ${expected.name}`);
  }
}

export function verifyChecksumText(manifest, text) {
  const entries = new Map();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) [ *]([a-zA-Z0-9][a-zA-Z0-9._-]*)$/.exec(line);
    assert.ok(match, 'Malformed published checksum entry');
    const [, hash, name] = match;
    assert.ok(!entries.has(name), `Duplicate published checksum: ${name}`);
    entries.set(name, hash);
  }
  const assets = manifest.assets.filter(asset => asset.kind !== 'checksums');
  assert.equal(entries.size, assets.length, 'Published checksum count differs');
  for (const asset of assets) {
    assert.equal(entries.get(asset.name), asset.sha256, `Published checksum differs: ${asset.name}`);
  }
}

export async function verifyDownload(asset, fetchImpl = fetch) {
  const response = await fetchImpl(asset.url, { signal: AbortSignal.timeout(600_000) });
  assert.ok(response.ok, `Download failed (${response.status}): ${asset.name}`);
  assert.ok(response.body, `Empty download response: ${asset.name}`);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    assert.ok(bytes <= asset.bytes, `Download exceeds expected byte size: ${asset.name}`);
    hash.update(chunk);
  }
  assert.equal(bytes, asset.bytes, `Downloaded byte size differs: ${asset.name}`);
  assert.equal(hash.digest('hex'), asset.sha256, `Downloaded SHA-256 differs: ${asset.name}`);
  return bytes;
}

export async function verifyOnline(manifest, fetchImpl = fetch, token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'superbrain-public-release-verifier'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/tags/${manifest.tag}`, {
    headers, signal: AbortSignal.timeout(30_000)
  });
  assert.ok(response.ok, `GitHub release request failed (${response.status})`);
  verifyReleaseMetadata(manifest, await response.json());
  const checksumAsset = manifest.assets.find(asset => asset.kind === 'checksums');
  // Public download requests intentionally receive no API token.
  const sums = await fetchImpl(checksumAsset.url, { signal: AbortSignal.timeout(30_000) });
  assert.ok(sums.ok, `Published checksum request failed (${sums.status})`);
  const bytes = Buffer.from(await sums.arrayBuffer());
  assert.equal(bytes.length, checksumAsset.bytes, 'Checksum file byte size differs');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), checksumAsset.sha256, 'Checksum file SHA-256 differs');
  verifyChecksumText(manifest, bytes.toString('utf8'));
}

function insideRoot(root, path) {
  const delta = relative(root, path);
  return delta !== '..' && !delta.startsWith(`..${sep}`) && !isAbsolute(delta);
}

export async function verifyLocalReference(root, source, reference) {
  if (!reference || reference.startsWith('#') || /^(https?:|mailto:)/i.test(reference)) return;
  assert.ok(!/^[a-z][a-z\d+.-]*:/i.test(reference), `Unsupported link scheme in ${relative(root, source)}: ${reference}`);
  assert.ok(!reference.startsWith('/') && !reference.startsWith('\\'), `Absolute local link in ${relative(root, source)}: ${reference}`);
  const pathPart = reference.split(/[?#]/, 1)[0];
  const decoded = decodeURIComponent(pathPart);
  assert.ok(!decoded.includes('\0') && !decoded.includes('\\'), `Unsafe local link: ${reference}`);
  const target = resolve(dirname(source), decoded);
  assert.ok(insideRoot(root, target), `Link escapes repository: ${reference}`);
  let actual;
  try { actual = await realpath(target); } catch { throw new Error(`Missing local link in ${relative(root, source)}: ${reference}`); }
  assert.ok(insideRoot(await realpath(root), actual), `Link follows a symlink outside the repository: ${reference}`);
}

export async function verifyDocumentation(root) {
  const files = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md'];
  async function collect(path) {
    for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await collect(child);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(child);
    }
  }
  try { await collect('docs'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let count = 0;
  for (const name of files) {
    const file = resolve(root, name);
    try { await stat(file); } catch (error) {
      if (error.code === 'ENOENT' && name !== 'README.md') continue;
      throw error;
    }
    const markdown = (await readFile(file, 'utf8')).replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
    const references = [
      ...[...markdown.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g)].map(match => match[1] || match[2]),
      ...[...markdown.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]),
      ...[...markdown.matchAll(/\bsrcset=["']([^"']+)["']/g)].flatMap(match => match[1].split(',').map(item => item.trim().split(/\s+/)[0])),
      ...[...markdown.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm)].map(match => match[1])
    ];
    for (const reference of references) {
      await verifyLocalReference(root, file, reference.replaceAll('&amp;', '&'));
      count++;
    }
  }
  return { files: files.length, references: count };
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  if (flags.has('--help')) {
    console.log('Usage: node scripts/verify-release.mjs [--online | --download]\n\nDefault: validate the manifest and local documentation links.\n--online: also compare GitHub metadata and published checksum text.\n--download: also stream and hash every release asset (about 676 MB).\nRequires Node.js 22 or later. No dependencies, files saved or installers run.');
    return;
  }
  for (const flag of flags) assert.ok(['--online', '--download'].includes(flag), `Unknown option: ${flag}`);
  const manifest = validateManifest(JSON.parse(await readFile(resolve(defaultRoot, 'releases/preview.json'), 'utf8')));
  const docs = await verifyDocumentation(defaultRoot);
  console.log(`Local checks passed: ${manifest.tag}, ${manifest.assets.length} assets, ${docs.references} documentation references.`);
  if (flags.has('--online') || flags.has('--download')) {
    await verifyOnline(manifest);
    console.log('GitHub metadata and published checksum file match the manifest.');
  }
  if (flags.has('--download')) {
    for (const asset of manifest.assets) {
      console.log(`Verifying download: ${asset.name}`);
      await verifyDownload(asset);
      console.log(`  SHA-256 and ${asset.bytes.toLocaleString('en-US')} bytes match.`);
    }
    console.log('All public asset contents verified. Installers were not saved or run.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
