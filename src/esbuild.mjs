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

/**
 * Copy node-pty's runtime files (lib/, build/Release/*.node, package.json) into
 * dest, resolving symlinks so vsce always bundles the real files.
 *
 * node-pty cannot be bundled by esbuild (it contains native .node addons), so we
 * mark it `external` and manually vendor it into dist/node_modules/node-pty.
 * That way the packaged extension can always resolve `require('node-pty')` relative
 * to dist/extension.js regardless of how pnpm lays out its store symlinks.
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
		// Old structure: native modules are in build/Release
		path.join("build", "Release"),
		// New structure (node-pty 1.0+): native prebuilts are in prebuilds/
		// We don't copy all prebuilds in build, only extract from npm-install
		// The correct platform binary is selected at runtime by node-pty
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
		fs.rmSync(distDir, { recursive: true, force: true })
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
