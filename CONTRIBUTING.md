# Help improve the preview

Useful feedback makes SuperBrain easier to install, understand and use. This public repository holds downloads, documentation and verification tools. The desktop application's development source remains private.

## Report a problem

Read the [known preview limits](docs/preview-status.md), then [open a bug report](https://github.com/megandmartin/superbrain-downloads/issues/new/choose). Include:

- Your operating system, processor architecture and installed app version.
- The smallest set of steps that reproduces the problem, preferably in the fictional demo.
- What you expected and what actually happened.
- A redacted screenshot or short error message, if it helps.

Issues are public. Never include a workspace database, a full data folder, company records, personal information, provider tokens or private configuration. Avoid posting logs before checking their contents. Installation problems and model-download problems are useful reports even if you cannot open the app.

## Suggest an improvement

Use the feature request form to describe a real task, where the current experience gets in the way, and what a successful outcome would look like. A concrete example is more useful than a broad feature list. Suggestions do not create a delivery commitment.

## Improve these public materials

Pull requests for clearer instructions, accessible images, broken links and stronger verification are welcome. Keep changes focused, use fictional examples, and tie app behavior to a published release. New documentation should distinguish Mac and Windows when their behavior or verification differs.

Before submitting a change, read it as a first-time visitor: can they choose the right download, understand the preview limits and complete the next step? Check relative links and commands, and keep private source files, local data and credentials out of the patch.

## Release verification

The [release manifest](releases/preview.json) records the exact public preview assets, checksums and platform limits. Its checks require **Node.js 22 or later** for maintainers; desktop users do not need Node.js or a terminal to explore SuperBrain.

For changes to the manifest or verification tooling, run the local tests and the release metadata check from the repository root:

```sh
node --test tests/*.test.mjs
node scripts/verify-release.mjs --online
```

The metadata check compares the manifest with the public GitHub release. Maintainers can also download and hash the published asset bytes with:

```sh
node scripts/verify-release.mjs --download
```

This optional check uses the network and downloads the published assets. Passing an integrity check does not prove signing, installation success or product quality. For a single installer, use the [manual checksum instructions](docs/getting-started.md#check-your-download).

## Distribution and third-party notices

A public download repository does not make the desktop application's source open source. Runtime and model notices are supplied in [THIRD-PARTY-NOTICES.zip](https://github.com/megandmartin/superbrain-downloads/releases/download/v0.3.0-preview.1/THIRD-PARTY-NOTICES.zip) and within the packaged bundles. Preserve those notices when working with release assets.
