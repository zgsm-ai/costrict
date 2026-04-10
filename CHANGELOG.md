# CoStrict Change Log

> For the complete history, please visit [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)

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

## [2.6.4]

- Add mention budget system to prevent context overflow
- Update workflow spec prompts to remind updating tasks.md status after coding
- Update docs
- Fix task status tracking logic
- Fix known issues

## [2.6.3]

- Improve command background execution UX (PR #1114, #1115)
- Add support for costrict CLI skills/commands (PR #1112)
- Refactor task module: separate file tree and status check logic (PR #1113)
- Refactor CLI: improve terminal scroll and navigation experience (PR #1111)
- Refactor auto-approval: enhance timeout with delay and cancel types (PR #1109)
- Add question tool v2 for enhanced interaction (PR #1108)
- Fix known issues

## [2.6.2]

- Prevent auto-scroll when editing text (PR #1106)
- Add exit handler to properly kill PTY process (PR #1103)
- Fix known issues

## [2.6.1]

- Add repository URL to API requests for better tracking and context (PR #1101)
- Fix known issues

## [2.6.0]

- **BREAKING**: Rename provider namespace from "zgsm" to "costrict" across entire codebase (PR #1091)
- Update prompts to v6 with role definitions for workflow modes and simplified prompt sections (PR #1092, #1093, #1094, #1095, #1096)
- Add custom storage path option for checkpoints (PR #1097)
- Add fixHistory to reset task history index (PR #1089)
- Add workflow spec scope and migrate cli-wrap module
- Optimize agent workflow by enabling direct completion for simple queries
- Rename experimental setting alwaysIncludeFileDetails to useKPTtree and enhance logic
- Add fallback to default base URL for provider configuration
- Add auth service error handling and token timestamp
- Update tool descriptions for improved clarity
- Update mocks and snapshots for costrict namespace migration (PR #1098)
- Update internationalization support across multiple languages
- Fix known issues
