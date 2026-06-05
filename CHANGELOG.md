# CoStrict Change Log

> For the complete history, please visit [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)

## [2.8.11]

- Maintenance release with documentation updates
- Optimize model list refresh (#1268)

## [2.8.10]

- Add third-party skill support
- Revert external tool bootstrapper and related commands
- Recover `refreshOnDiskCacheHit` option for model fetching and caching

## [2.8.8]

- Add external tool sync for remote development environments (#1258)
- Defer ExternalToolSync startup, add skills polling, and handle 404 version errors (#1261)
- Fix known issues

## [2.8.7]

- Ensure MCP and Skills Managers are initialized properly in providers (#1251)
- Fix DeepSeek 'reasoning_content' error

## [2.8.6]

- Update generate-review-builtin script

## [2.8.5]

- MCP support async poll for improved performance (#1235)
- Fix fake_reasoning empty text handling and warn on empty chunks (#1239)
- Migrate review skills to costrict-review repo with multi-locale support (#1236)
- Telemetry API clients support additional headers (#1226)

## [2.8.4]

- Add reload webview command and error boundary reload button for `Gray Screen`

## [2.8.3]

- Add Xiaomi MiMo provider support
- Fix `Could not find ripgrep binary`
- Fix known issues
