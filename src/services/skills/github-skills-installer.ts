/**
 * Built-in Skills Installer
 *
 * Installation strategy:
 * - Copy bundled skills (packaged with extension) to user directory on first run
 * - Skills are fixed at the version bundled with the extension
 * - Mode-specific skills are installed to skills-{mode}/ directories
 *
 * Version tracking:
 * - Extension version from package.json is added to SKILL.md as a comment
 * - On each run, check if the installed version matches the current extension version
 * - If versions don't match, re-install the skill
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { getGlobalCostrictDirectory } from "../roo-config"
import { createLogger, ILogger } from "../../utils/logger"

const logger: ILogger = createLogger("BuiltinSkillsInstaller")

// Version comment pattern in SKILL.md
const VERSION_COMMENT_PATTERN = /<!--\s*Builtin Skill Version:\s*([0-9.]+)\s*-->/

/**
 * Bundled skill configuration
 */
interface BuiltinSkillConfig {
	/** Skill name (local directory name) */
	name: string
	/** Storage key to track installed version */
	versionKey: string
	/** Target mode for this skill (optional, if specified installs to skills-{mode}/) */
	mode?: string
}

/**
 * Built-in skills bundled with the extension
 */
const BUILTIN_SKILLS: readonly BuiltinSkillConfig[] = [
	{
		name: "security-review",
		versionKey: "builtinSkill.securityReview.version",
		mode: "security-review", // Install to skills-security-review/ directory
	},
]

/**
 * Get current extension version from package.json
 */
function getExtensionVersion(context: vscode.ExtensionContext): string {
	const packagePath = path.join(context.extensionPath, "package.json")
	try {
		const packageContent = require(packagePath)
		return packageContent.version || "0.0.0"
	} catch {
		return "0.0.0"
	}
}

/**
 * Extract version from SKILL.md content
 */
function extractVersionFromSkill(content: string): string | null {
	const match = content.match(VERSION_COMMENT_PATTERN)
	return match ? match[1] : null
}

/**
 * Add version comment to skill content
 */
function addVersionComment(content: string, version: string): string {
	const versionComment = `<!--
Builtin Skill Version: ${version}
Do not remove this comment, it's used for version checking
-->
`
	return versionComment + content
}

/**
 * Get path to bundled skills directory in extension
 */
function getBundledSkillsPath(context: vscode.ExtensionContext): string {
	return path.join(context.extensionPath, "bundled-skills")
}

/**
 * Get path to user's skills directory
 * If mode is specified, returns skills-{mode}/ directory
 */
function getUserSkillsPath(mode?: string): string {
	const baseDir = getGlobalCostrictDirectory()
	return mode ? path.join(baseDir, `skills-${mode}`) : path.join(baseDir, "skills")
}

/**
 * Check if the skill needs to be updated due to version change
 * Returns true if:
 * - File doesn't exist
 * - File is corrupted or can't be read
 * - Version comment is missing or invalid
 * - Version doesn't match extension version
 */
async function needsUpdate(
	skillDir: string,
	skillName: string,
	currentVersion: string,
): Promise<boolean> {
	const skillMdPath = path.join(skillDir, skillName, "SKILL.md")
	try {
		const content = await fs.readFile(skillMdPath, "utf-8")
		const installedVersion = extractVersionFromSkill(content)
		// Update if version is missing, invalid, or doesn't match
		return installedVersion !== currentVersion
	} catch {
		// File doesn't exist or can't be read
		return true
	}
}

/**
 * Copy skill from bundled directory to user directory
 * Adds version comment to SKILL.md during copy
 */
async function copyBundledSkill(
	skillName: string,
	bundledPath: string,
	userPath: string,
	currentVersion: string,
): Promise<boolean> {
	try {
		// Check if bundled skill exists
		const skillSourceDir = path.join(bundledPath, skillName)
		await fs.access(skillSourceDir)

		// Create user directory
		await fs.mkdir(userPath, { recursive: true })

		// Copy skill directory
		const skillTargetDir = path.join(userPath, skillName)

		// Remove old version if exists
		if (await fs.access(skillTargetDir).then(() => true).catch(() => false)) {
			await fs.rm(skillTargetDir, { recursive: true, force: true })
		}

		// Create target directory
		await fs.mkdir(skillTargetDir, { recursive: true })

		// Copy all files recursively
		const entries = await fs.readdir(skillSourceDir, { withFileTypes: true })
		for (const entry of entries) {
			const srcPath = path.join(skillSourceDir, entry.name)
			const destPath = path.join(skillTargetDir, entry.name)

			if (entry.isDirectory()) {
				await fs.mkdir(destPath, { recursive: true })
				// Recursively copy subdirectories
				await fs.cp(srcPath, destPath, { recursive: true })
			} else if (entry.isFile()) {
				let content = await fs.readFile(srcPath, "utf-8")

				// Add version comment to SKILL.md
				if (entry.name === "SKILL.md") {
					content = addVersionComment(content, currentVersion)
				}

				await fs.writeFile(destPath, content, "utf-8")
			}
		}

		return true
	} catch {
		return false
	}
}

