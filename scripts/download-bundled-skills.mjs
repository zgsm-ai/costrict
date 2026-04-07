/**
 * Download GitHub skills during build process using git clone (SSH)
 *
 * This script downloads skills from GitHub repositories to be bundled
 * with the extension package, ensuring users have the skills available
 * even without internet access after installation.
 *
 * Uses SSH-based git clone instead of HTTPS API for authentication.
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { exec as execCallback } from "child_process"
import { promisify } from "util"
import { fileURLToPath } from "url"
import { dirname } from "path"

const exec = promisify(execCallback)

// Get project root directory (parent of scripts directory)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = path.dirname(__dirname)

/**
 * Skills to download during build
 */
const BUILD_SKILLS = [
	{
		name: "security-review",
		repo: "zgsm-ai/security-review-skill",
		branch: "main",
		subdir: "security-review", // Skill files are in this subdirectory
		outputDir: "security-review",
	},
]

/**
 * Check if git is installed and accessible
 */
async function checkGitInstalled() {
	try {
		await exec("git --version")
		return true
	} catch {
		return false
	}
}

/**
 * Execute git command with timeout
 */
async function execGit(command, cwd, timeoutMs = 60000) {
	try {
		const result = await exec(command, {
			cwd,
			timeout: timeoutMs,
			encoding: "utf-8",
		})
		return { success: true, stdout: result.stdout, stderr: result.stderr }
	} catch (error) {
		return {
			success: false,
			stdout: error.stdout || "",
			stderr: error.stderr || error.message,
		}
	}
}

/**
 * Get latest commit SHA from remote using git ls-remote
 * Returns commit SHA string or null if failed
 */
async function fetchLatestCommitSha(repo, branch) {
	const sshUrl = `git@github.com:${repo}.git`
	const command = `git ls-remote ${sshUrl} refs/heads/${branch}`

	console.log(`  Checking remote commit SHA via git ls-remote...`)
	const result = await execGit(command, projectRoot, 10000)

	if (!result.success) {
		console.error(`    ⚠ git ls-remote failed: ${result.stderr}`)
		return null
	}

	// Parse output: "sha\trefs/heads/branch"
	const lines = result.stdout.trim().split("\n")
	if (lines.length === 0 || !lines[0]) {
		return null
	}

	const match = lines[0].match(/^([a-f0-9]{40})\t/)
	return match ? match[1] : null
}

/**
 * Clone repository to temporary directory
 * Returns path to cloned directory or null if failed
 */
async function cloneRepository(repo, branch, tempDir) {
	const sshUrl = `git@github.com:${repo}.git`
	const cloneDir = path.join(tempDir, repo.replace("/", "-"))

	console.log(`  Cloning repository via SSH...`)
	console.log(`    URL: ${sshUrl}`)
	console.log(`    Branch: ${branch}`)

	// Remove existing clone directory if exists
	try {
		await fs.rm(cloneDir, { recursive: true, force: true })
	} catch {
		// Directory might not exist, that's fine
	}

	// Clone with depth 1 for efficiency (we only need latest commit)
	const command = `git clone --depth 1 --branch ${branch} ${sshUrl} ${cloneDir}`
	const result = await execGit(command, tempDir, 120000) // 2 minute timeout for clone

	if (!result.success) {
		console.error(`    ✗ Clone failed: ${result.stderr}`)

		// Check for SSH authentication errors
		if (result.stderr.includes("Permission denied") || result.stderr.includes("Host key verification failed")) {
			console.error(`    ⚠ SSH authentication failed. Please ensure SSH key is configured.`)
		}

		return null
	}

	console.log(`    ✓ Repository cloned successfully`)
	return cloneDir
}

/**
 * Get commit SHA from cloned repository
 */
async function getLocalCommitSha(cloneDir) {
	const result = await execGit("git rev-parse HEAD", cloneDir, 5000)
	if (!result.success) {
		return null
	}
	return result.stdout.trim()
}

/**
 * Read skill metadata from cloned repository's index.json
 * Returns { name, description, files, commitSha } or null if failed
 */
async function readSkillMetadata(cloneDir, subdir) {
	try {
		const indexPath = path.join(cloneDir, "index.json")
		const content = await fs.readFile(indexPath, "utf-8")
		const indexData = JSON.parse(content)

		const skill = indexData.skills?.[0]
		if (!skill) {
			console.error(`    ✗ No skill found in index.json`)
			return null
		}

		// Get commit SHA from local clone
		const commitSha = await getLocalCommitSha(cloneDir)

		return {
			name: skill.name,
			description: skill.description,
			files: skill.files || [],
			commitSha,
		}
	} catch (error) {
		console.error(`    ✗ Failed to read index.json: ${error.message}`)
		return null
	}
}

/**
 * Copy skill files from cloned repository to output directory
 */
