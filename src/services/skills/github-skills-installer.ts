/**
 * Built-in Skills Installer
 *
 * Installation strategy:
 * - Copy bundled skills (packaged with extension) to user directory on first run
 * - No online updates - skills are fixed at the version bundled with the extension
 * - Mode-specific skills are installed to skills-{mode}/ directories
 *
 * Version tracking:
 * - Installed version: Tracked via context.globalState to avoid re-copying
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { getGlobalCostrictDirectory } from "../roo-config"
import { createLogger, ILogger } from "../../utils/logger"

const logger: ILogger = createLogger("BuiltinSkillsInstaller")

/**
 * Bundled skill configuration
 */
interface BuiltinSkillConfig {
	/** Skill name (local directory name) */
	name: string
	/** Storage key to track if skill has been installed */
	installedKey: string
	/** Target mode for this skill (optional, if specified installs to skills-{mode}/) */
	mode?: string
}

/**
 * Built-in skills bundled with the extension
 */
const BUILTIN_SKILLS: readonly BuiltinSkillConfig[] = [
	{
		name: "security-review",
		installedKey: "builtinSkill.securityReview.installed",
		mode: "security-review", // Install to skills-security-review/ directory
	},
]

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
 * Copy skill from bundled directory to user directory
 */
async function copyBundledSkill(
	skillName: string,
	bundledPath: string,
	userPath: string,
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

		// Copy recursively
		await fs.cp(skillSourceDir, skillTargetDir, { recursive: true })

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
	const { name, installedKey, mode } = config

	// Check if already installed
	const alreadyInstalled = context.globalState.get<boolean>(installedKey)
	if (alreadyInstalled) {
		logger.info(`[BuiltinSkills] ${name}: Already installed, skipping`)
		return true
	}

	// Copy from bundled skills to mode-specific or generic directory
	const userSkillsPath = getUserSkillsPath(mode)
	const bundledInstalled = await copyBundledSkill(name, bundledSkillsPath, userSkillsPath)

	if (bundledInstalled) {
		// Mark as installed
		await context.globalState.update(installedKey, true)
		const modeInfo = mode ? ` to ${mode} mode` : ""
		logger.info(`[BuiltinSkills] ${name}: Installed from bundled skills${modeInfo}`)
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
 * Skills are only copied once; subsequent activations skip already-installed skills.
 */
export async function installGitHubSkills(context: vscode.ExtensionContext): Promise<void> {
	const bundledSkillsPath = getBundledSkillsPath(context)

	// Check if bundled skills exist
	const bundledExists = await fs.access(bundledSkillsPath).then(() => true).catch(() => false)

	if (!bundledExists) {
		logger.info("[BuiltinSkills] No bundled skills found, skipping")
		return
	}

	logger.info(`[BuiltinSkills] Installing ${BUILTIN_SKILLS.length} built-in skills...`)

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
		const isInstalled = context.globalState.get<boolean>(config.installedKey)
		if (isInstalled) {
			installed.push(config.name)
		}
	}

	return installed
}

/**
 * Get version info for a specific skill
 * Note: Built-in skills don't track versions since updates are bundled with extension
 */
export async function getGitHubSkillVersion(
	context: vscode.ExtensionContext,
	skillName: string,
): Promise<{ installed: boolean } | null> {
	const config = BUILTIN_SKILLS.find((s) => s.name === skillName)
	if (!config) return null

	const installed = context.globalState.get<boolean>(config.installedKey) || false
	return { installed }
}
