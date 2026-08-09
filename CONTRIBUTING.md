# Contributing to WatchingCodex

Thanks for helping make coding agents easier to observe and control.

## Before opening a change

- Search existing issues and discussions.
- Keep the project local-first. New hosted dependencies need a clear user benefit and an explicit privacy story.
- Preserve Codex-native semantics instead of flattening every event into terminal text.
- Do not add features that bypass Codex sandbox or approval policy.
- For substantial behavior or protocol changes, open an issue first so the interaction can be discussed before implementation.

## Development setup

Requirements: Node.js 20.19+, Git, and Codex CLI for manual integration testing.

```bash
npm install
npm run dev -- /path/to/a/test/workspace
```

The frontend runs on `127.0.0.1:5173`; the local bridge runs on `127.0.0.1:7331`.

## Checks

Run the full local gate before opening a pull request:

```bash
npm run check
```

Changes to App Server event handling should include a focused Node test in `tests/`. UI changes should remain keyboard accessible and usable at the responsive breakpoints in `src/styles.css`.

## Pull requests

Keep pull requests focused and explain:

- what changed;
- why users need it;
- any security or privacy impact;
- how you tested it;
- screenshots for material UI changes.

Use Conventional Commit-style subjects when practical, for example `feat: group verification results` or `fix: preserve paths containing spaces`.

## Project principles

1. Evidence over simulated thinking.
2. Intervention must be immediate and unambiguous.
3. Local by default; remote only with explicit authentication.
4. Safe recovery beats magical rollback.
5. A small understandable bridge is a feature.
