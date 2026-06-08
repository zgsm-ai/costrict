/**
 * Built-in Skills Installer
 *
 * Installation strategy:
 * - Copy bundled skills (packaged with extension) to user directory on first run
 * - Skills are fixed at the version bundled with the extension
 * - Mode-specific skills are installed to skills-{mode}/ directories
 *
 * Version tracking:
 * - Uses bundled-skills/index.json for version information (commitSha + locales)
 * - Reads/writes .version file in user skill directory for version comparison
 * - Version format: "commitSha:locale" (e.g., "d2bc918:zh-CN")
 * - Does NOT use globalState for version tracking
 * - Does NOT modify SKILL.md content
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { getGlobalCostrictDirectory } from "../roo-config"
import { createLogger, ILogger } from "../../utils/logger"
import { t } from "../../i18n"

const logger: ILogger = createLogger("BuiltinSkillsInstaller")

/**
 * Bundled skill index structure from index.json
 */
interface BundledSkillsIndex {
	version: string
	commitSha: string
	locales: string[]
	skills: Array<{
		name: string
		repo: string
		branch: string
	}>
}

/**
 * Bundled skill configuration
 */
interface BuiltinSkillConfig {
	/** Skill name (local directory name) */
	name: string
	/** Target mode for this skill (optional, if specified installs to skills-{mode}/) */
	mode?: string
}

/**
 * Built-in skills bundled with the extension
 */
