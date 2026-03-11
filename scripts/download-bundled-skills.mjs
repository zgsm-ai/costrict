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
 * Update SKILL.md to set modeSlugs to security-review
 * This ensures the skill only works in security-review mode
 */
async function updateSkillModeSlug(skillOutputDir) {
	const skillMdPath = path.join(skillOutputDir, "SKILL.md")
	try {
		let content = await fs.readFile(skillMdPath, "utf-8")

		// Replace or add modeSlugs in frontmatter
		if (content.includes("modeSlugs:")) {
			// Replace existing modeSlugs
			content = content.replace(/modeSlugs:\s*\[[\s\S]*?\]/, "modeSlugs:\n  - security-review")
		} else if (content.includes("mode:")) {
			// Replace legacy mode field
			content = content.replace(/mode:\s*\S+/, "mode: security-review")
		} else {
			// Add modeSlugs after frontmatter start
			const frontmatterEnd = content.indexOf("---", 3)
			if (frontmatterEnd !== -1) {
				const insertPos = content.indexOf("\n", content.indexOf("---", 3) + 3)
				if (insertPos !== -1) {
					content = content.slice(0, insertPos) + "\nmodeSlugs:\n  - security-review" + content.slice(insertPos)
				}
			}
		}

		await fs.writeFile(skillMdPath, content, "utf-8")
		console.log(`    ✓ Updated modeSlugs to security-review`)
	} catch (error) {
		console.error(`    ⚠ Warning: Could not update modeSlugs: ${error.message}`)
	}
}

/**
 * Fetch file list from index.json
 * index.json is in the repo root, not in the subdir
 */
async function fetchFileListFromIndex(repo, branch) {
	const indexUrl = `https://raw.githubusercontent.com/${repo}/${branch}/index.json`

	return new Promise((resolve) => {
		https.get(indexUrl, {
			headers: {
				"User-Agent": "CoStrict-Build",
			},
		}).on("response", async (response) => {
			if (response.statusCode !== 200) {
				console.error(`    ✗ Failed to fetch index.json: ${response.statusCode}`)
				resolve([])
				return
			}

			let data = ""
			response.on("data", (chunk) => { data += chunk })
			response.on("end", () => {
				try {
					const json = JSON.parse(data)
					// Extract files array from index.json
					const files = json.skills?.[0]?.files || []
					resolve(files)
				} catch {
					resolve([])
				}
			})
		}).on("error", () => resolve([]))
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

	// Fetch file list from index.json (from repo root, not subdir)
	console.log(`  Fetching file list from index.json...`)
	const filesToDownload = await fetchFileListFromIndex(repo, branch)
	console.log(`  Found ${filesToDownload.length} files to download`)

	// Add README files (not in index.json but useful)
	const additionalFiles = ["README.md", "README_CN.md"]
	const allFiles = [...filesToDownload, ...additionalFiles]

	// Download all files
	for (const file of allFiles) {
		const url = `https://raw.githubusercontent.com/${repo}/${branch}/${pathPrefix}${file}`
		const targetPath = path.join(skillOutputDir, file)

		// Create parent directories
		await fs.mkdir(path.dirname(targetPath), { recursive: true })

		await downloadFile(url, targetPath)
	}

	// Update SKILL.md to set modeSlugs to security-review
	await updateSkillModeSlug(skillOutputDir)

	console.log(`   ✓ Skill ${name} downloaded successfully`)
}

/**
 * Main function
 */
async function main() {
	console.log("\n🚀 CoStrict - Downloading GitHub Skills for Bundling\n")

	const outputDir = path.join(process.cwd(), "dist", "bundled-skills")

	// Clean output directory
	await fs.rm(outputDir, { recursive: true, force: true })
	await fs.mkdir(outputDir, { recursive: true })

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

	// Create index file
	const indexPath = path.join(outputDir, "index.json")
	await fs.writeFile(
		indexPath,
		JSON.stringify(
			{
				version: new Date().toISOString(),
				skills: BUILD_SKILLS.map((s) => ({ name: s.name, repo: s.repo, branch: s.branch })),
			},
			null,
			2,
		),
	)

	console.log(`\n✓ Downloaded ${successCount}/${BUILD_SKILLS.length} skills`)
	console.log(`✓ Output: ${outputDir}`)
	console.log("\n💡 These skills will be bundled with the extension\n")
}

main().catch((error) => {
	console.error("Fatal error:", error)
	process.exit(1)
})
