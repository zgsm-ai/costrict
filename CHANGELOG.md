# CoStrict Change Log

> For the complete history, please visit [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)

## [2.8.14]

- Implement `disableSwitchMode` functionality to restrict tool usage in strict mode (#1291)
- Fix correct path resolution for cospec metadata update (#1292)
- Add EXDEV fallback strategy to `safeWriteJson` for cross-device rename handling (#1293)
- Remove redundant 0 in model list (#1295)

## [2.8.13]

- Add exclusion for additional bundled skill files in review generation (#1285)
- Guard axios socket keepalive call (#1283)
- Fix known issues

## [2.8.12]

- Add timeout option to CoStrict model fetching and caching (#1276)
- Migrate pnpm config to workspace yaml and apply security overrides (#1273)
- Fix vitest Mock type compatibility and add missing node types (#1273)
- Add built-in skills notification
- Fix known issues

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