const BUILTIN_SKILLS: readonly BuiltinSkillConfig[] = [
	{
		name: "review",
		mode: "review", // Install to skills-review/ directory
	},
	{
		name: "security-review",
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
 * Get the bundled commit SHA from index.json
 */
async function getBundledCommitSha(bundledSkillsPath: string): Promise<string> {
	try {
		const indexPath = path.join(bundledSkillsPath, "index.json")
		const content = await fs.readFile(indexPath, "utf-8")
		const index: BundledSkillsIndex = JSON.parse(content)
		return index.commitSha || ""
	} catch {
		return ""
	}
}

/**
 * Get the available locales from index.json
 */
async function getBundledLocales(bundledSkillsPath: string): Promise<string[]> {
	try {
		const indexPath = path.join(bundledSkillsPath, "index.json")
		const content = await fs.readFile(indexPath, "utf-8")
		const index: BundledSkillsIndex = JSON.parse(content)
		return index.locales || ["en"]
	} catch {
		return ["en"]
	}
}

/**
 * Resolve locale: use preferred locale if available, map zh-TW to zh-CN,
 * otherwise fallback to first available
 */
function resolveLocale(preferredLocale: string, availableLocales: string[]): string {
	if (availableLocales.includes(preferredLocale)) {
		return preferredLocale
	}
	if (preferredLocale === "zh-TW" && availableLocales.includes("zh-CN")) {
		return "zh-CN"
	}
	return availableLocales[0] || "en"
}

/**
 * Get the installed version from .version file in user directory
 */
async function getInstalledVersion(skillDir: string): Promise<string> {
	try {
		const versionFilePath = path.join(skillDir, ".version")
		const content = await fs.readFile(versionFilePath, "utf-8")
		return content.trim()
	} catch {
		return ""
	}
}

/**
 * Copy skill from bundled directory to user directory using atomic swap.
 * Writes to a temp directory first, then renames to avoid partial states.
 */
async function copyBundledSkill(
	skillName: string,
	bundledPath: string,
	userPath: string,
	bundledCommitSha: string,
	locale: string,
): Promise<boolean> {
	try {
		// Check if bundled skill exists in locale directory
		const skillSourceDir = path.join(bundledPath, locale, skillName)
		await fs.access(skillSourceDir)

		await fs.mkdir(userPath, { recursive: true })

		const skillTargetDir = path.join(userPath, skillName)
		const tempDir = path.join(userPath, `.tmp-${skillName}-${Date.now()}`)

		// Copy to temp directory first
		await fs.mkdir(tempDir, { recursive: true })
		await fs.cp(skillSourceDir, tempDir, { recursive: true })

		// Write .version file into temp directory
		const versionFilePath = path.join(tempDir, ".version")
		await fs.writeFile(versionFilePath, `${bundledCommitSha}:${locale}`, "utf-8")

		// Remove old version and rename temp to target (atomic on same filesystem)
		await fs.rm(skillTargetDir, { recursive: true, force: true })
		await fs.rename(tempDir, skillTargetDir)

		return true
	} catch {
		return false
	}
}

/**
 * Installation result for a single skill
 */
type SkillInstallResult = "up-to-date" | "installed" | "updated" | "failed"

/**
 * Install a single built-in skill
 */
async function initBuiltinSkill(
	config: BuiltinSkillConfig,
	bundledSkillsPath: string,
	preferredLocale: string,
): Promise<SkillInstallResult> {
	const { name, mode } = config

	// Get bundled commit SHA from index.json
	const bundledCommitSha = await getBundledCommitSha(bundledSkillsPath)

	// Skip if commitSha is null/empty (skill not properly bundled)
	if (!bundledCommitSha) {
		logger.info(`[BuiltinSkills] ${name}: No commitSha in index.json, skipping`)
		return "failed"
	}

	// Resolve locale from available locales
	const availableLocales = await getBundledLocales(bundledSkillsPath)
	const locale = resolveLocale(preferredLocale, availableLocales)

	// Get user skills path
	const userSkillsPath = getUserSkillsPath(mode)
	const skillDir = path.join(userSkillsPath, name)

	// Check installed version from .version file
	const installedVersion = await getInstalledVersion(skillDir)
	const expectedVersion = `${bundledCommitSha}:${locale}`

	// Check if update is needed
	const dirExists = await fs
		.access(skillDir)
		.then(() => true)
		.catch(() => false)
	if (dirExists) {
		if (installedVersion === expectedVersion) {
			logger.info(`[BuiltinSkills] ${name}: Up to date (${expectedVersion})`)
			return "up-to-date"
		}
		const shortInstalled = installedVersion?.slice(0, 7) || "unknown"
		const shortBundled = bundledCommitSha?.slice(0, 7) || "unknown"
		logger.info(
			`[BuiltinSkills] ${name}: Version changed (${shortInstalled} -> ${shortBundled}:${locale}), updating`,
		)
	} else {
		const shortBundled = bundledCommitSha?.slice(0, 7) || "unknown"
		logger.info(`[BuiltinSkills] ${name}: Installing (${shortBundled}:${locale})`)
	}

	// Copy from bundled skills to mode-specific or generic directory
	const bundledInstalled = await copyBundledSkill(name, bundledSkillsPath, userSkillsPath, bundledCommitSha, locale)

	if (bundledInstalled) {
		const modeInfo = mode ? ` to ${mode} mode` : ""
		const shortSha = bundledCommitSha?.slice(0, 7) || "unknown"
		logger.info(`[BuiltinSkills] ${name}: Installed from bundled skills${modeInfo} (${shortSha}:${locale})`)
		return dirExists ? "updated" : "installed"
	}

	logger.info(`[BuiltinSkills] ${name}: Bundled skills not found`)
	return "failed"
}

/**
 * Installation summary returned by initReviewSkills
 */
export interface SkillsInitSummary {
	/** Skills that were freshly installed */
	installed: string[]
	/** Skills that were updated to a new version */
	updated: string[]
	/** Skills that were already up to date */
	upToDate: string[]
	/** Skills that failed to install */
	failed: string[]
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
 * Skills are automatically updated when the bundled version or locale changes.
 */
export async function initReviewSkills(
	context: vscode.ExtensionContext,
	preferredLocale: string = "zh-CN",
): Promise<SkillsInitSummary> {
	const emptySummary: SkillsInitSummary = { installed: [], updated: [], upToDate: [], failed: [] }
	const bundledSkillsPath = getBundledSkillsPath(context)

	// Check if bundled skills exist
	const bundledExists = await fs
		.access(bundledSkillsPath)
		.then(() => true)
		.catch(() => false)

	if (!bundledExists) {
		logger.info("[BuiltinSkills] No bundled skills found, skipping")
		return emptySummary
	}

	const extensionVersion = getExtensionVersion(context)
	logger.info(
		`[BuiltinSkills] Installing ${BUILTIN_SKILLS.length} built-in skills (extension v${extensionVersion}, locale: ${preferredLocale})...`,
	)

	// Install all skills (copy from bundled to user directory)
	const results = await Promise.all(
		BUILTIN_SKILLS.map(async (config) => {
			const result = await initBuiltinSkill(config, bundledSkillsPath, preferredLocale)
			return { name: config.name, result }
		}),
	)

	// Aggregate results
	const summary: SkillsInitSummary = { installed: [], updated: [], upToDate: [], failed: [] }
	for (const { name, result } of results) {
		switch (result) {
			case "installed":
				summary.installed.push(name)
				break
			case "updated":
				summary.updated.push(name)
				break
			case "up-to-date":
				summary.upToDate.push(name)
				break
			case "failed":
				summary.failed.push(name)
				break
		}
	}

	logger.info(
		`[BuiltinSkills] Installation complete: ${summary.installed.length} installed, ${summary.updated.length} updated, ${summary.upToDate.length} up-to-date, ${summary.failed.length} failed`,
	)

	return summary
}

/**
 * Show a VS Code notification for skills that were installed or updated.
 * Only shows when there are actual changes (not when all skills are already up-to-date).
 */
export function showSkillsInitNotification(summary: SkillsInitSummary): void {
	const installedOrUpdated = [...summary.installed, ...summary.updated]
	if (installedOrUpdated.length === 0) return

	const skillsList = installedOrUpdated.join(", ")
	const installPath = getGlobalCostrictDirectory()

	if (summary.installed.length > 0 && summary.updated.length === 0) {
		vscode.window.showInformationMessage(t("common:builtinSkills.init", { skills: skillsList, path: installPath }))
	} else if (summary.updated.length > 0 && summary.installed.length === 0) {
		vscode.window.showInformationMessage(
			t("common:builtinSkills.updated", { skills: skillsList, path: installPath }),
		)
	} else {
		// Mixed: some installed, some updated
		vscode.window.showInformationMessage(
			t("common:builtinSkills.updated", { skills: skillsList, path: installPath }),
		)
	}
}

/**
 * Get list of installed built-in skills
 */
export async function getInstalledGitHubSkills(): Promise<string[]> {
	const installed: string[] = []

	for (const config of BUILTIN_SKILLS) {
		const userSkillsPath = getUserSkillsPath(config.mode)
		const skillDir = path.join(userSkillsPath, config.name)
		const version = await getInstalledVersion(skillDir)
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
	skillName: string,
): Promise<{ installed: boolean; version: string | null } | null> {
	const config = BUILTIN_SKILLS.find((s) => s.name === skillName)
	if (!config) return null

	const userSkillsPath = getUserSkillsPath(config.mode)
	const skillDir = path.join(userSkillsPath, config.name)
	const version = await getInstalledVersion(skillDir)
	return { installed: version !== "", version: version || null }
}
