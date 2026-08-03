# CoStrict Change Log

> For the complete history, please visit [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)

## [3.0.18]

- Fix task history backup/restore on Windows by using a pure-JS `tar` fallback
- Fix command injection, path traversal, and SSRF security vulnerabilities
- Distinguish authoritative model lists from cache
- Fix known issues

## [3.0.17]

- Fix the issue of opening the browser with file links
- Fix CoStrict Cloud CSP nonce for JetBrains host script in loading page
- Optimize JetBrains webview render
- Fixed JetBrains plug-in Cloud mode getting stuck on loading page
- Fix known issues

## [3.0.16]

- Remove Gemini CLI provider
- Optimize CoStrict Cloud Model Select

## [3.0.15]

- Add multimodal support for CoStrict Cloud
- Optimize auto-approve authorization interaction for CoStrict Cloud
- Fix CoStrict Cloud workspace error with Chinese character directory paths
- Replace compromised node-ipc with community-maintained @node-ipc/node-ipc fork
- Allow extension-owned commands in Cloud UI webview executeCommand allowlist
- Fix MCP ServerRow controls shrinking in narrow panels
- Fix hidden bugs across auth, auto-complete, workflow codelens, and csCloud services
- Fix known issues

## [3.0.14]

- Add preferences for CoStrict Cloud
- Auto Refresh Auth Token for CoStrict Cloud
- Fix known issues
