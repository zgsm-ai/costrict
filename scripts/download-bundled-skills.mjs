/**
 * Download GitHub skills during build process using git clone (SSH)
 *
 * This script downloads skills from GitHub repositories to be bundled
 * with the extension package, ensuring users have the skills available
 * even without internet access after installation.
 *
 * Uses git SSH transport (git ls-remote + git clone).
 * Compares remote commit SHA with cached version and skips download if unchanged.
 */

import * as fs from "fs/promises"
import * as path from "path"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = path.resolve(__dirname, "..")

const bundledSkillsDir = path.join(projectRoot, "src", "bundled-skills")

const BUILD_SKILLS = [
	{
		name: "security-review",
		repo: "zgsm-ai/security-review-skill",
		branch: "main",
		subdir: "security-review",
		outputDir: "security-review",
	},
]

function git(...args) {
	const result = spawnSync("git", args, { encoding: "utf-8" })
	return {
		ok: result.status === 0,
		stdout: result.stdout?.trim() ?? "",
		stderr: result.stderr?.trim() ?? "",
	}
}

function getCloneUrl(repo) {
	return `git@github.com:${repo}.git`
}

/**
 * Get the latest commit SHA for a branch via `git ls-remote`.
 * No clone needed — lightweight remote query over SSH.
 */
function lsRemoteSha(repo, branch) {
	const cloneUrl = getCloneUrl(repo)
	const ref = `refs/heads/${branch}`
	const result = git("ls-remote", "--heads", cloneUrl, ref)
	if (!result.ok || !result.stdout) {
		return null
	}
	// Output format: "<sha>\t<ref>"
	const sha = result.stdout.split("\t")[0] ?? ""
	return sha.length >= 40 ? sha : null
}

/**
 * Read the cached commit SHA from index.json
 */
async function readCachedSha(skillName) {
	try {
		const indexPath = path.join(bundledSkillsDir, "index.json")
		const content = await fs.readFile(indexPath, "utf-8")
		const index = JSON.parse(content)
		const skill = index.skills?.find((s) => s.name === skillName)
		return skill?.commitSha ?? null
	} catch {
		return null
	}
}

/**
 * Walk directory recursively to list all files
 */
async function walk(dir, base = "") {
	let results = []
	let entries
	try {
		entries = await fs.readdir(dir, { withFileTypes: true })
	} catch {
		return []
	}
	for (const entry of entries) {
		const relativePath = base ? `${base}/${entry.name}` : entry.name
		if (entry.isDirectory()) {
			results = results.concat(await walk(path.join(dir, entry.name), relativePath))
		} else {
			results.push(relativePath)
		}
	}
	return results
}

/**
 * Get extension version from package.json
 */
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

async function downloadSkill(config) {
	const { name, repo, branch, subdir, outputDir } = config
	const cloneUrl = getCloneUrl(repo)

	console.log(`\n📦 Skill: ${name}`)
	console.log(`   From: ${cloneUrl}`)
	console.log(`   Branch: ${branch}`)

	// Step 1: Get remote commit SHA via git ls-remote (no clone)
	const remoteSha = lsRemoteSha(repo, branch)
	if (!remoteSha) {
		throw new Error(`git ls-remote failed for ${cloneUrl} (branch: ${branch})`)
	}
	console.log(`   Remote commit: ${remoteSha.slice(0, 7)}`)

	// Step 2: Compare with cached SHA — skip only if SHA matches AND cached files exist
	const cachedSha = await readCachedSha(name)
	const skillOutputDir = path.join(bundledSkillsDir, outputDir)
	const hasCachedFiles = (await walk(skillOutputDir)).length > 0
	if (cachedSha && cachedSha === remoteSha && hasCachedFiles) {
		console.log(`   ✓ Cached version matches remote, skipping download`)
		return { name, repo, branch, commitSha: remoteSha }
	}
	if (cachedSha) {
		console.log(`   Cached: ${cachedSha.slice(0, 7)} → Remote: ${remoteSha.slice(0, 7)}, updating...`)
	}

	// Step 3: Clone and extract files
	const cloneDir = path.join(bundledSkillsDir, `.clone-${name}`)

	console.log(`   git clone --depth 1 ${cloneUrl}`)

	await fs.rm(cloneDir, { recursive: true, force: true })

	const cloneResult = git("clone", "--depth", "1", "--branch", branch, cloneUrl, cloneDir)
	if (!cloneResult.ok) {
		throw new Error(`git clone failed: ${cloneResult.stderr}`)
	}

	// Copy entire subdir
	const srcDir = subdir ? path.join(cloneDir, subdir) : cloneDir
	await fs.rm(skillOutputDir, { recursive: true, force: true })
	await fs.cp(srcDir, skillOutputDir, { recursive: true })

	// Clean up clone directory
	await fs.rm(cloneDir, { recursive: true, force: true })

	// Verify SKILL.md exists
	const skillMdPath = path.join(skillOutputDir, "SKILL.md")
	try {
		await fs.access(skillMdPath)
	} catch {
		throw new Error(`Skill "${name}" missing SKILL.md`)
	}

	const fileCount = (await walk(skillOutputDir)).length
	console.log(`   ✓ ${fileCount} files copied`)
	return { name, repo, branch, commitSha: remoteSha }
}

async function main() {
	console.log("\n🚀 CoStrict - Downloading GitHub Skills for Bundling (via git SSH)\n")

	// Ensure output directory exists
	await fs.mkdir(bundledSkillsDir, { recursive: true })

	// Get extension version for index.json
	const extensionVersion = await getExtensionVersion()

	const updatedSkills = []
	let successCount = 0

	for (const config of BUILD_SKILLS) {
		try {
			const result = await downloadSkill(config)
			if (result) {
				successCount++
				updatedSkills.push(result)
			}
		} catch (err) {
			console.error(`   ✗ Failed to download ${config.name}: ${err}`)
			// Keep the old version from index.json on failure
			const cachedSha = await readCachedSha(config.name)
			if (cachedSha) {
				updatedSkills.push({
					name: config.name,
					repo: config.repo,
					branch: config.branch,
					commitSha: cachedSha,
				})
			}
		}
	}

	// Update index.json
	const indexPath = path.join(bundledSkillsDir, "index.json")
	await fs.writeFile(
		indexPath,
		JSON.stringify(
			{
				version: extensionVersion,
				skills: updatedSkills,
			},
			null,
			2,
		),
	)

	console.log(`\n✓ Downloaded ${successCount}/${BUILD_SKILLS.length} skills`)
	console.log(`✓ Output: ${bundledSkillsDir}`)
	console.log(`✓ Index version: ${extensionVersion}`)
	console.log("\n💡 These skills will be bundled with the extension\n")
}

main()
	.then(() => {
		process.exit(0)
	})
	.catch((error) => {
		console.error("Fatal error:", error)
		process.exit(1)
	})
