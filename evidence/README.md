# Recorded verification

[macos-runtime.json](macos-runtime.json) records a run of the [public smoke harness](../scripts/smoke-preview.mjs) against the published `v0.3.0-preview.1` Apple Silicon installer. Its artifact hash, build revision, environment and individual assertions are included in the JSON.

The file is the unmodified report from [GitHub-hosted run 41496196292](https://github.com/megandmartin/superbrain-downloads/actions/runs/41496196292), using harness commit [`e5a0588`](https://github.com/megandmartin/superbrain-downloads/commit/e5a05889dd8dfdc182d6910d2c307ac28c9066d2). That run downloaded the public installer, verified its complete bytes and passed all 15 runtime assertions on an Apple Silicon runner. The report also records the bundled and harness Node.js versions.

The run uses a new synthetic company and temporary workspace. It checks launch and session boundaries, Local mode defaults, source save/recall and persistence across a runtime restart. It does not use a real company workspace or provider credentials.

This is a recorded result, not an independent audit or a general product-quality benchmark. The [engineering guide](../docs/engineering.md) explains the architecture, tradeoffs, exact command and verification boundaries. The [separate Mac runtime workflow](../.github/workflows/mac-preview-smoke.yml) repeats the check on a hosted runner and retains its report with each run.

## Read the scopes separately

| Evidence | Scope |
| --- | --- |
| Repository tooling tests and integrity CI | The public verifier, harness safeguards, manifest and documentation links. |
| Packaged-runtime assertions | HTTP behavior of the backend inside the exact Mac installer, using synthetic data. |
| Native app, models and real-world use | These reports do not certify installation, native GUI behavior, generated-answer accuracy, microphones, Windows execution or customer outcomes. |

To reproduce a run, use the published DMG and choose a new JSON output path. The harness refuses to overwrite an existing report. The release manifest and individual assertions are more informative than a combined test count.
