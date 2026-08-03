---
"zgsm": patch
---

fix(task-persistence): use pure-JS `tar` package as Windows fallback for task history backup/restore

On Windows machines without `tar.exe`, the previous PowerShell `Compress-Archive`
fallback only supports `.zip` and failed when writing a `.tar.gz` backup
(`NotSupportedArchiveFileExtension`). The fallback now uses the pure-JS `tar`
package to produce a real `.tar.gz` on every platform, and the restore path falls
back to `tar.x` when the system `tar` is unavailable. GBK-encoded stderr from
Windows commands is also decoded (via iconv-lite) so error messages are readable.
