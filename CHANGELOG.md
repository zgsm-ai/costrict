# CoStrict Change Log

> For the complete history, please visit [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)

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

## [2.5.3]

- Enhance CoStrict CLI UX with improved terminal management and user interface
- Add InlineToast component for better notification display
- Add LoadingView component for improved loading state visualization
- Update experimental settings with new configuration options
- Enhance internationalization support across multiple languages
- Update automatic model fallback
- Update docs
- Fix known issues

## [2.5.2]

- Optimize startup performance
- Add loading screen with logo animation and improve fuzzy matching
- Fix known issues

## [2.5.1]

- Fix CoStrict CLI shell fallback detection on Windows and improve terminal rendering (PR #1081)
- Update node-pty dependency and bundle local builds correctly
- Fix known issues

## [2.5.0]

- Enhance CoStrict CLI integration with embedded terminal support, improved context synchronization, and better clipboard paste handling (PR #1079, #1075, #1076)
- Redesign and modernize README documentation with updated layout and styling (PR #1074, #1077, #1078)
- Update download-bundled-skills script to include new skills and improve warning messages
- Fix known issues

## [2.4.9]

- Refactor: restructure modeSlugs into metadata object for better skill management (PR #1072)
- Refactor: standardize CoStrict role definitions and reorganize prompt structure (PR #1071)
- Fix known issues

## [2.4.8]

- Optimize context management with conservative reservedTokens calculation for models with large max output tokens
- Add ZgsmCodeMode type and mode filtering for better mode selection control
- Refactor file ignore patterns and improve list-files service
- Update provider handling and error management
- Fix Agent internationalization
- Sync roocode [last commit](https://github.com/RooCodeInc/Roo-Code/commit/137d3f4fd8a1195bd2a2f228b00c58683e0e77b8)
- Fix known issues

## [2.4.7]

- Add security code scanning
- Fix known issues
