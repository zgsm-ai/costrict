/**
 * Built-in Skills Installer
 *
 * Installation strategy:
 * - Copy bundled skills (packaged with extension) to user directory on first run
 * - Skills are fixed at the version bundled with the extension
 * - Mode-specific skills are installed to skills-{mode}/ directories
 *
 * Version tracking:
 * - Uses bundled-skills/index.json for version information
 * - Stores installed version in a separate .version file in user directory
 * - Does NOT modify SKILL.md content
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { getGlobalCostrictDirectory } from "../roo-config"
import { createLogger, ILogger } from "../../utils/logger"

const logger: ILogger = createLogger("BuiltinSkillsInstaller")

/**
 * Bundled skill index structure from index.json
 */
interface BundledSkillsIndex {
	version: string
	skills: Array<{
		name: string
		repo: string
		branch: string
		commitSha: string
	}>
}

/**
 * Bundled skill configuration
 */
interface BuiltinSkillConfig {
	/** Skill name (local directory name) */
	name: string
	/** Storage key to track installed version in globalState */
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
 * Get the bundled commit SHA from index.json for a specific skill
 */
async function getBundledCommitSha(bundledSkillsPath: string, skillName: string): Promise<string> {
	try {
		const indexPath = path.join(bundledSkillsPath, "index.json")
		const content = await fs.readFile(indexPath, "utf-8")
		const index: BundledSkillsIndex = JSON.parse(content)
		const skill = index.skills.find((s) => s.name === skillName)
		return skill?.commitSha || ""
	} catch {
		return ""
	}
}

/**
 * Copy skill from bundled directory to user directory
 * Does NOT modify SKILL.md content
 */
async function copyBundledSkill(
	skillName: string,
	bundledPath: string,
	userPath: string,
	bundledCommitSha: string,
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
		if (
			await fs
				.access(skillTargetDir)
				.then(() => true)
				.catch(() => false)
		) {
			await fs.rm(skillTargetDir, { recursive: true, force: true })
		}

		// Create target directory
		await fs.mkdir(skillTargetDir, { recursive: true })

		// Copy all files recursively without modification
		await fs.cp(skillSourceDir, skillTargetDir, { recursive: true })

		// Write .version file with commit SHA
		const versionFilePath = path.join(skillTargetDir, ".version")
		await fs.writeFile(versionFilePath, bundledCommitSha, "utf-8")

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

	// Get bundled commit SHA from index.json
	const bundledCommitSha = await getBundledCommitSha(bundledSkillsPath, name)

	// Check installed commit SHA in globalState
	const installedCommitSha = context.globalState.get<string>(versionKey)

	// Get user skills path
	const userSkillsPath = getUserSkillsPath(mode)
	const skillDir = path.join(userSkillsPath, name)

	// Check if update is needed
	const dirExists = await fs
		.access(skillDir)
		.then(() => true)
		.catch(() => false)
	if (dirExists) {
		if (installedCommitSha === bundledCommitSha) {
			logger.info(`[BuiltinSkills] ${name}: Up to date (${bundledCommitSha})`)
			return true
		}
		const shortInstalled = installedCommitSha?.slice(0, 7) || "unknown"
		const shortBundled = bundledCommitSha?.slice(0, 7) || "unknown"
		logger.info(`[BuiltinSkills] ${name}: Commit changed (${shortInstalled} -> ${shortBundled}), updating`)
	} else {
		const shortBundled = bundledCommitSha?.slice(0, 7) || "unknown"
		logger.info(`[BuiltinSkills] ${name}: Installing (${shortBundled})`)
	}

	// Copy from bundled skills to mode-specific or generic directory
	const bundledInstalled = await copyBundledSkill(name, bundledSkillsPath, userSkillsPath, bundledCommitSha)

	if (bundledInstalled) {
		// Store installed commit SHA in globalState
		await context.globalState.update(versionKey, bundledCommitSha)
		const modeInfo = mode ? ` to ${mode} mode` : ""
		const shortSha = bundledCommitSha?.slice(0, 7) || "unknown"
		logger.info(`[BuiltinSkills] ${name}: Installed from bundled skills${modeInfo} (${shortSha})`)
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
 * Skills are automatically updated when the bundled version changes.
 */
export async function installGitHubSkills(context: vscode.ExtensionContext): Promise<void> {
	const bundledSkillsPath = getBundledSkillsPath(context)

	// Check if bundled skills exist
	const bundledExists = await fs
		.access(bundledSkillsPath)
		.then(() => true)
		.catch(() => false)

	if (!bundledExists) {
		logger.info("[BuiltinSkills] No bundled skills found, skipping")
		return
	}

	const extensionVersion = getExtensionVersion(context)
	logger.info(
		`[BuiltinSkills] Installing ${BUILTIN_SKILLS.length} built-in skills (extension v${extensionVersion})...`,
	)

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
