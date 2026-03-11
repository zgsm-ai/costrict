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
		repo: "zgsm-ai/security-review",
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
modeSlugs:
  - security-review`

			// Reconstruct file with clean frontmatter
			content = `---\n${newFrontmatter}\n---${bodyContent}`
		}

		await fs.writeFile(skillMdPath, content, "utf-8")
		console.log(`    ✓ Updated SKILL.md frontmatter (name: ${name}, modeSlugs: security-review)`)
	} catch (error) {
		console.error(`    ⚠ Warning: Could not update SKILL.md: ${error.message}`)
	}
}

/**
 * Fetch skill metadata from index.json
 * Returns { name, description, files } or null if failed
 */
async function fetchSkillMetadata(repo, branch) {
	const indexUrl = `https://raw.githubusercontent.com/${repo}/${branch}/index.json`

	return new Promise((resolve) => {
		https.get(indexUrl, {
			headers: {
				"User-Agent": "CoStrict-Build",
			},
		}).on("response", async (response) => {
			if (response.statusCode !== 200) {
				console.error(`    ✗ Failed to fetch index.json: ${response.statusCode}`)
				resolve(null)
				return
			}

			let data = ""
			response.on("data", (chunk) => { data += chunk })
			response.on("end", () => {
				try {
					const json = JSON.parse(data)
					const skill = json.skills?.[0]
					if (skill) {
						resolve({
							name: skill.name,
							description: skill.description,
							files: skill.files || []
						})
					} else {
						resolve(null)
					}
				} catch {
					resolve(null)
				}
			})
		}).on("error", () => resolve(null))
	})
}

/**
 * Download a single skill
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
		return
	}
	console.log(`  Found ${skillMetadata.files.length} files to download`)
	console.log(`  Skill name: ${skillMetadata.name}`)
	console.log(`  Description: ${skillMetadata.description.substring(0, 80)}...`)

	// Download all files
	for (const file of skillMetadata.files) {
		const url = `https://raw.githubusercontent.com/${repo}/${branch}/${pathPrefix}${file}`
		const targetPath = path.join(skillOutputDir, file)

		// Create parent directories
		await fs.mkdir(path.dirname(targetPath), { recursive: true })

		await downloadFile(url, targetPath)
	}

	// Update SKILL.md frontmatter using metadata from index.json
	await updateSkillFrontmatter(skillOutputDir, skillMetadata)

	console.log(`   ✓ Skill ${name} downloaded successfully`)
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
 * Main function
 */
async function main() {
	console.log("\n🚀 CoStrict - Downloading GitHub Skills for Bundling\n")

	const outputDir = path.join(projectRoot, "src", "bundled-skills")

	// Clean output directory
	await fs.rm(outputDir, { recursive: true, force: true })
	await fs.mkdir(outputDir, { recursive: true })

	// Get extension version for index.json
	const extensionVersion = await getExtensionVersion()

	// Download all skills
	let successCount = 0
	for (const skill of BUILD_SKILLS) {
		try {
			await downloadSkill(skill, outputDir)
			successCount++
		} catch (error) {
			console.error(`   ✗ Failed to download ${skill.name}: ${error}`)
		}
	}

	// Create index file with extension version
	const indexPath = path.join(outputDir, "index.json")
	await fs.writeFile(
		indexPath,
		JSON.stringify(
			{
				version: extensionVersion,
				skills: BUILD_SKILLS.map((s) => ({ name: s.name, repo: s.repo, branch: s.branch })),
			},
			null,
			2,
		),
	)

	console.log(`\n✓ Downloaded ${successCount}/${BUILD_SKILLS.length} skills`)
	console.log(`✓ Output: ${outputDir}`)
	console.log(`✓ Index version: ${extensionVersion}`)
	console.log("\n💡 These skills will be bundled with the extension\n")
}

main().catch((error) => {
	console.error("Fatal error:", error)
	process.exit(1)
})
