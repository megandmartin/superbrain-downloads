# Get started with SuperBrain

Start with the fictional company. Explore a decision, follow its sources, and see whether this way of working fits your day.

## Choose your preview

| Your computer | Available download | What to know |
| --- | --- | --- |
| Apple Silicon Mac, macOS 14 or later | [Mac DMG](https://github.com/megandmartin/superbrain-downloads/releases/download/v0.3.0-preview.1/SuperBrain-0.3.0-mac-arm64.dmg) | Current Mac preview; local generated answers checked on Apple Silicon. |
| Windows 10 or 11, Intel/AMD x64 — **earlier preview** | [Windows EXE](https://github.com/megandmartin/superbrain-downloads/releases/download/v0.3.0-preview.1/SuperBrain-0.3.0-win-x64.exe) | Full installation, local generation and physical microphone checks remain pending. |

Both installers are unsigned distribution previews. The Mac app has an ad-hoc signature and is not Apple-notarized. Your operating system may block or warn about installation. Read the [installation guide](https://superbrain-desktop.vercel.app/install) and [preview status](preview-status.md) before proceeding. Intel Mac builds are not available; Windows ARM has not been validated.

## Your first five minutes

1. Download the file for your computer and [check its checksum](#check-your-download).
2. On Mac, open the DMG and drag SuperBrain into Applications. On Windows, run the EXE and follow its prompts. Review any operating-system warning before deciding to continue; keep system-wide security protections enabled.
3. Open SuperBrain and choose the fictional **Northstar Studio** demo. Check that **Local mode** is selected in Settings. Exploring the demo needs no account or cloud API key.
4. Open a **Needs you** decision. Read the recommendation, inspect a connected source, and record a choice in the demo. The demo's company records and activity are synthetic.
5. Open **Ask SuperBrain** and search for something from that decision. Follow the answer's sources back to their records. Local search and source excerpts work without downloading the optional generation model.

When you are ready, **Set up your company** creates a separate local workspace. It does not invite colleagues or connect outside accounts. Keep a backup before relying on any preview for your own records.

## Add local AI when you need it

In the current Mac preview, find the local AI setup in **Settings** and choose to download the model. This is a separate public download of approximately **2.5 GB**. It needs an internet connection for setup; generated answers then run on your computer. Allow several gigabytes of free disk space. Performance depends on your hardware, and answers still need review against their sources.

The Mac downloader can resume an interrupted download. The earlier Windows candidate predates that fix and the later structured-answer retrieval fixes; use its release notes when assessing what to try.

## Check your download

Download [SHA256SUMS.txt](https://github.com/megandmartin/superbrain-downloads/releases/download/v0.3.0-preview.1/SHA256SUMS.txt) from the same release. Compute the checksum of the installer you downloaded and compare it with the line for that exact filename.

On Mac, from the folder containing the DMG:

```sh
shasum -a 256 SuperBrain-0.3.0-mac-arm64.dmg
```

On Windows, from the folder containing the EXE, in PowerShell:

```powershell
Get-FileHash .\SuperBrain-0.3.0-win-x64.exe -Algorithm SHA256
```

The 64-character hash must match, ignoring letter case. If it differs, do not open that file; download a fresh copy from the release. Checksums establish that a file matches the published preview. They do not replace publisher signing, Apple notarization or installation testing.

## Keep your workspace safe

Updates are manual. Before replacing a preview, quit SuperBrain, stop connected MCP clients, and privately copy the complete workspace folder:

| Platform | Workspace folder |
| --- | --- |
| macOS | `~/Library/Application Support/SuperBrain/` |
| Windows | `%APPDATA%\SuperBrain\` |

This folder may contain records, models and configured credentials. Do not attach it to an issue. A record export is useful for portability but is not a complete workspace backup. See [privacy and data](privacy-and-data.md) for storage and removal details.

## If something gets in the way

- **The installer is blocked:** review the [platform installation guidance](https://superbrain-desktop.vercel.app/install). If you need a standard signed installation, wait for a signed release.
- **Local AI is unavailable:** check model setup and free disk space. Search and browsing remain available without the generation model.
- **You expected another device to show the same records:** each installation has its own workspace; this preview has no automatic workspace sync.
- **You found a reproducible problem:** [report a preview issue](https://github.com/megandmartin/superbrain-downloads/issues/new/choose) with your OS, app version and steps. Use fictional examples and remove private details.
