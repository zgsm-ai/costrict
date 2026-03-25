# CoStrict Change Log

> For the complete history, please visit [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)

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
