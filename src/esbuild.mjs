import * as esbuild from "esbuild"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import process from "node:process"
import * as console from "node:console"

import { copyPaths, copyWasms, copyLocales, setupLocaleWatcher } from "@roo-code/build"
import { networkInterfacesCompatible } from "../scripts/network-interfaces-compatible.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function removeDirWithRetries(dirPath, retries = 5, retryDelayMs = 200) {
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			await fs.promises.rm(dirPath, { recursive: true, force: true })
			return
		} catch (error) {
			const isRetryable = error?.code === "ENOTEMPTY" || error?.code === "EBUSY" || error?.code === "EPERM"
			const isLastAttempt = attempt === retries

			if (!isRetryable || isLastAttempt) {
				throw error
			}

			await new Promise((resolve) => globalThis.setTimeout(resolve, retryDelayMs * (attempt + 1)))
		}
	}
}

/**
 * Copy node-pty's runtime files (lib/, package.json, prebuilds/) into dest,
 * resolving symlinks so vsce always bundles the real files.
 *
 * node-pty cannot be bundled by esbuild (it contains native .node addons) so we
 * mark it `external` and manually vendor it into dist/node_modules/node-pty.
 * That way the packaged extension can always resolve `require('node-pty')` relative
 * to dist/extension.js regardless of how pnpm lays out its store symlinks.
 *
 * If a locally compiled pty.node exists in build/Release/ (e.g. from running
 * `pnpm build:native` on Linux), it is promoted into prebuilds/{platform}-{arch}/
 * so that all platforms are handled uniformly through the prebuilds/ directory.
 *
 * @param {string} src  Resolved (real) path to the node-pty package root.
 * @param {string} dest Target directory – typically dist/node_modules/node-pty.
 */
function copyNodePty(src, dest) {
	// Directories/files inside node-pty that are needed at runtime.
	// Support both old (build/Release) and new (prebuilds) directory structures.
	const items = [
		"lib",
		"package.json",
		// node-pty 1.0+ uses prebuilds/ for platform-specific native modules.
		// build/Release/ is NOT copied directly; instead, if a locally compiled
		// pty.node exists in build/Release/, it is promoted into
		// prebuilds/{platform}-{arch}/ below so all platforms are handled
		// uniformly via the prebuilds/ directory.
	]

	for (const item of items) {
		const srcItem = path.join(src, item)
		const destItem = path.join(dest, item)

		if (!fs.existsSync(srcItem)) {
			continue
		}

		fs.mkdirSync(path.dirname(destItem), { recursive: true })

		const stat = fs.statSync(srcItem)
		if (stat.isDirectory()) {
			// Recursively copy directory, following symlinks.
			copyDirSync(srcItem, destItem)
		} else {
			fs.copyFileSync(srcItem, destItem)
		}
	}

	// Copy prebuilds directory if it exists (platform-specific native modules)
	// This is needed for node-pty 1.0+ which uses prebuilt binaries
	const prebuildsSrc = path.join(src, "prebuilds")
	if (fs.existsSync(prebuildsSrc)) {
		const prebuildsDest = path.join(dest, "prebuilds")
		copyDirSync(prebuildsSrc, prebuildsDest)
		console.log(`[node-pty] Copied prebuilds from ${prebuildsSrc}`)
	}

	// If a locally compiled pty.node exists in build/Release/ (e.g. from
	// `pnpm build:native`), promote it into prebuilds/{platform}-{arch}/ so
	// that node-pty's runtime loader can find it. This is essential for
	// platforms like linux-x64 / linux-arm64 where npm may not ship prebuilt
	// binaries.
	const buildReleaseSrc = path.join(src, "build", "Release")
	if (fs.existsSync(path.join(buildReleaseSrc, "pty.node"))) {
		const prebuildPlatformDir = path.join(dest, "prebuilds", `${process.platform}-${process.arch}`)
		fs.mkdirSync(prebuildPlatformDir, { recursive: true })
		fs.copyFileSync(
			path.join(buildReleaseSrc, "pty.node"),
			path.join(prebuildPlatformDir, "pty.node"),
		)
		// Also copy spawn-helper if present (needed on Unix platforms)
		const spawnHelper = path.join(buildReleaseSrc, "spawn-helper")
		if (fs.existsSync(spawnHelper)) {
			fs.copyFileSync(spawnHelper, path.join(prebuildPlatformDir, "spawn-helper"))
		}
		console.log(`[node-pty] Promoted build/Release to prebuilds/${process.platform}-${process.arch}`)
	}

	console.log(`[node-pty] Copied runtime files to ${dest}`)
}

/**
 * Recursively copy a directory, following symlinks (i.e. copying the target
 * content rather than the symlink itself).
 *
 * @param {string} src
 * @param {string} dest
 */