async function copySkillFiles(cloneDir, skillConfig, skillOutputDir) {
	const { subdir, files } = skillConfig
	const pathPrefix = subdir ? `${subdir}/` : ""

	console.log(`  Copying ${files.length} files...`)

	// Clean up existing skill directory to ensure fresh install
	try {
		await fs.rm(skillOutputDir, { recursive: true, force: true })
		console.log(`    ✓ Cleaned existing directory`)
	} catch {
		// Directory might not exist, that's fine
	}

	// Create output directory
	await fs.mkdir(skillOutputDir, { recursive: true })

	// Copy each file
	for (const file of files) {
		const sourcePath = path.join(cloneDir, pathPrefix, file)
		const targetPath = path.join(skillOutputDir, file)

		// Create parent directories
		await fs.mkdir(path.dirname(targetPath), { recursive: true })

		try {
			await fs.copyFile(sourcePath, targetPath)
			console.log(`    ✓ ${file}`)
		} catch (error) {
			console.error(`    ✗ Failed to copy ${file}: ${error.message}`)
			return false
		}
	}

	return true
}

/**
 * Update SKILL.md frontmatter to ensure proper activation
 * - Uses name and description from index.json
 * - Sets modeSlugs to security-review for mode-specific activation
 */
async function updateSkillFrontmatter(skillOutputDir, skillMetadata) {
	const skillMdPath = path.join(skillOutputDir, "SKILL.md")
	try {
		let content = await fs.readFile(skillMdPath, "utf-8")

		// Use metadata from index.json
		const { name, description } = skillMetadata

		// Find the end of first frontmatter block
		const frontmatterEnd = content.indexOf("---", 3)

		if (frontmatterEnd !== -1) {
			// Extract body content after frontmatter
			const bodyContent = content.slice(frontmatterEnd + 3)

			// Build clean frontmatter (no extra blank lines)
			const newFrontmatter = `name: ${name}
description: ${description}
metadata:
 modeSlugs:
  - security-review`

			// Reconstruct file with clean frontmatter
			content = `---\n${newFrontmatter}\n---${bodyContent}`
		}

		await fs.writeFile(skillMdPath, content, "utf-8")
		console.log(`    ✓ Updated SKILL.md frontmatter (name: ${name}, metadata.modeSlugs: security-review)`)
	} catch (error) {
		console.error(`    ⚠ Warning: Could not update SKILL.md: ${error.message}`)
	}
}

/**
 * Download a single skill using git clone
 * Returns { name, repo, branch, commitSha } or null if failed
 */
