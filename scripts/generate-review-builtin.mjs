/**
 * Download builtin review skills from costrict-review repo and generate
 * bundled-skills directory with multi-locale support.
 *
 * Reads index.json manifest from zgsm-ai/costrict-review to discover skills
 * and their per-locale paths. Compares remote commit SHA with cached version
 * and skips download if unchanged.
 *
 * Usage: node scripts/generate-review-builtin.mjs
 */

import * as fs from "fs/promises"
import * as path from "path"
import { fileURLToPath } from "url"
import { spawnSync } from "child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..")

const bundledSkillsDir = path.join(projectRoot, "src", "bundled-skills")
const indexFilePath = path.join(bundledSkillsDir, "index.json")

const REPO = "zgsm-ai/costrict-review"
const BRANCH = "main"
const CLONE_URL = `git@github.com:${REPO}.git`

function git(...args) {
	const result = spawnSync("git", args, { encoding: "utf-8" })
	return {
		ok: result.status === 0,
		stdout: result.stdout?.trim() ?? "",
		stderr: result.stderr?.trim() ?? "",
	}
}

function lsRemoteSha() {
	const ref = `refs/heads/${BRANCH}`
	const result = git("ls-remote", "--heads", CLONE_URL, ref)
	if (!result.ok || !result.stdout) return null
	const sha = result.stdout.split("\t")[0] ?? ""
	return sha.length >= 40 ? sha : null
}

async function readCachedSha() {
	try {
		const content = await fs.readFile(indexFilePath, "utf-8")
		const index = JSON.parse(content)
		return index.commitSha ?? null
	} catch {
		return null
	}
}

async function walk(dir, base = "") {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true })
		const files = []
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name)
			const relativePath = base ? `${base}/${entry.name}` : entry.name
			if (entry.isDirectory()) {
				files.push(...(await walk(fullPath, relativePath)))
			} else {
				files.push(relativePath)
			}
		}
		return files
	} catch {
		return []
	}
}

function collectLocales(index) {
	const localeSet = new Set()
	for (const skill of index.skills) {
		for (const locale of Object.keys(skill.path)) localeSet.add(locale)
	}
	return [...localeSet].sort()
}

async function getExtensionVersion() {
	try {
		const packagePath = path.join(projectRoot, "src", "package.json")
		const content = await fs.readFile(packagePath, "utf-8")
		const pkg = JSON.parse(content)
		return pkg.version || "0.0.0"
	} catch {
		return "0.0.0"
	}
}

/**
 * Clone repo and copy each locale's skill resources into bundled-skills/{locale}/...
 */
async function cloneAndCopy(cloneDir, index) {
	const locales = collectLocales(index)

	// Clean stale locale directories (skip .clone work directory)
	for (const entry of await fs.readdir(bundledSkillsDir).catch(() => [])) {
		if (entry === ".clone" || entry === "index.json") continue
		const entryPath = path.join(bundledSkillsDir, entry)
		const stat = await fs.stat(entryPath).catch(() => null)
		if (stat?.isDirectory()) {
			await fs.rm(entryPath, { recursive: true, force: true })
		}
	}
	// Files to always exclude from bundled skills (flagged by VS Marketplace virus scan)
	const excludeFiles = new Set([
		"php_deserialization.md",
	])

	async function removeExcludedFiles(dir) {
		for (const file of excludeFiles) {
			const filePath = path.join(dir, file)
			try {
				await fs.access(filePath)
				await fs.rm(filePath)
				console.log(`   ⚠ Removed excluded file: ${filePath}`)
			} catch {
				// File not present, skip
			}
		}
	}

	for (const locale of locales) {
		for (const skill of index.skills) {
			const skillMdPath = skill.path[locale]
			if (!skillMdPath) continue

			const srcDir = path.join(cloneDir, path.dirname(skillMdPath))
			// "en/skills/security-review/SKILL.md" -> "security-review"
			const skillName = path.basename(path.dirname(skillMdPath))
			const outputDir = path.join(bundledSkillsDir, locale, skillName)

			await fs.rm(outputDir, { recursive: true, force: true })
			await fs.cp(srcDir, outputDir, { recursive: true })

			// Remove files that are flagged by VS Marketplace
			await removeExcludedFiles(outputDir)

			// Verify SKILL.md exists
			const skillMd = path.join(outputDir, "SKILL.md")
			try {
				await fs.access(skillMd)
			} catch {
				throw new Error(`Skill (${locale}/${skillName}) missing SKILL.md at ${skillMdPath}`)
			}

			const fileCount = (await walk(outputDir)).length
			console.log(`   ✓ ${locale}/skills/${skillName}: ${fileCount} files`)
		}
	}

	await fs.rm(cloneDir, { recursive: true, force: true })
	await fs.rm(cloneDir, { recursive: true, force: true })
}

