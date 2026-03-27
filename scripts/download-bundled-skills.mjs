/**
 * Download GitHub skills during build process
 *
 * This script downloads skills from GitHub repositories to be bundled
 * with the extension package, ensuring users have the skills available
 * even without internet access after installation.
 */

import * as https from "https"
import * as fs from "fs/promises"
import * as path from "path"
import { pipeline } from "stream/promises"
import { createWriteStream } from "fs"
import { fileURLToPath } from "url"
import { dirname } from "path"

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
 * Download a single file from URL
 */
async function downloadFile(url, destinationPath) {
	console.log(`  Downloading: ${path.basename(destinationPath)}`)

	return new Promise((resolve) => {
		const file = createWriteStream(destinationPath)

		https
			.get(url, {
				headers: {
					"User-Agent": "CoStrict-Build",
				},
			})
			.on("response", (response) => {
				if (response.statusCode !== 200) {
					console.error(`    ✗ Failed: ${response.statusCode}`)
					file.close()
					resolve(false)
					return
				}

				pipeline(response, file)
					.then(() => {
						file.close()
						console.log(`    ✓ Downloaded`)
						resolve(true)
					})
					.catch((err) => {
						console.error(`    ✗ Error: ${err.message}`)
						file.close()
						resolve(false)
					})
			})
			.on("error", (err) => {
				console.error(`    ✗ Download error: ${err.message}`)
				file.close()
				resolve(false)
			})
	})
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
 * Fetch latest commit SHA for a repo branch
 * Returns commit SHA string or null if failed
 */
async function fetchLatestCommitSha(repo, branch) {
	const apiUrl = `https://api.github.com/repos/${repo}/commits/${branch}`

	return new Promise((resolve) => {
		const req = https.get(apiUrl, {
			headers: {
				"User-Agent": "CoStrict-Build",
				"Accept": "application/vnd.github.v3+json",
			},
		})

		// Set a timeout to avoid hanging
		req.setTimeout(5000, () => {
			req.destroy()
			resolve(null)
		})

		req.on("response", (response) => {
			if (response.statusCode !== 200) {
				resolve(null)
				return
			}

			let data = ""
			response.on("data", (chunk) => { data += chunk })
			response.on("end", () => {
				try {
					const json = JSON.parse(data)
					resolve(json.sha || null)
				} catch {
					resolve(null)
				}
			})
		}).on("error", () => resolve(null))
	})
}

/**
 * Fetch skill metadata from index.json
 * Returns { name, description, files, commitSha } or null if failed
 */
async function fetchSkillMetadata(repo, branch) {
	const indexUrl = `https://raw.githubusercontent.com/${repo}/${branch}/index.json`

	// Fetch both commit SHA and index.json in parallel
	const [commitSha, indexData] = await Promise.all([
		fetchLatestCommitSha(repo, branch),
		new Promise((resolve) => {
			https.get(indexUrl, {
				headers: {
					"User-Agent": "CoStrict-Build",
				},
			}).on("response", async (response) => {
				if (response.statusCode !== 200) {
					resolve(null)
					return
				}

				let data = ""
				response.on("data", (chunk) => { data += chunk })
				response.on("end", () => {
					try {
						resolve(JSON.parse(data))
					} catch {
						resolve(null)
					}
				})
			}).on("error", () => resolve(null))
		}),
	])

	if (!indexData) {
		return null
	}

	const skill = indexData.skills?.[0]
	if (!skill) {
		return null
	}

	return {
		name: skill.name,
		description: skill.description,
		files: skill.files || [],
		commitSha,
	}
}

/**
 * Download a single skill
 * Returns { name, repo, branch, commitSha } or null if failed
 */
async function downloadSkill(config, outputBaseDir) {
	const { name, repo, branch, subdir, outputDir } = config

	console.log(`\n📦 Downloading skill: ${name}`)
	console.log(`   From: https://github.com/${repo}`)
	console.log(`   Branch: ${branch}`)
	if (subdir) {
		console.log(`   Subdir: ${subdir}`)
	}

	// Create output directory
	const skillOutputDir = path.join(outputBaseDir, outputDir)
	await fs.mkdir(skillOutputDir, { recursive: true })

	// Prefix paths with subdir if specified
	const pathPrefix = subdir ? `${subdir}/` : ""

	// Fetch skill metadata from index.json (from repo root, not subdir)
	console.log(`  Fetching skill metadata from index.json...`)
	const skillMetadata = await fetchSkillMetadata(repo, branch)
	if (!skillMetadata) {
		console.error(`   ✗ Failed to fetch skill metadata`)
		return null
	}
	const { commitSha, files, ...metadata } = skillMetadata
	console.log(`  Found ${files.length} files to download`)
	console.log(`  Skill name: ${metadata.name}`)
	console.log(`  Description: ${metadata.description.substring(0, 80)}...`)
	if (commitSha) {
		console.log(`  Commit: ${commitSha.slice(0, 7)}`)
	}

	// Clean up existing skill directory to ensure fresh install
	// This prevents old files from lingering when files are removed in new versions
	console.log(`  Cleaning existing skill directory...`)
	try {
		await fs.rm(skillOutputDir, { recursive: true, force: true })
		console.log(`    ✓ Cleaned ${outputDir}`)
	} catch {
		// Directory might not exist, that's fine
	}

	// Recreate output directory after cleanup
	await fs.mkdir(skillOutputDir, { recursive: true })

	// Download all files
	for (const file of files) {
		const url = `https://raw.githubusercontent.com/${repo}/${branch}/${pathPrefix}${file}`
		const targetPath = path.join(skillOutputDir, file)

		// Create parent directories
		await fs.mkdir(path.dirname(targetPath), { recursive: true })

		await downloadFile(url, targetPath)
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
 * Check if skill needs update by fetching metadata and comparing commit SHA
 * Returns { needsUpdate: boolean, metadata: object | null, commitSha: string | null }
 */
async function checkSkillUpdate(skillConfig, localIndex) {
	// Find local skill info
	const localSkill = localIndex?.skills?.find(s => s.name === skillConfig.name)
	const localCommitSha = localSkill?.commitSha || null

	// Fetch latest commit SHA from GitHub (may fail due to network issues)
	console.log(`  Checking ${skillConfig.name} for updates...`)
	const latestCommitSha = await fetchLatestCommitSha(skillConfig.repo, skillConfig.branch)

	// Try to fetch metadata first (works even if GitHub API fails)
	console.log(`    Fetching skill metadata from index.json...`)
	const metadata = await fetchSkillMetadata(skillConfig.repo, skillConfig.branch)

	if (!metadata) {
		console.error(`    ✗ Failed to fetch skill metadata, skipping`)
		return { needsUpdate: false, metadata: null, commitSha: null }
	}

	// If we got commit SHA, use it to compare
	if (latestCommitSha) {
		if (localCommitSha === latestCommitSha) {
			console.log(`    ✓ Up to date (commit: ${latestCommitSha.slice(0, 7)})`)
			return { needsUpdate: false, metadata: localSkill, commitSha: latestCommitSha }
		}
		console.log(`    → Update available (${localCommitSha?.slice(0, 7) || "none"} → ${latestCommitSha.slice(0, 7)})`)
	} else {
		console.log(`    ⚠ Could not fetch commit SHA, but metadata is available`)
		// If no local skill exists, we should download
		if (!localSkill) {
			console.log(`    → No local version found, will download`)
			return { needsUpdate: true, metadata, commitSha: null }
		}
		// If local exists but we can't compare commits, skip to avoid unnecessary updates
		console.log(`    → Local version exists, skipping update without commit comparison`)
		return { needsUpdate: false, metadata: localSkill, commitSha: localCommitSha }
	}

	console.log(`    ✓ Metadata fetched successfully`)
	return { needsUpdate: true, metadata, commitSha: latestCommitSha }
}

/**
 * Main function
 */
async function main() {
	console.log("\n🚀 CoStrict - Downloading GitHub Skills for Bundling\n")

	const outputDir = path.join(projectRoot, "src", "bundled-skills")

	// Get extension version for index.json
	const extensionVersion = await getExtensionVersion()

	// Load local index to check for updates
	const localIndex = await loadLocalIndex(outputDir)

	// Ensure output directory exists
	await fs.mkdir(outputDir, { recursive: true })

	// Phase 1: Check all skills for updates first
	console.log("🔍 Phase 1: Checking for updates...")
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
			const result = await downloadSkill(skillConfig, outputDir)
			if (result) {
				successCount++
				updatedSkills.push(result)
			}
		} catch (error) {
			console.error(`   ✗ Failed to download ${skillConfig.name}: ${error}`)
			// Keep the old version on failure
			const localSkill = localIndex?.skills?.find(s => s.name === skillConfig.name)
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
}

main().then(() => {
	process.exit(0)
})
.catch((error) => {
	console.error("Fatal error:", error)
	process.exit(1)
})

