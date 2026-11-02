# What the public preview supports

The current public release is [0.3.0-preview.1, published 29 October 2026](https://github.com/megandmartin/superbrain-downloads/releases/tag/v0.3.0-preview.1). It contains two platform builds with different verification coverage. This page records the boundaries of those downloads; it does not announce a new app release.

## Platform coverage

| | Apple Silicon Mac | Windows x64 |
| --- | --- | --- |
| Requirements | macOS 14 or later; M-series chip | Windows 10 or 11; Intel/AMD x64 |
| Build | Current Mac preview | Earlier Windows candidate |
| Signing | Ad-hoc signature; no Developer ID or Apple notarization | No publisher signing |
| Recorded checks | Native window, privacy controls, source answers, restart persistence and external request blocking | Packaged runtime checks for owner access, persistence, local privacy defaults, semantic search and synthetic-audio transcription |
| Local generated answers | Checked using a real local model and synthetic company records | Not verified |
| Remaining device acceptance | Wider device coverage and physical microphones | Full installation/uninstallation, local generation and physical microphones |

The Windows candidate predates the Mac model-download resume and structured-recommendation retrieval fixes. Its runtime checks do not establish parity with the Mac preview. Intel Mac builds are not available; Windows ARM has not been validated.

## Features you can explore

- A company desktop that connects decisions, priorities, people, projects and source records.
- The fictional Northstar Studio company, with synthetic data for exploring the product.
- Local keyword and semantic search, source excerpts and a connected company brain.
- Optional on-device model setup for generated answers in the current Mac preview.
- Local mode by default, with separate, explicit setup for connected services.

Review sources before acting on generated answers. Recorded synthetic checks are not a general accuracy benchmark or a real-world customer result.

## Limits to plan around

- Installers are early, unsigned distribution previews. Operating systems may warn or block them.
- Updates are manual; each installation has its own workspace and no automatic cloud sync.
- The published preview's database is not encrypted by the app.
- There is no hosted, authenticated team login or multiplayer service.
- Outside accounts and providers require separate credentials and configuration. Including a connector does not establish that a real account workflow has been verified.
- Agent profiles and proposed routines do not establish autonomous company operations.

## What a broader release still needs

Distribution signing, Apple notarization, Windows build parity, complete platform installation checks and physical microphone acceptance remain outstanding. This is a record of open release checks, without a release date or a promise that a particular platform will ship.

[Get started](getting-started.md) · [Privacy and data](privacy-and-data.md) · [Release history](../CHANGELOG.md)
