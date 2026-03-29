# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CoStrict is a free, open-source AI-powered coding assistant (VS Code extension + CLI tool) built as a monorepo. It is a fork/descendant of Roo Code, with the extension package named `zgsm` and CLI tool named `cos`.

**Node.js 20.19.2 required.** Package manager is pnpm v10.8.1.

## Monorepo Structure

```
costrict-main/
├── src/              # VS Code extension (main workspace, named "zgsm")
├── webview-ui/       # React webview UI for the sidebar
├── packages/
│   ├── core/         # Platform-agnostic core logic
│   ├── types/        # Shared TypeScript types and Zod schemas
│   ├── cloud/        # Cloud/auth service
│   ├── evals/        # Evaluation framework
│   ├── ipc/          # Inter-process communication
│   ├── telemetry/    # Telemetry service
│   ├── build/        # Build configuration
│   ├── config-eslint/ # Shared ESLint config
│   └── config-typescript/ # Shared TypeScript config
├── apps/
│   ├── cli/          # CLI tool (cos command)
│   ├── vscode/       # VS Code extension packaging
│   ├── vscode-nightly/ # Nightly build variant
│   ├── vscode-e2e/   # End-to-end tests
│   ├── web-roo-code/ # Marketing/landing page
│   └── web-evals/    # Evals web UI
└── scripts/          # Build and deployment scripts
```

The VS Code extension entry point is `src/extension.ts`, which imports from `src/core/costrict` and registers all commands defined in `src/package.json`.

## Common Commands

```bash
pnpm install           # Install all dependencies (runs bootstrap script)
pnpm build             # Build all packages
pnpm bundle            # Build + bundle skills for distribution
pnpm vsix              # Create VSIX package (requires bundle first)
pnpm lint              # Lint all workspaces
pnpm check-types       # Type-check all workspaces
pnpm test              # Run all tests
pnpm format            # Format all files with Prettier
pnpm clean             # Remove all build artifacts
```

**Running a single test:** Navigate to the workspace (e.g., `cd src` or `cd packages/types`) and run `pnpm test` there, or use vitest directly.

**Debug the extension:** Open the root folder in VS Code and press F5 — this launches the extension in a new VS Code window using the `.vscode/launch.json` configuration.

## Key Architecture Notes

- **Settings View Pattern:** When working on `SettingsView`, inputs must bind to the local `cachedState`, NOT the live `useExtensionState()`. The `cachedState` acts as a buffer for user edits, isolating them from the `ContextProxy` source-of-truth until the user explicitly clicks "Save". Wiring inputs directly to the live state causes race conditions.

- **Bundled Skills:** Built-in skills (`.roo/skills/`) are bundled separately and downloaded at build time via `scripts/download-bundled-skills.mjs`. The `pnpm bundle` command runs this downloader before building.

- **Environment Variables:** The extension loads `.env` from the src directory at runtime for development only. Production builds do not use dotenv. The `.env.sample` file documents available variables (PostHog, Roo Code Cloud, etc.).

- **Changesets:** This project uses changesets for versioning. Create a changeset with `npx changeset` in the root, then run `pnpm changeset:version` to update versions and `changeset version` to finalize.

- **Turbo Pipeline:** All workspace tasks (`lint`, `test`, `build`, etc.) are orchestrated by Turbo. The `test` task in the `src` workspace depends on `@roo-code/types#build` to ensure types are compiled first.

- **AI SDK Providers:** The extension supports many AI providers via `@ai-sdk/*` packages and direct integrations (Anthropic, OpenAI, Google, Ollama, LM Studio, etc.). Provider selection is configured in settings.

## Codebase Naming Conventions

- VS Code extension package: `zgsm` (publisher `zgsm-ai`, display name "CoStrict")
- CLI binary: `cos`
- Package names use the `@roo-code/*` namespace (legacy from Roo Code fork)
- All VS Code commands are prefixed with `zgsm.` (e.g., `zgsm.addToContext`, `zgsm.codeReview`)
- Internal constants often reference `ROO_*` patterns due to the upstream fork
