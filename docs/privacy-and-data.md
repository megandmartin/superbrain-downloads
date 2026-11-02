# Privacy and your local workspace

This guide describes the public **0.3.0 desktop previews**. It distinguishes local storage from the outside services you can choose to connect. The [website privacy page](https://superbrain-desktop.vercel.app/privacy) has the same product boundaries.

## What stays local

Company records, search indexes, preferences and downloaded models live in the desktop app's workspace folder:

| Platform | Workspace folder |
| --- | --- |
| macOS | `~/Library/Application Support/SuperBrain/` |
| Windows | `%APPDATA%\SuperBrain\` |

The installers contain no private company database or credentials. Demo company records are fictional. A development browser copy has separate storage from the installed desktop app.

The published preview's workspace database is **not encrypted by the app**. Protect your computer account and use device encryption and backups appropriate for the information you keep. Operating-system backups and synced folders may copy files elsewhere independently of SuperBrain.

## Local mode and Connected mode

| Mode | What it means |
| --- | --- |
| **Local mode**, selected by default | Blocks cloud AI calls, external connector requests, external memory services and external MCP access. Search runs locally. |
| **Connected mode**, explicit opt-in | Allows the providers and connections you configure, subject to their permissions. Relevant questions, record content or import requests may go to those services under their privacy terms. |

Switching back to Local mode blocks new external calls and cancels active cloud requests where supported. It cannot retrieve information already sent to another service.

MCP access is scoped and revocable. A connected AI client can send information it reads to its own model provider. A local MCP connection alone does not establish that the other tool processes data offline.

## Models and voice

The optional Qwen generation model is a separate public download of approximately 2.5 GB. Choosing that download requests a model file, without company records. Once setup is complete, the Mac preview can generate answers on-device. Local search does not require this generation model.

Voice recording begins when you use the microphone control and is transcribed locally. Physical microphone behavior has not been verified across supported devices. The earlier Windows candidate has narrower verification, including pending local generation checks. See [preview status](preview-status.md).

## Backup, updates and removal

- **Back up:** quit the app and stop connected MCP clients, then copy the complete workspace folder to a private backup. It can contain credentials if you configured connections. A portable record export excludes credentials, grants and audit history and is not a full backup.
- **Update:** install a newer preview manually after reading its release notes and making a backup. This release has no automatic update service or automatic workspace sync.
- **Remove the app:** uninstalling or replacing the application may leave the workspace folder behind.
- **Remove local data:** quit the app and stop connected clients, save anything you want to keep, then delete the workspace folder. Manage copies in backups and any data deliberately sent to connected services separately.

The preview is a local company workspace. It does not provide a hosted, authenticated team service.

## Website, downloads and public reports

The download website is hosted on Vercel; release files are hosted on GitHub. Those services receive ordinary request information, such as IP address and requested files, under their own privacy policies. The website adds no advertising trackers, account forms or analytics scripts and does not receive your desktop workspace.

Read [Vercel's privacy policy](https://vercel.com/legal/privacy-policy) and [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

GitHub issues are public. Share reproduction steps using fictional records. Remove company names, personal information, tokens and credentials from screenshots or logs; never attach a workspace database, full data folder or private configuration.
