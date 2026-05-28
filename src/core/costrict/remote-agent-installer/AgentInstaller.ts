import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as os from "os"
import * as path from "path"
import * as yaml from "yaml"
import AdmZip from "adm-zip"
import { createLogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"
import { safeWriteJson } from "../../../utils/safeWriteJson"
import { getGlobalRooDirectory } from "../../../services/roo-config/index"
import { delay, redactUrl } from "./utils"
import type { ResourcePackageVersion, LocalInstallRecord, ZipManifest, InstalledManifest } from "./types"
import { FatalInstallerError } from "./types"

const logger = createLogger(Package.outputChannel)
const LOG_PREFIX = "[remote-agent-installer:install]"

const WINDOWS_RESERVED_NAMES = new Set([
	"CON",
	"PRN",
	"AUX",
	"NUL",
	"COM1",
	"COM2",
	"COM3",
	"COM4",
	"COM5",
	"COM6",
	"COM7",
	"COM8",
	"COM9",
	"LPT1",
	"LPT2",
	"LPT3",
	"LPT4",
	"LPT5",
	"LPT6",
	"LPT7",
	"LPT8",
	"LPT9",
])

export async function atomicCopyFile(src: string, dest: string, maxRetries = 5): Promise<void> {
	const tmpDest = `${dest}.tmp-${Date.now()}`
	await fs.copyFile(src, tmpDest)
	for (let i = 0; i < maxRetries; i++) {
		try {
			await fs.rename(tmpDest, dest)
			return
		} catch (error: any) {
			if ((error.code === "EPERM" || error.code === "EBUSY") && i < maxRetries - 1) {
				await delay(100 * Math.pow(2, i))
				continue
			}
			await fs.unlink(tmpDest).catch(() => {})
			throw error
		}
	}
}

export async function atomicReplaceDirectory(src: string, dest: string): Promise<void> {
	const backup = `${dest}.backup-${Date.now()}`
	let hasBackup = false
	try {
		await fs.rename(dest, backup)
		hasBackup = true
	} catch (error: any) {
		if (error.code !== "ENOENT") {
			if (process.platform === "win32" && (error.code === "EPERM" || error.code === "EBUSY")) {
				await fs.rm(dest, { recursive: true, force: true, maxRetries: 3 })
			} else {
				throw error
			}
		}
	}
	// On Windows, fs.rename() to a path that still exists (or was recently deleted)
	// can fail with EPERM due to filesystem delays. Fall back to cp+rm in that case.
	try {
		await fs.rename(src, dest)
	} catch (renameError: any) {
		if (process.platform === "win32" && (renameError.code === "EPERM" || renameError.code === "EBUSY")) {
			// Windows fallback: cp+rm. If cp fails, restore backup so dest is not lost.
			try {
				await fs.cp(src, dest, { recursive: true })
				await fs.rm(src, { recursive: true, force: true })
			} catch (cpError: any) {
				if (hasBackup) {
					await restoreBackup(backup, dest)
				}
				throw cpError
			}
		} else {
			// Restore backup to dest before re-throwing, so the original dest is not lost.
			if (hasBackup) {
				await restoreBackup(backup, dest)
			}
			throw renameError
		}
	}
	if (hasBackup) {
		// Fire-and-forget cleanup of the backup directory. This is safe because:
		// 1. The backup path includes a unique timestamp (Date.now()), so it cannot
		//    conflict with any other path used by concurrent or subsequent operations.
		// 2. The backup is only a safety net for rollback; once the rename/copy to dest
		//    has succeeded, the backup is no longer needed and its cleanup is non-critical.
		// 3. Awaiting this would delay the caller unnecessarily for a best-effort cleanup.
		fs.rm(backup, { recursive: true, force: true }).catch(() => {})
	}
}

/**
 * Restore a backup directory to dest. On Windows, rename can fail with EPERM
 * due to filesystem delays; fall back to cp+rm in that case.
 */
async function restoreBackup(backup: string, dest: string): Promise<void> {
	try {
		await fs.rename(backup, dest)
	} catch (error: any) {
		if (process.platform === "win32" && (error.code === "EPERM" || error.code === "EBUSY")) {
			await fs.cp(backup, dest, { recursive: true }).catch(() => {})
		}
		// If rename fails for any other reason, dest may be lost — nothing more we can do.
	}
}

/**
 * Atomically write a YAML file: write to a temp file first, then rename.
 */
async function atomicWriteYaml(filePath: string, data: unknown): Promise<void> {
	const tmpPath = `${filePath}.tmp-${Date.now()}`
	await fs.mkdir(path.dirname(filePath), { recursive: true })
	await fs.writeFile(tmpPath, yaml.stringify(data), "utf-8")
	for (let i = 0; i < 5; i++) {
		try {
			await fs.rename(tmpPath, filePath)
			return
		} catch (error: any) {
			if ((error.code === "EPERM" || error.code === "EBUSY") && i < 4) {
				await delay(100 * Math.pow(2, i))
				continue
			}
			await fs.unlink(tmpPath).catch(() => {})
			throw error
		}
	}
}

function isWindowsReservedName(name: string): boolean {
	const base = name.split(".")[0].toUpperCase()
	return WINDOWS_RESERVED_NAMES.has(base)
}

function isPathInside(target: string, root: string): boolean {
	const resolvedTarget = path.resolve(target)
	const resolvedRoot = path.resolve(root)
	const relative = path.relative(resolvedRoot, resolvedTarget)
	return !relative.startsWith("..") && !path.isAbsolute(relative)
}

export class AgentInstaller {
	private tmpDir: string
	private rooDir: string
	/**
	 * settingsDir is the VSCode extension's private settings directory
	 * (obtained via `getSettingsDirectoryPath(context.globalStorageUri.fsPath)`).
	 *
	 * This is the correct location for `custom_modes.yaml` and `mcp_settings.json`
	 * because `CustomModesManager` and `McpHub` both read/write these files from
	 * `settingsDir`, NOT from `~/.roo/`. Writing to `settingsDir` ensures that
	 * the file-watchers in `CustomModesManager.watchCustomModesFiles()` and
	 * `McpHub.watchMcpSettingsFile()` can detect the changes and hot-reload.
	 *
	 * When `settingsDir` is undefined (e.g. in unit tests that construct
	 * `AgentInstaller` directly without a VSCode context), the code falls back
	 * to `rooDir` so that tests remain self-contained without needing a real
	 * VSCode extension context.
	 */
	private settingsDir?: string

	constructor(tmpDir?: string, rooDir?: string, settingsDir?: string) {
		// Use the OS-provided temp directory by default (auto-cleaned on reboot,
		// does not pollute the user's home directory with large extracted files).
		this.tmpDir = tmpDir || path.join(os.tmpdir(), "costrict-remote-agent")
		this.rooDir = rooDir || getGlobalRooDirectory()
		this.settingsDir = settingsDir
	}

	getTmpDir(): string {
		return this.tmpDir
	}

	async install(
		zipPath: string,
		versionInfo: ResourcePackageVersion,
		record: LocalInstallRecord,
	): Promise<InstalledManifest> {
		const extractDir = path.join(this.tmpDir, `remote-agent-package-${versionInfo.version}`)
		try {
			await fs.mkdir(extractDir, { recursive: true })
			this.extractZip(zipPath, extractDir)
			const manifest = this.readZipManifest(extractDir, versionInfo.version)

			// uninstall failure must not block install; log and continue.
			try {
				await this.uninstall(record)
			} catch (uninstallError: any) {
				logger.warn(
					`${LOG_PREFIX} Pre-install uninstall failed (non-blocking): ${uninstallError?.message ?? uninstallError}`,
				)
			}

			const installedManifest: InstalledManifest = {
				agents: [],
				commands: [],
				skills: [],
				rules: [],
				mcp: [],
			}

			const declaredModules = new Set(manifest.modules || [])
			const modulesToInstall: Array<keyof InstalledManifest> = ["agents", "commands", "skills", "rules", "mcp"]
			const agentOrder = versionInfo.agents?.order

			for (const moduleType of modulesToInstall) {
				const moduleDir = path.join(extractDir, moduleType)
				const exists = await fs
					.stat(moduleDir)
					.then((s) => s.isDirectory())
					.catch(() => false)
				if (!exists) {
					if (declaredModules.has(moduleType)) {
						logger.warn(`${LOG_PREFIX} manifest declares "${moduleType}" but missing in zip, skipping`)
					}
					continue
				}
				try {
					await this.installModule(moduleType, moduleDir, installedManifest, versionInfo.version, agentOrder)
				} catch (error: any) {
					logger.error(`${LOG_PREFIX} Failed to install module ${moduleType}: ${error.message}`)
					throw error
				}
			}
			logger.info(
				`${LOG_PREFIX} Installation completed, modules: ${modulesToInstall
					.filter((m) => installedManifest[m].length > 0)
					.join(", ")}`,
			)
			// 关键改进：验证失败则整个安装失败
			const errors = await this.verifyInstalled(installedManifest)
			if (errors.length > 0) {
				logger.error(
					`${LOG_PREFIX} Installation verification failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
				)
				// 验证失败，抛出错误，阻止记录文件更新
				throw new Error(`Installation verification failed: ${errors.join(", ")}`)
			}

			logger.info(`${LOG_PREFIX} Installation verified successfully`)
			await this.cleanup(undefined, extractDir)
			return installedManifest
		} catch (error) {
			// Only clean up the extract dir; zipPath is preserved for outer retry reuse.
			// runInstallWithRetries cleans zipPath on final failure.
			await this.cleanup(undefined, extractDir)
			throw error
		}
	}

	async uninstall(record: LocalInstallRecord): Promise<void> {
		if (!record.manifest) {
			return
		}
		const { agents, commands, skills, rules, mcp } = record.manifest

		if (agents.length > 0) {
			try {
				await this.uninstallAgents(agents)
			} catch (error: any) {
				logger.warn(`${LOG_PREFIX} Failed to uninstall agents: ${error.message}`)
			}
		}

		for (const cmd of commands) {
			try {
				await this.uninstallCommand(cmd)
			} catch (error: any) {
				logger.warn(`${LOG_PREFIX} Failed to uninstall command ${cmd}: ${error.message}`)
			}
		}

		for (const skill of skills) {
			try {
				await this.uninstallSkill(skill)
			} catch (error: any) {
				logger.warn(`${LOG_PREFIX} Failed to uninstall skill ${skill}: ${error.message}`)
			}
		}

		for (const rule of rules) {
			try {
				await this.uninstallRule(rule)
			} catch (error: any) {
				logger.warn(`${LOG_PREFIX} Failed to uninstall rule ${rule}: ${error.message}`)
			}
		}
		if (mcp.length > 0) {
			try {
				await this.uninstallMcp(mcp)
			} catch (error: any) {
				logger.warn(`${LOG_PREFIX} Failed to uninstall mcp: ${error.message}`)
			}
		}
		// verifyUninstalled is a non-critical diagnostic step.
		// Wrap it in try-catch so unexpected errors don't propagate and fail the uninstall.
		try {
			const warnings = await this.verifyUninstalled(record.manifest)
			if (warnings.length > 0) {
				logger.warn(
					`${LOG_PREFIX} Uninstallation verification warnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}`,
				)
			} else {
				logger.info(`${LOG_PREFIX} Uninstallation verified: all files removed`)
			}
		} catch (error: any) {
			logger.warn(`${LOG_PREFIX} Uninstallation verification failed unexpectedly: ${error.message}`)
		}
	}

	async cleanup(zipPath?: string, extractDir?: string): Promise<void> {
		if (extractDir) {
			try {
				await fs.rm(extractDir, { recursive: true, force: true })
			} catch {
				// ignore
			}
		}
		if (zipPath) {
			try {
				await fs.unlink(zipPath)
			} catch {
				// ignore
			}
		}
	}

	private extractZip(zipPath: string, extractDir: string): void {
		const zip = new AdmZip(zipPath)
		const entries = zip.getEntries()
		for (const entry of entries) {
			// Normalize separators to forward slashes before checking for traversal.
			// This catches both Unix-style "../evil" and Windows-style "..\evil" entries.
			const normalized = entry.entryName.replace(/\\/g, "/")
			// Use path-segment matching instead of includes("..") to avoid false positives
			// on legitimate filenames like "..hidden" or "file..name".
			// A traversal segment is exactly ".." (not "..hidden" or "file..name").
			const segments = normalized.split("/")
			if (segments.some((seg: string) => seg === "..") || normalized.startsWith("/")) {
				throw new FatalInstallerError("pathTraversal", `Zip entry contains path traversal: ${entry.entryName}`)
			}
		}
		zip.extractAllTo(extractDir, true)
	}

	private readZipManifest(extractDir: string, expectedVersion: string): ZipManifest {
		const manifestPath = path.join(extractDir, "manifest.json")
		if (!fsSync.existsSync(manifestPath)) {
			throw new FatalInstallerError("manifestMissing", "manifest.json is missing in the zip package")
		}
		let manifest: ZipManifest
		try {
			manifest = JSON.parse(fsSync.readFileSync(manifestPath, "utf-8"))
		} catch {
			throw new FatalInstallerError("manifestParseError", "manifest.json is not valid JSON")
		}
		if (!manifest.version) {
			throw new FatalInstallerError("manifestParseError", "manifest.json missing required field: version")
		}
		if (manifest.version !== expectedVersion) {
			throw new FatalInstallerError(
				"manifestVersionMismatch",
				`manifest version mismatch: expected ${expectedVersion}, got ${manifest.version}`,
			)
		}
		return manifest
	}

	private async installModule(
		moduleType: keyof InstalledManifest,
		moduleDir: string,
		manifest: InstalledManifest,
		version: string,
		agentOrder?: string[],
	): Promise<void> {
		switch (moduleType) {
			case "agents":
				manifest.agents = await this.installAgents(moduleDir, version, agentOrder)
				break
			case "commands":
				manifest.commands = await this.installCommands(moduleDir, version)
				break
			case "skills":
				manifest.skills = await this.installSkills(moduleDir, version)
				break
			case "rules":
				manifest.rules = await this.installRules(moduleDir)
				break
			case "mcp":
				manifest.mcp = await this.installMcp(moduleDir)
				break
		}
	}

	private async installAgents(agentsDir: string, version: string, agentOrder?: string[]): Promise<string[]> {
		const customModesPath = path.join(this.settingsDir || this.rooDir, "custom_modes.yaml")
		const files = await fs.readdir(agentsDir)
		const yamlFiles = files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
		const slugs: string[] = []

		let customModes: any = { customModes: [] }
		try {
			const content = await fs.readFile(customModesPath, "utf-8")
			customModes = yaml.parse(content) || { customModes: [] }
		} catch (error: any) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				// Local config file is corrupted — log a warning and reset to empty rather than
				// treating it as a fatal error. The corrupted file will be overwritten with valid
				// content at the end of installAgents(), effectively auto-repairing it.
				logger.warn(
					`${LOG_PREFIX} Failed to parse local custom_modes.yaml, resetting to empty: ${error.message}`,
				)
			}
			customModes = { customModes: [] }
		}

		if (!Array.isArray(customModes.customModes)) {
			customModes.customModes = []
		}

		for (const file of yamlFiles) {
			const filePath = path.join(agentsDir, file)
			// Path safety for zip contents is enforced by extractZip(); no additional check needed here.
			try {
				const rawContent = await fs.readFile(filePath, "utf-8")
				const content = rawContent.replace(/\$\{version\}/g, version)
				const modeConfig = yaml.parse(content)
				if (!modeConfig || !modeConfig.slug) {
					logger.warn(`${LOG_PREFIX} YAML file ${file} missing slug, skipping`)
					continue
				}
				const idx = customModes.customModes.findIndex((m: any) => m.slug === modeConfig.slug)
				if (idx >= 0) {
					customModes.customModes[idx] = modeConfig
				} else {
					customModes.customModes.push(modeConfig)
				}
				slugs.push(modeConfig.slug)
			} catch (error: any) {
				throw new FatalInstallerError("yamlParseError", `Failed to parse agent YAML ${file}: ${error.message}`)
			}
		}

		// Sort agents according to agents.order from versionInfo (latest.json).
		// Priority: completeness first (all agents installed), then order.
		// Pre-existing modes (not part of this install) keep their relative positions.
		// Agents not listed in order are appended to the end.
		if (Array.isArray(agentOrder) && agentOrder.length > 0 && slugs.length > 0) {
			const installedSlugSet = new Set(slugs)
			const preExisting = customModes.customModes.filter((m: any) => !installedSlugSet.has(m.slug))
			const installed = customModes.customModes.filter((m: any) => installedSlugSet.has(m.slug))

			const orderMap = new Map(agentOrder.map((slug, index) => [slug, index]))
			installed.sort((a: any, b: any) => {
				const aIdx = orderMap.has(a.slug) ? orderMap.get(a.slug)! : Infinity
				const bIdx = orderMap.has(b.slug) ? orderMap.get(b.slug)! : Infinity
				return aIdx - bIdx
			})

			customModes.customModes = [...preExisting, ...installed]
		}

		await atomicWriteYaml(customModesPath, customModes)
		return slugs
	}

	private async installCommands(commandsDir: string, version: string): Promise<string[]> {
		const targetDir = path.join(this.rooDir, "commands")
		await fs.mkdir(targetDir, { recursive: true })
		const files = await fs.readdir(commandsDir)
		const mdFiles = files.filter((f) => f.endsWith(".md"))
		const installed: string[] = []

		for (const file of mdFiles) {
			const src = path.join(commandsDir, file)
			const dest = path.join(targetDir, file)
			this.assertPathSafe(dest, targetDir)
			if (process.platform === "win32" && isWindowsReservedName(file)) {
				throw new FatalInstallerError("reservedDeviceName", `Reserved device name: ${file}`)
			}
			// Replace ${version} placeholder before copying so the final write is atomic.
			// Reading from src (in the temp extract dir) avoids a non-atomic read-modify-write
			// on the destination file.
			const content = await fs.readFile(src, "utf-8")
			const replaced = content.replace(/\$\{version\}/g, version)
			if (replaced !== content) {
				// Write the replaced content to a temp file, then atomically copy to dest.
				const tmpSrc = `${src}.tmp-${Date.now()}`
				await fs.writeFile(tmpSrc, replaced, "utf-8")
				try {
					await atomicCopyFile(tmpSrc, dest)
				} finally {
					await fs.unlink(tmpSrc).catch(() => {})
				}
			} else {
				await atomicCopyFile(src, dest)
			}
			installed.push(file)
		}
		return installed
	}

	private async installSkills(skillsDir: string, version: string): Promise<string[]> {
		const targetDir = path.join(this.rooDir, "skills")
		await fs.mkdir(targetDir, { recursive: true })
		const entries = await fs.readdir(skillsDir, { withFileTypes: true })
		const dirs = entries.filter((e) => e.isDirectory())
		const installed: string[] = []

		for (const dir of dirs) {
			const skillName = dir.name
			const src = path.join(skillsDir, skillName)
			const dest = path.join(targetDir, skillName)
			this.assertPathSafe(dest, targetDir)
			if (process.platform === "win32" && isWindowsReservedName(skillName)) {
				throw new FatalInstallerError("reservedDeviceName", `Reserved device name: ${skillName}`)
			}

			const tmpDest = `${dest}.tmp-${Date.now()}`
			await fs.cp(src, tmpDest, { recursive: true })
			await this.replaceSkillPathPlaceholders(
				tmpDest,
				path.join(targetDir, skillName).replace(/\\/g, "/"),
				version,
			)
			await atomicReplaceDirectory(tmpDest, dest)
			installed.push(skillName)
		}
		return installed
	}

	private async replaceSkillPathPlaceholders(dir: string, skillPath: string, version: string): Promise<void> {
		const entries = await fs.readdir(dir, { withFileTypes: true })
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				await this.replaceSkillPathPlaceholders(fullPath, skillPath, version)
			} else if (entry.name.endsWith(".md")) {
				const content = await fs.readFile(fullPath, "utf-8")
				const replaced = content.replace(/\$\{skill_path\}/g, skillPath).replace(/\$\{version\}/g, version)
				if (replaced !== content) {
					await fs.writeFile(fullPath, replaced, "utf-8")
				}
			}
		}
	}

	private async installRules(rulesDir: string): Promise<string[]> {
		// Rules are installed directly under rooDir (e.g., ~/.roo/{rules_dirname}).
		// Each entry in the zip's rules/ directory maps to ~/.roo/{entry_name}.
		const targetDir = this.rooDir
		const entries = await fs.readdir(rulesDir, { withFileTypes: true })
		const installed: string[] = []

		for (const entry of entries) {
			const name = entry.name
			const src = path.join(rulesDir, name)
			const dest = path.join(targetDir, name)
			this.assertPathSafe(dest, targetDir)
			if (process.platform === "win32" && isWindowsReservedName(name)) {
				throw new FatalInstallerError("reservedDeviceName", `Reserved device name: ${name}`)
			}

			if (entry.isDirectory()) {
				const tmpDest = `${dest}.tmp-${Date.now()}`
				await fs.cp(src, tmpDest, { recursive: true })
				await atomicReplaceDirectory(tmpDest, dest)
			} else {
				await atomicCopyFile(src, dest)
			}
			installed.push(name)
		}
		return installed
	}

	private async installMcp(mcpDir: string): Promise<string[]> {
		const mcpSettingsPath = path.join(this.settingsDir || this.rooDir, "mcp_settings.json")
		const files = await fs.readdir(mcpDir)
		const jsonFiles = files.filter((f) => f.endsWith(".json"))
		const serverNames: string[] = []

		let settings: any = { mcpServers: {} }
		try {
			const content = await fs.readFile(mcpSettingsPath, "utf-8")
			settings = JSON.parse(content)
		} catch (error: any) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				// Local config file is corrupted — log a warning and reset to empty rather than
				// treating it as a fatal error. The corrupted file will be overwritten with valid
				// content at the end of installMcp(), effectively auto-repairing it.
				logger.warn(
					`${LOG_PREFIX} Failed to parse local mcp_settings.json, resetting to empty: ${error.message}`,
				)
			}
			settings = { mcpServers: {} }
		}

		if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
			settings.mcpServers = {}
		}

		for (const file of jsonFiles) {
			const filePath = path.join(mcpDir, file)
			// Path safety for zip contents is enforced by extractZip(); no additional check needed here.
			try {
				const content = await fs.readFile(filePath, "utf-8")
				const parsed = JSON.parse(content)
				if (!parsed || typeof parsed !== "object") {
					continue
				}
				// MCP JSON files use the standard mcp_settings.json nested format:
				//   { "serverName": { "type": "stdio", "command": "...", ... }, ... }
				// Each top-level key is a server name; the value is the server config object.
				// This matches the format used by mcp_settings.json and the actual zip packages.
				for (const [serverName, serverConfig] of Object.entries(parsed)) {
					if (!serverConfig || typeof serverConfig !== "object" || Object.keys(serverConfig).length === 0) {
						logger.warn(`${LOG_PREFIX} Skipping invalid MCP server entry "${serverName}" in ${file}`)
						continue
					}
					settings.mcpServers[serverName] = serverConfig
					serverNames.push(serverName)
				}
			} catch (error: any) {
				throw new FatalInstallerError("jsonParseError", `Failed to parse MCP JSON ${file}: ${error.message}`)
			}
		}

		await safeWriteJson(mcpSettingsPath, settings)
		return serverNames
	}

	private async uninstallAgents(slugs: string[]): Promise<void> {
		const customModesPath = path.join(this.settingsDir || this.rooDir, "custom_modes.yaml")
		if (!fsSync.existsSync(customModesPath)) {
			return
		}
		const content = fsSync.readFileSync(customModesPath, "utf-8")
		const data = yaml.parse(content) || { customModes: [] }
		if (Array.isArray(data.customModes)) {
			data.customModes = data.customModes.filter((m: any) => !slugs.includes(m?.slug))
		}
		await atomicWriteYaml(customModesPath, data)
	}

	private async uninstallCommand(fileName: string): Promise<void> {
		const filePath = path.join(this.rooDir, "commands", fileName)
		await fs.unlink(filePath).catch(() => {})
	}

	private async uninstallSkill(skillName: string): Promise<void> {
		const dirPath = path.join(this.rooDir, "skills", skillName)
		await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {})
	}

	private async uninstallRule(ruleName: string): Promise<void> {
		const rulePath = path.join(this.rooDir, ruleName)
		const stat = await fs.stat(rulePath).catch(() => null)
		if (!stat) {
			return
		}
		if (stat.isDirectory()) {
			await fs.rm(rulePath, { recursive: true, force: true }).catch(() => {})
		} else {
			await fs.unlink(rulePath).catch(() => {})
		}
	}

	private async uninstallMcp(serverNames: string[]): Promise<void> {
		const mcpSettingsPath = path.join(this.settingsDir || this.rooDir, "mcp_settings.json")
		if (!fsSync.existsSync(mcpSettingsPath)) {
			return
		}
		const content = fsSync.readFileSync(mcpSettingsPath, "utf-8")
		let data: any
		try {
			data = JSON.parse(content)
		} catch (error: any) {
			// mcp_settings.json is corrupted — log a precise warning and skip the write.
			// Without this try/catch the SyntaxError would propagate to uninstall()'s outer
			// catch block, which logs a generic "Failed to uninstall mcp" message that
			// obscures the real cause (invalid JSON) and makes debugging harder.
			logger.warn(
				`${LOG_PREFIX} mcp_settings.json contains invalid JSON, skipping MCP uninstall: ${error.message}`,
			)
			return
		}
		if (data.mcpServers && typeof data.mcpServers === "object") {
			for (const name of serverNames) {
				delete data.mcpServers[name]
			}
			await safeWriteJson(mcpSettingsPath, data)
		}
	}

	private async verifyInstalled(manifest: InstalledManifest): Promise<string[]> {
		const warnings: string[] = []

		if (manifest.agents.length > 0) {
			const customModesPath = path.join(this.settingsDir || this.rooDir, "custom_modes.yaml")
			if (!fsSync.existsSync(customModesPath)) {
				warnings.push(`custom_modes.yaml missing`)
			} else {
				try {
					const data = yaml.parse(fsSync.readFileSync(customModesPath, "utf-8"))
					const slugs = new Set((data?.customModes || []).map((m: any) => m?.slug).filter(Boolean))
					for (const slug of manifest.agents) {
						if (!slugs.has(slug)) warnings.push(`agent "${slug}" not found in custom_modes.yaml`)
					}
				} catch (e: any) {
					warnings.push(`failed to read custom_modes.yaml: ${e.message}`)
				}
			}
		}

		if (manifest.mcp.length > 0) {
			const mcpSettingsPath = path.join(this.settingsDir || this.rooDir, "mcp_settings.json")
			if (!fsSync.existsSync(mcpSettingsPath)) {
				warnings.push(`mcp_settings.json missing`)
			} else {
				try {
					const data = JSON.parse(fsSync.readFileSync(mcpSettingsPath, "utf-8"))
					for (const name of manifest.mcp) {
						if (!data?.mcpServers?.[name]) warnings.push(`mcp server "${name}" not found`)
					}
				} catch (e: any) {
					warnings.push(`failed to read mcp_settings.json: ${e.message}`)
				}
			}
		}

		for (const cmd of manifest.commands) {
			if (!fsSync.existsSync(path.join(this.rooDir, "commands", cmd))) {
				warnings.push(`command "${cmd}" missing`)
			}
		}

		for (const skill of manifest.skills) {
			if (!fsSync.existsSync(path.join(this.rooDir, "skills", skill))) {
				warnings.push(`skill "${skill}" missing`)
			}
		}

		for (const rule of manifest.rules) {
			if (!fsSync.existsSync(path.join(this.rooDir, rule))) {
				warnings.push(`rule "${rule}" missing`)
			}
		}

		return warnings
	}

	private async verifyUninstalled(manifest: InstalledManifest | null): Promise<string[]> {
		if (!manifest) return []
		const warnings: string[] = []

		if (manifest.agents.length > 0) {
			const customModesPath = path.join(this.settingsDir || this.rooDir, "custom_modes.yaml")
			if (fsSync.existsSync(customModesPath)) {
				try {
					const data = yaml.parse(fsSync.readFileSync(customModesPath, "utf-8"))
					const slugs = new Set((data?.customModes || []).map((m: any) => m?.slug).filter(Boolean))
					for (const slug of manifest.agents) {
						if (slugs.has(slug)) warnings.push(`agent "${slug}" still present in custom_modes.yaml`)
					}
				} catch (e: any) {
					warnings.push(`failed to read custom_modes.yaml: ${e.message}`)
				}
			}
		}

		if (manifest.mcp.length > 0) {
			const mcpSettingsPath = path.join(this.settingsDir || this.rooDir, "mcp_settings.json")
			if (fsSync.existsSync(mcpSettingsPath)) {
				try {
					const data = JSON.parse(fsSync.readFileSync(mcpSettingsPath, "utf-8"))
					for (const name of manifest.mcp) {
						if (data?.mcpServers?.[name]) warnings.push(`mcp server "${name}" still present`)
					}
				} catch (e: any) {
					warnings.push(`failed to read mcp_settings.json: ${e.message}`)
				}
			}
		}

		for (const cmd of manifest.commands) {
			if (fsSync.existsSync(path.join(this.rooDir, "commands", cmd))) {
				warnings.push(`command "${cmd}" still present`)
			}
		}

		for (const skill of manifest.skills) {
			if (fsSync.existsSync(path.join(this.rooDir, "skills", skill))) {
				warnings.push(`skill "${skill}" still present`)
			}
		}

		for (const rule of manifest.rules) {
			if (fsSync.existsSync(path.join(this.rooDir, rule))) {
				warnings.push(`rule "${rule}" still present`)
			}
		}

		return warnings
	}

	private assertPathSafe(target: string, root: string): void {
		if (!isPathInside(target, root)) {
			throw new FatalInstallerError("pathTraversal", `Path ${target} escapes root ${root}`)
		}
	}
}