async function generateIndexJson(commitSha) {
	const extensionVersion = await getExtensionVersion()

	// Discover locales and skills from bundled directory
	const locales = []
	const skillNames = []

	const entries = await fs.readdir(bundledSkillsDir).catch(() => [])
	for (const entry of entries) {
		const entryPath = path.join(bundledSkillsDir, entry)
		const stat = await fs.stat(entryPath).catch(() => null)
		if (!stat?.isDirectory() || entry.startsWith(".")) continue
		locales.push(entry)

		// Discover skill names from first locale
		if (locales.length === 1) {
			const skillDirs = await fs.readdir(entryPath).catch(() => [])
			for (const name of skillDirs) {
				const skillPath = path.join(entryPath, name)
				const skillStat = await fs.stat(skillPath).catch(() => null)
				if (skillStat?.isDirectory()) {
					skillNames.push(name)
				}
			}
		}
	}

	const indexContent = {
		version: extensionVersion,
		commitSha,
		locales,
		skills: skillNames.map((name) => ({
			name,
			repo: REPO,
			branch: BRANCH,
		})),
	}

	await fs.writeFile(indexFilePath, JSON.stringify(indexContent, null, 2), "utf-8")
	console.log(`✓ Generated ${indexFilePath}`)
}

async function main() {
	console.log("\n🚀 CoStrict - Downloading Builtin Review Skills\n")

	await fs.mkdir(bundledSkillsDir, { recursive: true })

	const remoteSha = lsRemoteSha()
	if (!remoteSha) {
		throw new Error(`git ls-remote failed for ${CLONE_URL} (branch: ${BRANCH})`)
	}
	console.log(`Remote commit: ${remoteSha.slice(0, 7)}`)

	const cachedSha = await readCachedSha()
	const hasCachedFiles = (await walk(bundledSkillsDir)).length > 0

	let commitSha = remoteSha

	if (cachedSha === remoteSha && hasCachedFiles) {
		console.log("✓ All resources up to date, skipping download")
	} else {
		if (cachedSha) {
			console.log(`Cached ${cachedSha.slice(0, 7)} → remote ${remoteSha.slice(0, 7)}, updating`)
		}
		const cloneDir = path.join(bundledSkillsDir, ".clone")
		try {
			console.log(`   git clone --depth 1 ${CLONE_URL}`)
			await fs.rm(cloneDir, { recursive: true, force: true })
			const cloneResult = git("clone", "--depth", "1", "--branch", BRANCH, CLONE_URL, cloneDir)
			if (!cloneResult.ok) {
				throw new Error(`git clone failed: ${cloneResult.stderr}`)
			}
			const raw = await fs.readFile(path.join(cloneDir, "index.json"), "utf-8")
			const index = JSON.parse(raw)
			await cloneAndCopy(cloneDir, index)
			console.log(`\n✓ All resources updated (commit ${remoteSha.slice(0, 7)})`)
		} catch (err) {
			console.error(`  ✗ Download failed: ${err}`)
			if (!hasCachedFiles) {
				throw new Error("Download failed and no cache available")
			}
			console.warn("  ⚠ Using cached resources")
			commitSha = cachedSha ?? remoteSha
		} finally {
			await fs.rm(path.join(bundledSkillsDir, ".clone"), { recursive: true, force: true }).catch(() => { })
		}
	}

	await generateIndexJson(commitSha)

	console.log(`✓ Bundled skills directory: ${bundledSkillsDir}`)
	console.log("\n💡 Run 'pnpm bundle' or 'pnpm vsix' to build the extension\n")
}

main()
	.then(() => {
		process.exit(0)
	})
	.catch((error) => {
		console.error("Fatal error:", error)
		process.exit(1)
	})
