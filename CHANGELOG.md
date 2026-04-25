# CoStrict Change Log

> For the complete history, please visit [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)

## [2.7.5]

- Fix security-review skills subdir

## [2.7.4]

- Add copy login URL to clipboard feature in auth service
- Update Auto model message formatting processing for Costrict provider

## [2.7.3]

- Add previous checkpoint navigation controls
- Add Claude Opus 4.7 model support for Vertex AI
- Increase telemetry data limits
- Update deploy config
- Sync roocode [last commit](https://github.com/RooCodeInc/Roo-Code/commit/2bb826039b0ae509bf3dd4424c888e25b21c8543)
- Fix known issues

## [2.7.2]

- Optimize ContextSyncService with pause/resume mechanism for better performance
- Add test coverage for CLI wrap components (ContextSyncService, TerminalManager)
- Update dependencies and apply security patches including vite, drizzle-orm, and basic-ftp
- Update API provider specifications and i18n support
- Fix known issues

## [2.7.1]

- Update docs
- Add provider profile
- Add security review internationalization support and subreview mode
- Remove codebase-indexer and migrate to runtime-config
- Sync roocode [last commit](https://github.com/RooCodeInc/Roo-Code/commit/cb836567180a3ff1da6d082f3178b90c3bd22a70)
- Fix known issues

## [2.7.0]

- Optimize performance
- Optimize ChatView component rendering
- Refactor provider settings to support custom values via ContextProxy
- Fix CodeReviewService createTask mode parameter passing
- Fix known issues

## [2.6.6]

- Fix prevent stale abort requests from killing newly started commands (#1126)
- Fix terminal abort logic to ensure background processes can still be interrupted after continue (#1126)
- Fix Stop button not available during auto-approved command execution (#1126)
- Fix UI freeze on command output interruption, switch to backend-driven state transitions (#1126)
- Fix known issues

## [2.6.5]

- Add raw telemetry reporting for Costrict tasks and commits
- Update model params and i18n translations
- Fix ensure issues are loaded from cache in ReviewHistoryItem
- Fix prevent parent task state loss during orchestrator delegation
- Sync roocode [last commit](https://github.com/RooCodeInc/Roo-Code/commit/7adbfec2a4219911be28b564986011e1088e5a6d)
- Fix known issues
