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
 * Get directory tree from GitHub API
 */
async function getDirectoryTree(repo, branch, dirPath) {
	const apiUrl = `https://api.github.com/repos/${repo}/git/trees/${branch}:${dirPath}?recursive=1`

	console.log(`  Fetching tree for: ${dirPath}`)

	return new Promise((resolve) => {
		https
			.get(apiUrl, {
				headers: {
					"User-Agent": "CoStrict-Build",
					Accept: "application/vnd.github.v3+json",
				},
			})
			.on("response", async (response) => {
				if (response.statusCode !== 200) {
					console.error(`    ✗ API error: ${response.statusCode}`)
					resolve([])
					return
				}

				let data = ""
				response.on("data", (chunk) => {
					data += chunk
				})
				response.on("end", () => {
					try {
						const json = JSON.parse(data)
						resolve(json.tree || [])
					} catch {
						resolve([])
					}
				})
			})
			.on("error", () => resolve([]))
	})
}

/**
 * Download all files from a directory
 */
async function downloadDirectory(repo, branch, dirPath, tree, outputBaseDir) {
	// Filter files in this directory
	const files = tree.filter((item) => item.type === "blob" && item.path.startsWith(dirPath))

	console.log(`  Downloading ${files.length} files from ${dirPath}/...`)

	for (const item of files) {
		const relativePath = item.path.substring(dirPath.length)
		const targetPath = path.join(outputBaseDir, relativePath)

		// Create parent directories
		await fs.mkdir(path.dirname(targetPath), { recursive: true })

		// Download file
		const url = `https://raw.githubusercontent.com/${repo}/${branch}/${item.path}`
		await downloadFile(url, targetPath)
	}
}

/**
 * Download a single skill
 */
async function downloadSkill(config, outputBaseDir) {
	const { name, repo, branch, outputDir } = config

	console.log(`\n📦 Downloading skill: ${name}`)
	console.log(`   From: https://github.com/${repo}`)
	console.log(`   Branch: ${branch}`)

	// Create output directory
	const skillOutputDir = path.join(outputBaseDir, outputDir)
	await fs.mkdir(skillOutputDir, { recursive: true })

	// Download core files
	const coreFiles = ["SKILL.md", "agent.md", "README.md", "README_CN.md", "index.json"]
	for (const file of coreFiles) {
		const url = `https://raw.githubusercontent.com/${repo}/${branch}/${file}`
		const targetPath = path.join(skillOutputDir, file)
		await downloadFile(url, targetPath)
	}

	// Download references directory
	const tree = await getDirectoryTree(repo, branch, "references")
	if (tree.length > 0) {
		await downloadDirectory(repo, branch, "references", tree, skillOutputDir)
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