async function downloadSkill(config, outputBaseDir, tempDir) {
	const { name, repo, branch, subdir, outputDir } = config

	console.log(`\n📦 Downloading skill: ${name}`)
	console.log(`   From: git@github.com:${repo}.git`)
	console.log(`   Branch: ${branch}`)
	if (subdir) {
		console.log(`   Subdir: ${subdir}`)
	}

	// Clone repository
	const cloneDir = await cloneRepository(repo, branch, tempDir)
	if (!cloneDir) {
		return null
	}

	try {
		// Read skill metadata from cloned repository
		console.log(`  Reading skill metadata from cloned repository...`)
		const skillMetadata = await readSkillMetadata(cloneDir, subdir)
		if (!skillMetadata) {
			console.error(`   ✗ Failed to read skill metadata`)
			return null
		}

		const { commitSha, files, ...metadata } = skillMetadata
		console.log(`  Found ${files.length} files to copy`)
		console.log(`  Skill name: ${metadata.name}`)
		console.log(`  Description: ${metadata.description.substring(0, 80)}...`)
		if (commitSha) {
			console.log(`  Commit: ${commitSha.slice(0, 7)}`)
		}

		// Create output directory
		const skillOutputDir = path.join(outputBaseDir, outputDir)

		// Copy skill files
		const copySuccess = await copySkillFiles(cloneDir, { ...config, files }, skillOutputDir)
		if (!copySuccess) {
			return null
		}

		// Update SKILL.md frontmatter using metadata from index.json
		await updateSkillFrontmatter(skillOutputDir, metadata)

		console.log(`   ✓ Skill ${name} downloaded successfully`)

		return {
			name,
			repo,
			branch,
			commitSha,
		}
	} finally {
		// Clean up cloned directory
		try {
			await fs.rm(cloneDir, { recursive: true, force: true })
			console.log(`  ✓ Cleaned up temporary clone directory`)
		} catch (error) {
			console.error(`  ⚠ Warning: Failed to clean up ${cloneDir}: ${error.message}`)
		}
	}
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

/**
 * Load local index.json if exists
 * Returns parsed object or null
 */
async function loadLocalIndex(outputDir) {
	try {
		const indexPath = path.join(outputDir, "index.json")
		const content = await fs.readFile(indexPath, "utf-8")
		return JSON.parse(content)
	} catch {
		return null
	}
}

/**
 * Check if skill needs update by comparing commit SHA
 * Returns { needsUpdate: boolean, metadata: object | null, commitSha: string | null }
 */
async function checkSkillUpdate(skillConfig, localIndex) {
	// Find local skill info
	const localSkill = localIndex?.skills?.find((s) => s.name === skillConfig.name)
	const localCommitSha = localSkill?.commitSha || null

	// Fetch latest commit SHA from remote
	console.log(`  Checking ${skillConfig.name} for updates...`)
	const latestCommitSha = await fetchLatestCommitSha(skillConfig.repo, skillConfig.branch)

	if (!latestCommitSha) {
		console.error(`    ✗ Failed to fetch commit SHA, skipping`)
		return { needsUpdate: false, metadata: null, commitSha: null }
	}

	// Compare commit SHAs
	if (localCommitSha === latestCommitSha) {
		console.log(`    ✓ Up to date (commit: ${latestCommitSha.slice(0, 7)})`)
		return { needsUpdate: false, metadata: localSkill, commitSha: latestCommitSha }
	}

	console.log(`    → Update available (${localCommitSha?.slice(0, 7) || "none"} → ${latestCommitSha.slice(0, 7)})`)
	return { needsUpdate: true, metadata: null, commitSha: latestCommitSha }
}

/**
 * Main function
 */
async function main() {
	console.log("\n🚀 CoStrict - Downloading GitHub Skills for Bundling (via git clone SSH)\n")

	// Check git installation
	console.log("🔍 Checking prerequisites...")
	const gitInstalled = await checkGitInstalled()
	if (!gitInstalled) {
		console.error("✗ git is not installed or not accessible")
		process.exit(1)
	}
	console.log("  ✓ git is installed")

	const outputDir = path.join(projectRoot, "src", "bundled-skills")

	// Get extension version for index.json
	const extensionVersion = await getExtensionVersion()

	// Load local index to check for updates
	const localIndex = await loadLocalIndex(outputDir)

	// Ensure output directory exists
	await fs.mkdir(outputDir, { recursive: true })

	// Create temporary directory for cloning
	const tempDir = path.join(projectRoot, ".temp-skills")
	await fs.mkdir(tempDir, { recursive: true })

	try {
		// Phase 1: Check all skills for updates first
		console.log("\n🔍 Phase 1: Checking for updates...")
		const updateChecks = []
		for (const skillConfig of BUILD_SKILLS) {
			const check = await checkSkillUpdate(skillConfig, localIndex)
			updateChecks.push({ skillConfig, check })
		}

		// Filter skills that actually need updating
		const skillsToUpdate = updateChecks.filter(({ check }) => check.needsUpdate)
		const skillsToSkip = updateChecks.filter(({ check }) => !check.needsUpdate)

		console.log(`\n📊 Summary: ${skillsToUpdate.length} updates, ${skillsToSkip.length} up-to-date`)

		if (skillsToUpdate.length === 0) {
			console.log("\n✓ All skills are up to date, nothing to download")
			return
		}

		// Phase 2: Download only skills that need updating
		console.log("\n📥 Phase 2: Downloading updates...")
		let successCount = 0
		const updatedSkills = []

		// Start with skills that are up to date
		for (const { skillConfig, check } of skillsToSkip) {
			if (check.metadata) {
				updatedSkills.push({
					name: check.metadata.name,
					repo: skillConfig.repo,
					branch: skillConfig.branch,
					commitSha: check.commitSha,
				})
			}
		}

		// Download updated skills
		for (const { skillConfig } of skillsToUpdate) {
			try {
				const result = await downloadSkill(skillConfig, outputDir, tempDir)
				if (result) {
					successCount++
					updatedSkills.push(result)
				}
			} catch (error) {
				console.error(`   ✗ Failed to download ${skillConfig.name}: ${error}`)
				// Keep the old version on failure
				const localSkill = localIndex?.skills?.find((s) => s.name === skillConfig.name)
				if (localSkill) {
					updatedSkills.push(localSkill)
				}
			}
		}

		// Update index file
		const indexPath = path.join(outputDir, "index.json")
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

		console.log(`\n✓ Downloaded ${successCount}/${skillsToUpdate.length} updates`)
		console.log(`✓ Total skills: ${updatedSkills.length}`)
		console.log(`✓ Output: ${outputDir}`)
		console.log(`✓ Index version: ${extensionVersion}`)
		console.log("\n💡 These skills will be bundled with the extension\n")
	} finally {
		// Clean up temporary directory
		try {
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
	}
}

main()
	.then(() => {
		process.exit(0)
	})
	.catch((error) => {
		console.error("Fatal error:", error)
		process.exit(1)
	})
