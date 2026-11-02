import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  validateManifest, verifyChecksumText, verifyDocumentation, verifyDownload,
  verifyLocalReference, verifyOnline, verifyReleaseMetadata
} from '../scripts/verify-release.mjs';

const manifest = JSON.parse(await readFile(new URL('../releases/preview.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(manifest);
const checksumText = manifest.assets.filter(asset => asset.kind !== 'checksums').map(asset => `${asset.sha256}  ${asset.name}`).join('\n') + '\n';
const release = () => ({
  draft: false, prerelease: true, tag_name: manifest.tag,
  html_url: manifest.releaseUrl, published_at: manifest.publishedAt,
  assets: manifest.assets.map(asset => ({
    name: asset.name, size: asset.bytes, digest: `sha256:${asset.sha256}`,
    state: 'uploaded', browser_download_url: asset.url
  }))
});

test('the checked-in manifest and published checksum text agree', () => {
  validateManifest(manifest);
  verifyChecksumText(manifest, checksumText);
  verifyReleaseMetadata(manifest, release());
});

test('manifest rejects an unsafe destination, ambiguous platforms and malformed integrity data', async t => {
  const cases = [
    ['foreign repository', value => { value.repository = 'someone/else'; }],
    ['stable-release disguise', value => { value.prerelease = false; }],
    ['release-tag mismatch', value => { value.tag = 'v0.3.0-preview.2'; }],
    ['cross-release asset', value => { value.assets[0].url = value.assets[0].url.replace('preview.1', 'preview.2'); }],
    ['lookalike domain', value => { value.assets[0].url = value.assets[0].url.replace('github.com/', 'github.com.example.org/'); }],
    ['path traversal filename', value => { value.assets[0].name = '../installer.dmg'; }],
    ['duplicate asset', value => { value.assets.push(structuredClone(value.assets[0])); }],
    ['missing checksum', value => { value.assets = value.assets.filter(asset => asset.kind !== 'checksums'); }],
    ['invalid digest', value => { value.assets[0].sha256 = 'not-a-hash'; }],
    ['negative bytes', value => { value.assets[0].bytes = -1; }],
    ['unsafe integer size', value => { value.assets[0].bytes = Number.MAX_SAFE_INTEGER + 1; }],
    ['platform parity claim', value => { value.platforms[1].state = 'current-preview'; }],
    ['signing claim', value => { value.platforms[0].distributionSigned = true; }],
    ['duplicate platform', value => { value.platforms[1] = structuredClone(value.platforms[0]); }],
    ['wrong platform installer', value => { value.platforms[0].installer = value.platforms[1].installer; }],
    ['absent validation limits', value => { value.platforms[1].limits = []; }]
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const value = clone(); mutate(value);
    assert.throws(() => validateManifest(value));
  });
});

test('remote release checks fail when exact public artifacts drift', async t => {
  const cases = [
    ['unpublished draft', value => { value.draft = true; }],
    ['unlabelled prerelease', value => { value.prerelease = false; }],
    ['wrong tag', value => { value.tag_name = 'v0.3.0-preview.2'; }],
    ['missing installer', value => { value.assets.shift(); }],
    ['additional unrecorded asset', value => { value.assets.push({ name: 'unknown.exe' }); }],
    ['changed bytes', value => { value.assets[0].size++; }],
    ['changed digest', value => { value.assets[0].digest = `sha256:${'0'.repeat(64)}`; }],
    ['missing GitHub digest', value => { value.assets[0].digest = null; }],
    ['upload in progress', value => { value.assets[0].state = 'starter'; }],
    ['changed asset URL', value => { value.assets[0].browser_download_url = 'https://example.com/installer'; }]
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const value = release(); mutate(value);
    assert.throws(() => verifyReleaseMetadata(manifest, value));
  });
});

test('published checksums reject missing, duplicate, changed and unexpected entries', () => {
  assert.throws(() => verifyChecksumText(manifest, checksumText.split('\n').slice(1).join('\n')));
  assert.throws(() => verifyChecksumText(manifest, checksumText + checksumText.split('\n')[0]));
  assert.throws(() => verifyChecksumText(manifest, checksumText.replace(manifest.assets[0].sha256, '0'.repeat(64))));
  assert.throws(() => verifyChecksumText(manifest, checksumText.replace(manifest.assets[0].name, '../unexpected.dmg')));
  assert.throws(() => verifyChecksumText(manifest, checksumText.replace(manifest.assets[0].name, 'unrecorded.dmg')));
});

test('download verification hashes the stream and rejects corruption and truncation', async () => {
  const bytes = Buffer.from('a small synthetic installer fixture');
  const asset = { name: 'fixture.dmg', url: 'https://example.com/fixture.dmg', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.equal(await verifyDownload(asset, async () => new Response(bytes)), bytes.length);
  const corrupted = Buffer.from(bytes); corrupted[0] ^= 1;
  await assert.rejects(verifyDownload(asset, async () => new Response(corrupted)), /SHA-256 differs/);
  await assert.rejects(verifyDownload(asset, async () => new Response(bytes.subarray(1))), /byte size differs/);
  await assert.rejects(verifyDownload(asset, async () => new Response(Buffer.concat([bytes, Buffer.from('extra')]))), /exceeds expected byte size/);
  await assert.rejects(verifyDownload(asset, async () => new Response('not found', { status: 404 })), /Download failed \(404\)/);
});

test('online verification scopes authentication to the GitHub API and checks checksum-file bytes', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return url.startsWith('https://api.github.com/') ? Response.json(release()) : new Response(checksumText);
  };
  await verifyOnline(manifest, fakeFetch, 'synthetic-test-token');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-test-token');
  assert.equal(calls[1].options.headers, undefined);
  const corruptSums = async url => url.startsWith('https://api.github.com/') ? Response.json(release()) : new Response(checksumText.replace(/^./, '0'));
  await assert.rejects(verifyOnline(manifest, corruptSums, ''), /Checksum file SHA-256 differs/);
  await assert.rejects(verifyOnline(manifest, async () => new Response('', { status: 403 }), ''), /GitHub release request failed \(403\)/);
});