function copyDirSync(src, dest) {
	fs.mkdirSync(dest, { recursive: true })
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name)
		const destPath = path.join(dest, entry.name)
		// Follow symlinks by using stat (not lstat).
		const stat = fs.statSync(srcPath)
		if (stat.isDirectory()) {
			copyDirSync(srcPath, destPath)
		} else {
			fs.copyFileSync(srcPath, destPath)
		}
	}
}

async function main() {
	const name = "extension"
	const production = process.argv.includes("--production")
	const watch = process.argv.includes("--watch")
	const minify = production
	const sourcemap = !production // Always generate source maps for error handling.

	const buildTime = new Date().toISOString()

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const buildOptions = {
		bundle: true,
		minify,
		sourcemap,
		logLevel: "silent",
		format: "cjs",
		sourcesContent: false,
		platform: "node",
		define: {
			"process.env.NODE_ENV": production ? '"production"' : '"development"',
			"process.env.COSTRICT_PUBLIC_KEY": JSON.stringify(process.env.COSTRICT_PUBLIC_KEY || process.env.ZGSM_PUBLIC_KEY || ""),
			"process.env.COSTRICT_PKG_BUILD_TIME": JSON.stringify(buildTime),
		},
		banner: {
			js: networkInterfacesCompatible,
		},
	}

	const srcDir = __dirname
	const buildDir = __dirname
	const distDir = path.join(buildDir, "dist")

	if (fs.existsSync(distDir)) {
		console.log(`[${name}] Cleaning dist directory: ${distDir}`)
		await removeDirWithRetries(distDir)
	}

	/**
	 * @type {import('esbuild').Plugin[]}
	 */
	const plugins = [
		{
			name: "copyFiles",
			setup(build) {
				build.onEnd(() => {
					copyPaths(
						[
							["../README.md", "README.md"],
							["../CHANGELOG.md", "CHANGELOG.md"],
							["../LICENSE", "LICENSE"],
							["../.env", ".env", { optional: true }],
							["node_modules/vscode-material-icons/generated", "assets/vscode-material-icons"],
							["../webview-ui/audio", "webview-ui/audio"],
						],
						srcDir,
						buildDir,
					)

					// node-pty must be copied to dist/node_modules/node-pty so that the
					// bundled extension.js can require('node-pty') at runtime.
					// In pnpm workspaces, node-pty is a symlink; we resolve it here so
					// that vsce bundles the real files instead of a broken symlink.
					const nodePtySrc = fs.realpathSync(path.join(srcDir, "node_modules", "node-pty"))
					const nodePtyDest = path.join(distDir, "node_modules", "node-pty")
					copyNodePty(nodePtySrc, nodePtyDest)
				})
			},
		},
		{
			name: "copyWasms",
			setup(build) {
				build.onEnd(() => copyWasms(srcDir, distDir))
			},
		},
		{
			name: "copyLocales",
			setup(build) {
				build.onEnd(() => copyLocales(srcDir, distDir))
			},
		},
		{
			name: "esbuild-problem-matcher",
			setup(build) {
				build.onStart(() => console.log("[esbuild-problem-matcher#onStart]"))
				build.onEnd((result) => {
					result.errors.forEach(({ text, location }) => {
						console.error(`✘ [ERROR] ${text}`)
						if (location && location.file) {
							console.error(`    ${location.file}:${location.line}:${location.column}:`)
						}
					})

					console.log("[esbuild-problem-matcher#onEnd]")
				})
			},
		},
	]

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const extensionConfig = {
		...buildOptions,
		plugins,
		entryPoints: ["extension.ts"],
		outfile: "dist/extension.js",
		// global-agent must be external because it dynamically patches Node.js http/https modules
		// which breaks when bundled. It needs access to the actual Node.js module instances.
		// undici must be bundled because our VSIX is packaged with `--no-dependencies`.
		// node-pty must be external because it contains native .node modules that cannot be bundled.
		external: ["vscode", "esbuild", "global-agent", "node-pty"],
	}

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const workerConfig = {
		...buildOptions,
		entryPoints: ["workers/countTokens.ts"],
		outdir: "dist/workers",
	}

	const [extensionCtx, workerCtx] = await Promise.all([
		esbuild.context(extensionConfig),
		esbuild.context(workerConfig),
	])

	if (watch) {
		await Promise.all([extensionCtx.watch(), workerCtx.watch()])
		copyLocales(srcDir, distDir)
		setupLocaleWatcher(srcDir, distDir)
	} else {
		await Promise.all([extensionCtx.rebuild(), workerCtx.rebuild()])
		await Promise.all([extensionCtx.dispose(), workerCtx.dispose()])
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
