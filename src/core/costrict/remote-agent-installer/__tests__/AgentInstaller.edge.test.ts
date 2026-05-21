/**
 * AgentInstaller edge case tests.
 * Covers: partial modules, path traversal, skill placeholder replacement, manifest validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import * as os from "os"
import { AgentInstaller } from "../AgentInstaller"
import { FatalInstallerError } from "../types"
import type { LocalInstallRecord, ResourcePackageVersion } from "../types"

vi.mock("../../../utils/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		channel: { appendLine: vi.fn() },
	}),
}))

vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockResolvedValue(undefined),
}))

// Helper: create a zip with specified modules
// modules: { moduleName: fileContentString | { fileName: fileContent } }
// For skills, the value can be nested: { "skill-dir": { "file.md": "content" } }
async function createZipWithModules(destPath: string, modules: Record<string, any>, version = "1.0.0"): Promise<void> {
	const AdmZip = (await import("adm-zip")).default
	const zip = new AdmZip()

	const srcDir = path.join(path.dirname(destPath), "zip-src-" + Date.now())
	await fs.mkdir(srcDir, { recursive: true })

	// Always create manifest
	const manifestModules = Object.keys(modules)
	await fs.writeFile(
		path.join(srcDir, "manifest.json"),
		JSON.stringify({ version, modules: manifestModules }),
		"utf-8",
	)

	for (const [moduleName, content] of Object.entries(modules)) {
		const moduleDir = path.join(srcDir, moduleName)
		await fs.mkdir(moduleDir, { recursive: true })

		if (typeof content === "string") {
			const ext = moduleName === "agents" ? "test.yaml" : moduleName === "mcp" ? "test.json" : "test.md"
			await fs.writeFile(path.join(moduleDir, ext), content, "utf-8")
		} else if (typeof content === "object" && content !== null) {
			for (const [entryName, entryContent] of Object.entries(content as Record<string, any>)) {
				const entryPath = path.join(moduleDir, entryName)
				if (typeof entryContent === "string") {
					// Ensure parent directories exist
					await fs.mkdir(path.dirname(entryPath), { recursive: true })
					await fs.writeFile(entryPath, entryContent, "utf-8")
				} else if (typeof entryContent === "object" && entryContent !== null) {
					// Nested directory (e.g., skills/my-skill/skill.md)
					await fs.mkdir(entryPath, { recursive: true })
					for (const [subName, subContent] of Object.entries(entryContent as Record<string, string>)) {
						await fs.writeFile(path.join(entryPath, subName), subContent, "utf-8")
					}
				}
			}
		}
	}

	zip.addLocalFolder(srcDir)
	zip.writeZip(destPath)
	await fs.rm(srcDir, { recursive: true, force: true })
}

describe("AgentInstaller edge cases", () => {
	let tmpDir: string
	let rooDir: string

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `ri-edge-test-${Date.now()}`)
		rooDir = path.join(tmpDir, "roo")
		await fs.mkdir(tmpDir, { recursive: true })
		await fs.mkdir(rooDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("should install only existing modules when zip has partial modules", async () => {
		// Create zip with only agents and commands (no skills, rules, mcp)
		const zipPath = path.join(tmpDir, "partial.zip")
		await createZipWithModules(zipPath, {
			agents: "name: Test Agent\nslug: test-agent\n",
			commands: { "test-cmd.md": "# Test Command\n" },
		})

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		const manifest = await installer.install(zipPath, versionInfo, record)

		expect(manifest.agents).toContain("test-agent")
		expect(manifest.commands).toContain("test-cmd.md")
		expect(manifest.skills).toEqual([])
		expect(manifest.rules).toEqual([])
		expect(manifest.mcp).toEqual([])
	})

	it("should replace ${skill_path} placeholders in skill .md files", async () => {
		const zipPath = path.join(tmpDir, "skill-placeholder.zip")
		await createZipWithModules(zipPath, {
			agents: "name: Agent\nslug: agent-a\n",
			skills: {
				"my-skill": {
					"skill.md": "Path is ${skill_path}/some/file.txt\nNo placeholder here.\n",
				},
			},
		})

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		const manifest = await installer.install(zipPath, versionInfo, record)
		expect(manifest.skills).toContain("my-skill")

		// Verify the placeholder was replaced
		const skillMd = fsSync.readFileSync(path.join(rooDir, "skills", "my-skill", "skill.md"), "utf-8")
		expect(skillMd).not.toContain("${skill_path}")
		expect(skillMd).toContain("/skills/my-skill/some/file.txt")
		expect(skillMd).toContain("No placeholder here.")
	})

	it("should reject zip with path traversal entries", async () => {
		const AdmZip = (await import("adm-zip")).default
		const zipPath = path.join(tmpDir, "traversal.zip")
		const zip = new AdmZip()

		const srcDir = path.join(tmpDir, "traversal-src")
		await fs.mkdir(srcDir, { recursive: true })
		await fs.writeFile(
			path.join(srcDir, "manifest.json"),
			JSON.stringify({ version: "1.0.0", modules: ["agents"] }),
			"utf-8",
		)
		await fs.mkdir(path.join(srcDir, "agents"), { recursive: true })
		await fs.writeFile(path.join(srcDir, "agents", "evil.yaml"), "name: evil\nslug: evil\n", "utf-8")

		zip.addLocalFolder(srcDir)
		zip.writeZip(zipPath)
		await fs.rm(srcDir, { recursive: true, force: true })

		// Re-open the zip and inject a raw entry with path traversal
		// adm-zip normalizes paths on addFile, so we need to manipulate the zip directly
		const zip2 = new AdmZip(zipPath)
		// Add entry with absolute path (also caught by the check: startsWith("/"))
		zip2.addFile("/etc/evil.txt", Buffer.from("pwned"))
		zip2.writeZip(zipPath)

		// Verify the malicious entry exists
		const verifyZip = new AdmZip(zipPath)
		const hasTraversal = verifyZip.getEntries().some((e: any) => e.entryName.startsWith("/"))
		if (!hasTraversal) {
			// If adm-zip won't preserve the traversal entry, skip this test
			console.warn("Skipping path traversal test: adm-zip normalizes entries on this platform")
			return
		}

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		await expect(installer.install(zipPath, versionInfo, record)).rejects.toThrow("path traversal")
	})

	it("should reject zip with manifest version mismatch", async () => {
		const zipPath = path.join(tmpDir, "version-mismatch.zip")
		const AdmZip = (await import("adm-zip")).default
		const zip = new AdmZip()

		const srcDir = path.join(tmpDir, "mismatch-src")
		await fs.mkdir(srcDir, { recursive: true })
		await fs.writeFile(
			path.join(srcDir, "manifest.json"),
			JSON.stringify({ version: "0.5.0", modules: [] }),
			"utf-8",
		)

		zip.addLocalFolder(srcDir)
		zip.writeZip(zipPath)
		await fs.rm(srcDir, { recursive: true, force: true })

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		await expect(installer.install(zipPath, versionInfo, record)).rejects.toThrow("version mismatch")
	})

	it("should install agents and mcp to settingsDir when provided", async () => {
		const zipPath = path.join(tmpDir, "settings-dir.zip")
		await createZipWithModules(zipPath, {
			agents: "name: SettingsDir Agent\nslug: settings-agent\n",
			// use nested format (standard mcp_settings.json format)
			mcp: JSON.stringify({ "settings-server": { url: "http://localhost" } }),
		})

		const settingsDir = path.join(tmpDir, "settings")
		await fs.mkdir(settingsDir, { recursive: true })
		const installer = new AgentInstaller(tmpDir, rooDir, settingsDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		const manifest = await installer.install(zipPath, versionInfo, record)

		// Verify agents were written to settingsDir, not rooDir
		expect(fsSync.existsSync(path.join(settingsDir, "custom_modes.yaml"))).toBe(true)
		expect(fsSync.existsSync(path.join(rooDir, "custom_modes.yaml"))).toBe(false)
		expect(manifest.agents).toContain("settings-agent")

		// Verify mcp was written to settingsDir, not rooDir
		expect(fsSync.existsSync(path.join(settingsDir, "mcp_settings.json"))).toBe(true)
		expect(fsSync.existsSync(path.join(rooDir, "mcp_settings.json"))).toBe(false)
		expect(manifest.mcp).toContain("settings-server")
	})

	it("should use default rooDir ~/.roo when no rooDir argument is provided", async () => {
		const mockHome = path.join(tmpDir, "mock-home")
		await fs.mkdir(mockHome, { recursive: true })

		// os.homedir() reads from USERPROFILE (Windows) or HOME (Linux/macOS)
		const originalUserProfile = process.env.USERPROFILE
		const originalHome = process.env.HOME
		process.env.USERPROFILE = mockHome
		process.env.HOME = mockHome

		try {
			// Re-import to pick up new homedir value
			const { AgentInstaller: RI } = await import("../AgentInstaller")
			const installer = new RI()
			// Access private field via type assertion to verify default path
			const actualRooDir = (installer as any).rooDir
			expect(actualRooDir).toBe(path.join(mockHome, ".roo"))
		} finally {
			process.env.USERPROFILE = originalUserProfile
			process.env.HOME = originalHome
		}
	})

	it("should reject zip without manifest.json", async () => {
		const AdmZip = (await import("adm-zip")).default
		const zipPath = path.join(tmpDir, "no-manifest.zip")
		const zip = new AdmZip()

		const srcDir = path.join(tmpDir, "no-manifest-src")
		await fs.mkdir(srcDir, { recursive: true })
		await fs.mkdir(path.join(srcDir, "agents"), { recursive: true })
		await fs.writeFile(path.join(srcDir, "agents", "test.yaml"), "name: test\nslug: test\n", "utf-8")

		zip.addLocalFolder(srcDir)
		zip.writeZip(zipPath)
		await fs.rm(srcDir, { recursive: true, force: true })

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		await expect(installer.install(zipPath, versionInfo, record)).rejects.toThrow("manifest")
	})

	// Bug: corrupted local custom_modes.yaml should NOT be treated as FatalInstallerError.
	// It is a local file issue, not a zip content issue. The installer should warn and
	// fall back to an empty customModes array, then overwrite the corrupted file.
	it("should warn and continue when local custom_modes.yaml is corrupted (not FatalError)", async () => {
		const zipPath = path.join(tmpDir, "agents-test.zip")
		await createZipWithModules(zipPath, {
			agents: "name: Test Agent\nslug: test-agent\n",
		})

		const installer = new AgentInstaller(tmpDir, rooDir)

		// Pre-create a corrupted custom_modes.yaml in rooDir
		const customModesPath = path.join(rooDir, "custom_modes.yaml")
		await fs.writeFile(customModesPath, "{ invalid yaml: [unclosed", "utf-8")

		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		// Should NOT throw FatalInstallerError — should succeed by overwriting the corrupted file
		const manifest = await installer.install(zipPath, versionInfo, record)
		expect(manifest.agents).toContain("test-agent")
	})

	// Bug: corrupted local mcp_settings.json should NOT be treated as FatalInstallerError.
	// It is a local file issue. The installer should warn and fall back to empty mcpServers.
	it("should warn and continue when local mcp_settings.json is corrupted (not FatalError)", async () => {
		const zipPath = path.join(tmpDir, "mcp-test.zip")
		await createZipWithModules(zipPath, {
			// use nested format (standard mcp_settings.json format)
			mcp: JSON.stringify({ "test-server": { url: "http://localhost:3000" } }),
		})

		const installer = new AgentInstaller(tmpDir, rooDir)

		// Pre-create a corrupted mcp_settings.json in rooDir
		const mcpSettingsPath = path.join(rooDir, "mcp_settings.json")
		await fs.writeFile(mcpSettingsPath, "{ invalid json: [unclosed", "utf-8")

		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		// Should NOT throw FatalInstallerError — should succeed by overwriting the corrupted file
		const manifest = await installer.install(zipPath, versionInfo, record)
		expect(manifest.mcp).toContain("test-server")
	})

	// Requirement 2: zip extra content is ignored and cleaned up with extractDir
	it("should ignore extra content in zip (non-module directories) and clean up after install", async () => {
		const AdmZip = (await import("adm-zip")).default
		const zipPath = path.join(tmpDir, "extra-content.zip")
		const zip = new AdmZip()

		const srcDir = path.join(tmpDir, "extra-src")
		await fs.mkdir(path.join(srcDir, "commands"), { recursive: true })
		await fs.mkdir(path.join(srcDir, "extra-dir"), { recursive: true })
		await fs.writeFile(
			path.join(srcDir, "manifest.json"),
			JSON.stringify({ version: "1.0.0", modules: ["commands"] }),
			"utf-8",
		)
		await fs.writeFile(path.join(srcDir, "commands", "cmd.md"), "# Cmd\n", "utf-8")
		// Extra content not in any known module
		await fs.writeFile(path.join(srcDir, "extra-dir", "extra.txt"), "extra content", "utf-8")
		await fs.writeFile(path.join(srcDir, "README.md"), "readme", "utf-8")

		zip.addLocalFolder(srcDir)
		zip.writeZip(zipPath)
		await fs.rm(srcDir, { recursive: true, force: true })

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		const manifest = await installer.install(zipPath, versionInfo, record)

		// Only known module content is installed
		expect(manifest.commands).toContain("cmd.md")
		expect(fsSync.existsSync(path.join(rooDir, "commands", "cmd.md"))).toBe(true)

		// Extra content is NOT installed to rooDir
		expect(fsSync.existsSync(path.join(rooDir, "extra-dir"))).toBe(false)
		expect(fsSync.existsSync(path.join(rooDir, "README.md"))).toBe(false)

		// extractDir is cleaned up after install (no residual temp files)
		const extractDir = path.join(tmpDir, "remote-agent-package-1.0.0")
		expect(fsSync.existsSync(extractDir)).toBe(false)
	})

	// Requirement 3: zip has no root directory (flat structure)
	it("should install from zip with no root directory (flat zip structure)", async () => {
		const AdmZip = (await import("adm-zip")).default
		const zipPath = path.join(tmpDir, "flat-zip.zip")
		const zip = new AdmZip()

		// Build zip with flat structure: manifest.json and commands/ at root level
		const srcDir = path.join(tmpDir, "flat-src")
		await fs.mkdir(path.join(srcDir, "commands"), { recursive: true })
		await fs.writeFile(
			path.join(srcDir, "manifest.json"),
			JSON.stringify({ version: "1.0.0", modules: ["commands"] }),
			"utf-8",
		)
		await fs.writeFile(path.join(srcDir, "commands", "flat-cmd.md"), "# Flat Command\n", "utf-8")

		zip.addLocalFolder(srcDir)
		zip.writeZip(zipPath)
		await fs.rm(srcDir, { recursive: true, force: true })

		// Verify zip has flat structure (no root directory prefix)
		const verifyZip = new AdmZip(zipPath)
		const entries = verifyZip.getEntries().map((e: any) => e.entryName)
		expect(entries.some((e: string) => e === "manifest.json" || e.startsWith("manifest.json"))).toBe(true)

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		const manifest = await installer.install(zipPath, versionInfo, record)
		expect(manifest.commands).toContain("flat-cmd.md")
		expect(fsSync.existsSync(path.join(rooDir, "commands", "flat-cmd.md"))).toBe(true)
	})

	// Requirement 5 (TDD): ${version} placeholder replacement in skill .md files
	it("should replace ${version} placeholders in skill .md files", async () => {
		const zipPath = path.join(tmpDir, "skill-version-placeholder.zip")
		await createZipWithModules(
			zipPath,
			{
				skills: {
					"my-skill": {
						"skill.md": "Version is ${version}\nPath is ${skill_path}/file.txt\n",
						"other.md": "Also version ${version} here.\n",
						"no-placeholder.md": "No placeholders here.\n",
					},
				},
			},
			"2.3.1",
		)

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "2.3.1" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		const manifest = await installer.install(zipPath, versionInfo, record)
		expect(manifest.skills).toContain("my-skill")

		const skillMd = fsSync.readFileSync(path.join(rooDir, "skills", "my-skill", "skill.md"), "utf-8")
		expect(skillMd).not.toContain("${version}")
		expect(skillMd).toContain("Version is 2.3.1")
		// ${skill_path} should also be replaced
		expect(skillMd).not.toContain("${skill_path}")
		expect(skillMd).toContain("/skills/my-skill/file.txt")

		const otherMd = fsSync.readFileSync(path.join(rooDir, "skills", "my-skill", "other.md"), "utf-8")
		expect(otherMd).not.toContain("${version}")
		expect(otherMd).toContain("Also version 2.3.1 here.")

		const noPlaceholderMd = fsSync.readFileSync(
			path.join(rooDir, "skills", "my-skill", "no-placeholder.md"),
			"utf-8",
		)
		expect(noPlaceholderMd).toBe("No placeholders here.\n")
	})

	// Requirement 5: ${version} placeholder is also replaced in agents/ YAML files
	it("should replace ${version} placeholders in agents/ YAML files", async () => {
		const zipPath = path.join(tmpDir, "agent-version-placeholder.zip")
		await createZipWithModules(
			zipPath,
			{
				agents: `name: My Agent v\${version}\nslug: my-agent\nroleDefinition: "Version \${version} agent"\n`,
			},
			"3.0.0",
		)

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "3.0.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		const manifest = await installer.install(zipPath, versionInfo, record)
		expect(manifest.agents).toContain("my-agent")

		// Verify the agent was installed with version replaced
		const customModesPath = path.join(rooDir, "custom_modes.yaml")
		const content = fsSync.readFileSync(customModesPath, "utf-8")
		expect(content).not.toContain("${version}")
		expect(content).toContain("3.0.0")
	})

	// Requirement 5: ${version} placeholder is also replaced in commands/ .md files
	it("should replace ${version} placeholders in commands/ .md files", async () => {
		const zipPath = path.join(tmpDir, "command-version-placeholder.zip")
		await createZipWithModules(
			zipPath,
			{
				commands: {
					"my-command.md": "# My Command v${version}\n\nThis command is for version ${version}.\n",
				},
			},
			"4.2.0",
		)

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "4.2.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		const manifest = await installer.install(zipPath, versionInfo, record)
		expect(manifest.commands).toContain("my-command.md")

		const cmdMd = fsSync.readFileSync(path.join(rooDir, "commands", "my-command.md"), "utf-8")
		expect(cmdMd).not.toContain("${version}")
		expect(cmdMd).toContain("My Command v4.2.0")
		expect(cmdMd).toContain("version 4.2.0")
	})

	// Requirement 5: ${version} placeholder is NOT replaced in non-.md files in skills
	it("should NOT replace ${version} in non-.md files in skills", async () => {
		const AdmZip = (await import("adm-zip")).default
		const zipPath = path.join(tmpDir, "skill-version-non-md.zip")
		const zip = new AdmZip()

		const srcDir = path.join(tmpDir, "skill-non-md-src")
		await fs.mkdir(path.join(srcDir, "skills", "my-skill"), { recursive: true })
		await fs.writeFile(
			path.join(srcDir, "manifest.json"),
			JSON.stringify({ version: "1.5.0", modules: ["skills"] }),
			"utf-8",
		)
		await fs.writeFile(path.join(srcDir, "skills", "my-skill", "skill.md"), "Version ${version}\n", "utf-8")
		await fs.writeFile(path.join(srcDir, "skills", "my-skill", "config.json"), '{"v":"${version}"}', "utf-8")
		await fs.writeFile(path.join(srcDir, "skills", "my-skill", "script.sh"), "echo ${version}", "utf-8")

		zip.addLocalFolder(srcDir)
		zip.writeZip(zipPath)
		await fs.rm(srcDir, { recursive: true, force: true })

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.5.0" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		await installer.install(zipPath, versionInfo, record)

		// .md file: ${version} replaced
		const skillMd = fsSync.readFileSync(path.join(rooDir, "skills", "my-skill", "skill.md"), "utf-8")
		expect(skillMd).toContain("Version 1.5.0")

		// non-.md files: ${version} NOT replaced (unchanged)
		const configJson = fsSync.readFileSync(path.join(rooDir, "skills", "my-skill", "config.json"), "utf-8")
		expect(configJson).toBe('{"v":"${version}"}')

		const scriptSh = fsSync.readFileSync(path.join(rooDir, "skills", "my-skill", "script.sh"), "utf-8")
		expect(scriptSh).toBe("echo ${version}")
	})
})

// ─── Fix [M-3]: uninstallMcp should not throw when mcp_settings.json is corrupted ───
describe("AgentInstaller uninstall edge cases", () => {
	let tmpDir: string
	let rooDir: string

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `ri-uninstall-edge-${Date.now()}`)
		rooDir = path.join(tmpDir, "roo")
		await fs.mkdir(tmpDir, { recursive: true })
		await fs.mkdir(rooDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("[M-3] should not throw when mcp_settings.json is corrupted during uninstall", async () => {
		// Write a corrupted mcp_settings.json
		const mcpSettingsPath = path.join(rooDir, "mcp_settings.json")
		await fs.writeFile(mcpSettingsPath, "{ invalid json !!!", "utf-8")

		const installer = new AgentInstaller(tmpDir, rooDir)
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "1.0.0",
			lastCheckedAt: Date.now(),
			installState: "installed",
			manifest: {
				agents: [],
				commands: [],
				skills: [],
				rules: [],
				mcp: ["my-server"],
			},
		}

		// Should NOT throw — corrupted mcp_settings.json during uninstall must be handled gracefully
		await expect(installer.uninstall(record)).resolves.not.toThrow()
	})

	it("[M-3] should not throw when mcp_settings.json is corrupted and uninstall completes other modules", async () => {
		// Create a command file to uninstall
		const commandsDir = path.join(rooDir, "commands")
		await fs.mkdir(commandsDir, { recursive: true })
		await fs.writeFile(path.join(commandsDir, "test.md"), "# test", "utf-8")

		// Write a corrupted mcp_settings.json
		const mcpSettingsPath = path.join(rooDir, "mcp_settings.json")
		await fs.writeFile(mcpSettingsPath, "CORRUPTED", "utf-8")

		const installer = new AgentInstaller(tmpDir, rooDir)
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "1.0.0",
			lastCheckedAt: Date.now(),
			installState: "installed",
			manifest: {
				agents: [],
				commands: ["test.md"],
				skills: [],
				rules: [],
				mcp: ["my-server"],
			},
		}

		// Should NOT throw — corrupted mcp_settings.json must not block other module uninstalls
		await expect(installer.uninstall(record)).resolves.not.toThrow()

		// The command file should still be uninstalled
		const cmdExists = await fs
			.access(path.join(commandsDir, "test.md"))
			.then(() => true)
			.catch(() => false)
		expect(cmdExists).toBe(false)
	})
})

// ─── Fix [m-2]: extractZip path traversal detection ───
describe("AgentInstaller extractZip path traversal (enhanced)", () => {
	let tmpDir: string
	let rooDir: string

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `ri-traversal-${Date.now()}`)
		rooDir = path.join(tmpDir, "roo")
		await fs.mkdir(tmpDir, { recursive: true })
		await fs.mkdir(rooDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("[m-2] should throw FatalInstallerError when zip entry uses forward-slash path traversal (../)", async () => {
		// adm-zip's addFile() API sanitizes paths, so we must directly set entryName
		// to simulate a maliciously crafted zip file with a real path traversal entry.
		const AdmZip = (await import("adm-zip")).default
		const zip = new AdmZip()
		zip.addFile("manifest.json", Buffer.from(JSON.stringify({ version: "1.0.0", modules: [] })))
		// Add a placeholder entry, then overwrite entryName to inject traversal
		zip.addFile("placeholder.txt", Buffer.from("evil content"))
		const entries = zip.getEntries()
		const evilEntry = entries.find((e) => e.entryName === "placeholder.txt")!
		evilEntry.entryName = "../evil.txt"
		const zipPath = path.join(tmpDir, "traversal-forward.zip")
		zip.writeZip(zipPath)

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo = { version: "1.0.0", downloadUrl: "http://example.com/test.zip" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		await expect(installer.install(zipPath, versionInfo, record)).rejects.toThrow(FatalInstallerError)
	})

	it("[m-2] should throw FatalInstallerError when zip entry uses backslash path traversal (..\\)", async () => {
		// adm-zip's addFile() API sanitizes paths, so we must directly set entryName
		// to simulate a maliciously crafted zip file with a Windows-style backslash traversal.
		const AdmZip = (await import("adm-zip")).default
		const zip = new AdmZip()
		zip.addFile("manifest.json", Buffer.from(JSON.stringify({ version: "1.0.0", modules: [] })))
		zip.addFile("placeholder.txt", Buffer.from("evil content"))
		const entries = zip.getEntries()
		const evilEntry = entries.find((e) => e.entryName === "placeholder.txt")!
		// Use backslash-based traversal — our fix normalizes this before checking
		evilEntry.entryName = "..\\evil.txt"
		const zipPath = path.join(tmpDir, "traversal-backslash.zip")
		zip.writeZip(zipPath)

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo = { version: "1.0.0", downloadUrl: "http://example.com/test.zip" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		await expect(installer.install(zipPath, versionInfo, record)).rejects.toThrow(FatalInstallerError)
	})
})

// ─── Fix [m-2b]: extractZip should NOT reject legitimate filenames containing ".." ───
describe("AgentInstaller extractZip path traversal (false-positive prevention)", () => {
	let tmpDir: string
	let rooDir: string

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `ri-traversal-fp-${Date.now()}`)
		rooDir = path.join(tmpDir, "roo")
		await fs.mkdir(tmpDir, { recursive: true })
		await fs.mkdir(rooDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("[m-2b] should NOT reject a zip entry with '..hidden' filename (not a traversal)", async () => {
		// A filename like "..hidden" contains ".." but is NOT a path traversal.
		// The fix must use path-segment matching (segment === "..") not includes("..").
		const AdmZip = (await import("adm-zip")).default
		const zip = new AdmZip()
		zip.addFile("manifest.json", Buffer.from(JSON.stringify({ version: "1.0.0", modules: [] })))
		// "..hidden" is a valid filename on Unix/macOS (hidden file starting with ..)
		// adm-zip may sanitize this, so we directly set entryName
		zip.addFile("placeholder.txt", Buffer.from("safe content"))
		const entries = zip.getEntries()
		const entry = entries.find((e) => e.entryName === "placeholder.txt")!
		entry.entryName = "..hidden"
		const zipPath = path.join(tmpDir, "dotdot-filename.zip")
		zip.writeZip(zipPath)

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0", downloadUrl: "http://example.com/test.zip" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		// Should NOT throw FatalInstallerError for "..hidden" — it's a valid filename, not a traversal
		// (The install may fail for other reasons like missing manifest content, but not pathTraversal)
		try {
			await installer.install(zipPath, versionInfo, record)
		} catch (err: any) {
			// If it throws, it must NOT be a pathTraversal error
			expect(err?.code).not.toBe("pathTraversal")
		}
	})

	it("[m-2b] should NOT reject a zip entry with 'file..name' filename (not a traversal)", async () => {
		const AdmZip = (await import("adm-zip")).default
		const zip = new AdmZip()
		zip.addFile("manifest.json", Buffer.from(JSON.stringify({ version: "1.0.0", modules: [] })))
		zip.addFile("placeholder.txt", Buffer.from("safe content"))
		const entries = zip.getEntries()
		const entry = entries.find((e) => e.entryName === "placeholder.txt")!
		entry.entryName = "file..name.txt"
		const zipPath = path.join(tmpDir, "dotdot-middle.zip")
		zip.writeZip(zipPath)

		const installer = new AgentInstaller(tmpDir, rooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0", downloadUrl: "http://example.com/test.zip" }
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}

		try {
			await installer.install(zipPath, versionInfo, record)
		} catch (err: any) {
			expect(err?.code).not.toBe("pathTraversal")
		}
	})
})

// ─── Fix [m-4]: atomicReplaceDirectory should restore backup on rename failure (non-Windows) ───
// Note: We cannot mock ESM fs/promises.rename directly (ESM namespace is not configurable).
// Instead, we test the backup-restoration behavior by verifying the function's contract:
// when rename(src, dest) fails, the original dest content must be preserved.
// We simulate this by making src a non-existent path (rename will fail with ENOENT).
describe("atomicReplaceDirectory backup restoration on failure", () => {
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `ri-atomic-restore-${Date.now()}`)
		await fs.mkdir(tmpDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("[m-4] should restore dest from backup when rename(src, dest) fails (src does not exist)", async () => {
		// Scenario: dest exists, src does NOT exist.
		// atomicReplaceDirectory will:
		//   1. rename(dest, backup) → success (hasBackup = true)
		//   2. rename(src, dest) → fails with ENOENT (src missing)
		// Expected: dest is restored from backup (original content preserved)
		const { atomicReplaceDirectory } = await import("../AgentInstaller")
		const src = path.join(tmpDir, "nonexistent-src-dir") // does NOT exist
		const dest = path.join(tmpDir, "dest-dir")

		// Create dest with original content
		await fs.mkdir(dest, { recursive: true })
		await fs.writeFile(path.join(dest, "original.txt"), "original content", "utf-8")

		// atomicReplaceDirectory should throw because src doesn't exist
		await expect(atomicReplaceDirectory(src, dest)).rejects.toThrow()

		// After failure, dest should be restored (original content preserved)
		const destExists = await fs
			.access(dest)
			.then(() => true)
			.catch(() => false)
		expect(destExists).toBe(true)
		const originalContent = await fs.readFile(path.join(dest, "original.txt"), "utf-8").catch(() => null)
		expect(originalContent).toBe("original content")
	})
})