test('documentation links resolve within the repository, including encoded names and parent links', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'superbrain-links-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = join(temp, 'repo');
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets', 'product preview.png'), 'synthetic image');
  await writeFile(join(root, 'README.md'), '[Guide](docs/start.md)\n<img src="assets/product%20preview.png" alt="Product">\n[Web](https://example.com)\n');
  await writeFile(join(root, 'docs', 'start.md'), '[Home](../README.md#start)\n[Preview](../assets/product%20preview.png)\n');
  assert.equal((await verifyDocumentation(root)).references, 5);
  await verifyLocalReference(root, join(root, 'docs', 'start.md'), '../README.md');
  await assert.rejects(verifyLocalReference(root, join(root, 'README.md'), 'missing.md'), /Missing local link/);
  await assert.rejects(verifyLocalReference(root, join(root, 'README.md'), '../outside.md'), /escapes repository/);
  await assert.rejects(verifyLocalReference(root, join(root, 'README.md'), '%2e%2e/outside.md'), /escapes repository/);
  await assert.rejects(verifyLocalReference(root, join(root, 'README.md'), '/etc/passwd'), /Absolute local link/);
  await assert.rejects(verifyLocalReference(root, join(root, 'README.md'), 'file:///etc/passwd'), /Unsupported link scheme/);
  await assert.rejects(verifyLocalReference(root, join(root, 'README.md'), 'javascript:alert(1)'), /Unsupported link scheme/);
  await assert.rejects(verifyLocalReference(root, join(root, 'README.md'), '%00bad'), /Unsafe local link/);
  await assert.rejects(verifyLocalReference(root, join(root, 'README.md'), '%ZZ'), URIError);
  await writeFile(join(temp, 'outside.md'), 'private fixture');
  await symlink(join(temp, 'outside.md'), join(root, 'escaped.md'));
  await assert.rejects(verifyLocalReference(root, join(root, 'README.md'), 'escaped.md'), /symlink outside/);
});
