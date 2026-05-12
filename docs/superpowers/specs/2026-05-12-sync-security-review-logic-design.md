# 同步 PR #360 的 Security-Review 逻辑

## 背景

`zgsm-sangfor/opencode` 的 PR #360 将 review 资源迁移到统一的 `zgsm-ai/costrict-review` 仓库，使用 `index.json` 清单文件和多语言支持。costrict VSCode 扩展需要对齐相同架构。

## 现状

- `scripts/download-bundled-skills.mjs` 从旧仓库 `zgsm-ai/security-review-skill` 下载
- `src/bundled-skills/index.json` 已指向 `zgsm-ai/costrict-review`，但下载脚本未使用它
- `github-skills-installer.ts` 的版本追踪仅使用 commit SHA
- `src/bundled-modes/` 目录包含 mode 配置，但没有下载脚本
- `src/shared/loadBundledModes.ts` 未被跟踪且未被引用

## 变更内容

### 1. 替换下载脚本

删除 `scripts/download-bundled-skills.mjs`，新建 `scripts/generate-review-builtin.ts`：

- 克隆 `zgsm-ai/costrict-review`（浅克隆，SSH）
- 读取 `index.json` 清单文件，发现 skill 和各语言路径
- 下载 `en` 和 `zh-CN` 两种语言
- 输出到 `src/bundled-skills/{locale}/{skillName}/`
- 生成 `src/bundled-skills/index.json`，包含 `{ version, commitSha, locales, skills }` 字段
- 缓存机制：对比远程 SHA 与本地缓存，未变化则跳过下载
- 使用 `tsx` 运行

### 2. 更新 package.json 脚本

将 `node scripts/download-bundled-skills.mjs` 改为 `tsx scripts/generate-review-builtin.ts`，涉及：

- 根目录 `package.json`（bundle, bundle:nightly, vsix, vsix:nightly）
- `src/package.json`（vscode:prepublish）

### 3. 更新 github-skills-installer.ts

- 版本追踪格式改为 `commitSha:locale`（例如 `d2bc918:zh-CN`）
- `needsUpdate()` 对比完整的 `commitSha:locale` 字符串
- `writeVersionFile()` 写入 `commitSha:locale`
- 安装时从配置读取 locale，从 `src/bundled-skills/{locale}/{skillName}/` 复制

### 4. 删除 bundled-modes

- 删除 `src/bundled-modes/` 目录（review/, subverify/, index.json）
- 删除 `src/shared/loadBundledModes.ts`
- 无代码引用这些文件，无需其他改动

### 5. 更新 bundled-skills/index.json 格式

脚本运行后的新格式：

```json
{
	"version": "2.8.0",
	"commitSha": "d2bc918...",
	"locales": ["en", "zh-CN"],
	"skills": [{ "name": "security-review", "repo": "zgsm-ai/costrict-review", "branch": "main" }]
}
```

## 文件变更汇总

| 操作 | 文件                                             |
| ---- | ------------------------------------------------ |
| 删除 | `scripts/download-bundled-skills.mjs`            |
| 新建 | `scripts/generate-review-builtin.ts`             |
| 修改 | `package.json`（脚本命令）                       |
| 修改 | `src/package.json`（vscode:prepublish）          |
| 修改 | `src/services/skills/github-skills-installer.ts` |
| 删除 | `src/bundled-modes/`（整个目录）                 |
| 删除 | `src/shared/loadBundledModes.ts`                 |
| 生成 | `src/bundled-skills/index.json`                  |
| 生成 | `src/bundled-skills/{en,zh-CN}/security-review/` |

## 不变的部分

- `src/core/costrict/code-review/` — 代码审查服务逻辑
- `src/core/prompts/sections/modes.ts` — 提示词中的 mode 过滤逻辑
- 用户设置目录中的 mode 配置加载（非 bundled）
