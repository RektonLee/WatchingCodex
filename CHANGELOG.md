# Changelog

All notable changes to WatchingCodex will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to follow Semantic Versioning after the first stable release.

## [Unreleased]

## [0.1.0] - 2026-08-09

### Added

- Local React dashboard and same-origin Node.js bridge.
- Codex App Server thread start/resume, live events, steering, interrupts, and approvals.
- Git file list and diff inspection, including bounded untracked text previews.
- Optional `board.md` view.
- Drift signals for wide changes, deletions, large removals, dependency edits, repeated failures, and quiet turns.
- English and Simplified Chinese UI.
- Loopback-only server, origin checks, CSP, and security documentation.
- Native browser launch behavior and untracked-file diff support across Windows, WSL, macOS, and Linux.
- Cross-platform CI coverage for Ubuntu and Windows on Node.js 20 and 22.

### Security

- Updated the development dependency lockfile to resolve all known npm audit findings at release time.