/**
 * Install a single built-in skill
 */
async function installBuiltinSkill(
	config: BuiltinSkillConfig,
	context: vscode.ExtensionContext,
	bundledSkillsPath: string,
): Promise<boolean> {
	const { name, versionKey, mode } = config
	const currentVersion = getExtensionVersion(context)

	// Check installed version
	const installedVersion = context.globalState.get<string>(versionKey)

	// Get user skills path
	const userSkillsPath = getUserSkillsPath(mode)
	const skillDir = path.join(userSkillsPath, name)

	// Check if update is needed
	const dirExists = await fs.access(skillDir).then(() => true).catch(() => false)
	if (dirExists) {
		if (installedVersion === currentVersion) {
			// Also check SKILL.md for version comment
			const needsUpdateCheck = await needsUpdate(skillDir, name, currentVersion)
			if (!needsUpdateCheck) {
				logger.info(`[BuiltinSkills] ${name}: Up to date (v${currentVersion})`)
				return true
			}
		}
		logger.info(`[BuiltinSkills] ${name}: Version changed (v${installedVersion} -> v${currentVersion}), updating`)
	} else {
		logger.info(`[BuiltinSkills] ${name}: Installing (v${currentVersion})`)
	}

	// Copy from bundled skills to mode-specific or generic directory
	const bundledInstalled = await copyBundledSkill(name, bundledSkillsPath, userSkillsPath, currentVersion)

	if (bundledInstalled) {
		// Store installed version
		await context.globalState.update(versionKey, currentVersion)
		const modeInfo = mode ? ` to ${mode} mode` : ""
		logger.info(`[BuiltinSkills] ${name}: Installed from bundled skills${modeInfo} (v${currentVersion})`)
		return true
	}

	logger.info(`[BuiltinSkills] ${name}: Bundled skills not found`)
	return false
}

/**
 * Install all built-in skills
 *
 * This function copies skills from the bundled directory (packaged with extension)
 * to the user's skills directory.
 *
 * Mode-specific skills are installed to skills-{mode}/ directories,
 * which ensures they only activate in that specific mode.
 *
 * Skills are automatically updated when the extension version changes.
 */
export async function installGitHubSkills(context: vscode.ExtensionContext): Promise<void> {
	const bundledSkillsPath = getBundledSkillsPath(context)

	// Check if bundled skills exist
	const bundledExists = await fs.access(bundledSkillsPath).then(() => true).catch(() => false)

	if (!bundledExists) {
		logger.info("[BuiltinSkills] No bundled skills found, skipping")
		return
	}

	const currentVersion = getExtensionVersion(context)
	logger.info(`[BuiltinSkills] Installing ${BUILTIN_SKILLS.length} built-in skills (extension v${currentVersion})...`)

	// Install all skills (copy from bundled to user directory)
	const results = await Promise.all(
		BUILTIN_SKILLS.map((config) => installBuiltinSkill(config, context, bundledSkillsPath)),
	)

	const successCount = results.filter((r) => r).length
	logger.info(`[BuiltinSkills] Installation complete: ${successCount}/${BUILTIN_SKILLS.length} skills`)
}

/**
 * Get list of installed built-in skills
 */
export async function getInstalledGitHubSkills(context: vscode.ExtensionContext): Promise<string[]> {
	const installed: string[] = []

	for (const config of BUILTIN_SKILLS) {
		const version = context.globalState.get<string>(config.versionKey)
		if (version) {
			installed.push(config.name)
		}
	}

	return installed
}

/**
 * Get version info for a specific skill
 */
export async function getGitHubSkillVersion(
	context: vscode.ExtensionContext,
	skillName: string,
): Promise<{ installed: boolean; version: string | null } | null> {
	const config = BUILTIN_SKILLS.find((s) => s.name === skillName)
	if (!config) return null

	const version = context.globalState.get<string>(config.versionKey) || null
	return { installed: version !== null, version }
}
