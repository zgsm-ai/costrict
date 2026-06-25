# CoStrict Change Log

> For the complete history, please visit [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)

## [3.0.10]

[CoStrict Cloud](https://zgsm.sangfor.com/cloud/workspace) is an AI-powered cloud programming workspace that lets you remotely connect to your personal devices (local or private servers) from any browser. It features conversational AI programming, project file management, multi-session persistence, and remote terminal collaboration — enabling seamless browser-based remote development, real-time AI coding and debugging, and cross-device project continuity.

<img src="./assets/images/cloud_dashboard.png" alt="More Features" width="880">

## [2.8.15]

- Enhance CoStrict code mode handling and improve error logging (#1310)
- Update IPC connection retry logic and improve session ID generation (#1309)
- Pin `@types/node-ipc` version (#1308)
- Add Qwen3 model support, lazy MCP initialization, and improve parser robustness (#1306)
- Update SSH deployment process to use private key and correct directory paths (#1299)

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
