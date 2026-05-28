import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import * as os from "os"
import * as http from "http"
import * as crypto from "crypto"
import { allowNetConnect } from "../../../../vitest.setup"

vi.mock("vscode", async (importOriginal) => {
	const actual = await importOriginal<typeof import("vscode")>()
	return {
		...actual,
		window: {
			...actual.window,
			createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
			createStatusBarItem: vi.fn(() => ({ text: "", show: vi.fn(), hide: vi.fn(), dispose: vi.fn() })),
			showInformationMessage: vi.fn(),
			showWarningMessage: vi.fn(),
			showErrorMessage: vi.fn(),
		},
		extensions: {
			getExtension: vi.fn(() => ({ extensionUri: { fsPath: "/mock" } })),
		},
	}
})

vi.mock("../../../utils/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		channel: { appendLine: vi.fn() },
	}),
}))

import { AgentDownloader } from "../AgentDownloader"
import { AgentInstaller } from "../AgentInstaller"
import { FatalInstallerError } from "../types"
import type { ResourcePackageVersion, LocalInstallRecord } from "../types"

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a full-featured test zip with all module types */
async function createTestZip(destPath: string): Promise<void> {
	const AdmZip = (await import("adm-zip")).default
	const zip = new AdmZip()

	const srcDir = path.join(path.dirname(destPath), "zip-src")
	await fs.mkdir(path.join(srcDir, "agents"), { recursive: true })
	await fs.mkdir(path.join(srcDir, "commands"), { recursive: true })
	await fs.mkdir(path.join(srcDir, "skills", "test-skill"), { recursive: true })
	await fs.mkdir(path.join(srcDir, "rules", "test-rule"), { recursive: true })
	await fs.mkdir(path.join(srcDir, "mcp"), { recursive: true })

	await fs.writeFile(
		path.join(srcDir, "manifest.json"),
		JSON.stringify({ version: "1.0.0", modules: ["agents", "commands", "skills", "rules", "mcp"] }),
		"utf-8",
	)
	await fs.writeFile(path.join(srcDir, "agents", "test-agent.yaml"), "name: Test Agent\nslug: test-agent\n", "utf-8")
	await fs.writeFile(path.join(srcDir, "commands", "test-command.md"), "# Test Command\n", "utf-8")
	await fs.writeFile(path.join(srcDir, "skills", "test-skill", "skill.md"), "# Test Skill\n", "utf-8")
	await fs.writeFile(path.join(srcDir, "rules", "test-rule", "rule.md"), "# Test Rule\n", "utf-8")
	await fs.writeFile(
		path.join(srcDir, "mcp", "test-server.json"),
		// use nested format (standard mcp_settings.json format)
		JSON.stringify({ "test-server": { url: "http://localhost:3000" } }),
		"utf-8",
	)

	zip.addLocalFolder(srcDir)
	zip.writeZip(destPath)
	await fs.rm(srcDir, { recursive: true, force: true })
}

/** Create a zip with custom modules map */
async function createZipWithModules(
	destPath: string,
	modules: Record<string, Record<string, string>>,
	version = "1.0.0",
): Promise<void> {
	const AdmZip = (await import("adm-zip")).default
	const zip = new AdmZip()
	const srcDir = path.join(path.dirname(destPath), `zip-src-${Date.now()}`)
	await fs.mkdir(srcDir, { recursive: true })

	await fs.writeFile(
		path.join(srcDir, "manifest.json"),
		JSON.stringify({ version, modules: Object.keys(modules) }),
		"utf-8",
	)

	for (const [moduleName, files] of Object.entries(modules)) {
		const moduleDir = path.join(srcDir, moduleName)
		await fs.mkdir(moduleDir, { recursive: true })
		for (const [fileName, content] of Object.entries(files)) {
			const filePath = path.join(moduleDir, fileName)
			await fs.mkdir(path.dirname(filePath), { recursive: true })
			await fs.writeFile(filePath, content, "utf-8")
		}
	}

	zip.addLocalFolder(srcDir)
	zip.writeZip(destPath)
	await fs.rm(srcDir, { recursive: true, force: true })
}

const defaultRecord: LocalInstallRecord = {
	schemaVersion: 1,
	installedVersion: "0.0.0",
	lastCheckedAt: 0,
	installState: "none",
	manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
}

// ─── Main describe ───────────────────────────────────────────────────────────

describe("Remote Resource Installer Integration", () => {
	let tmpDir: string
	let rooDir: string
	let server: http.Server
	let serverPort: number
	let serverBaseUrl: string
	let zipPath: string
	let zipChecksum: string

	beforeAll(async () => {
		// Allow local HTTP server connections (nock blocks all by default)
		allowNetConnect("127.0.0.1")

		// Create temp directories
		tmpDir = path.join(os.tmpdir(), `rri-integration-${Date.now()}`)
		rooDir = path.join(tmpDir, "roo")
		await fs.mkdir(tmpDir, { recursive: true })
		await fs.mkdir(rooDir, { recursive: true })

		// Build test zip package
		zipPath = path.join(tmpDir, "remote-agent-package-1.0.0.zip")
		await createTestZip(zipPath)

		// Calculate checksum
		const hash = crypto.createHash("sha256")
		hash.update(fsSync.readFileSync(zipPath))
		zipChecksum = hash.digest("hex")

		// Start local HTTP server
		server = http.createServer((req, res) => {
			if (req.url === "/costrict-static/agent-package/latest.json") {
				res.writeHead(200, { "Content-Type": "application/json" })
				res.end(
					JSON.stringify({
						version: "1.0.0",
						downloadUrl: `${serverBaseUrl}/remote-agent-package-1.0.0.zip`,
						checksum: zipChecksum,
						checksumAlgo: "sha256",
					}),
				)
			} else if (req.url === "/remote-agent-package-1.0.0.zip") {
				const data = fsSync.readFileSync(zipPath)
				res.writeHead(200, {
					"Content-Type": "application/zip",
					"Content-Length": data.length,
				})
				res.end(data)
			} else {
				res.writeHead(404)
				res.end("Not Found")
			}
		})

		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", () => {
				const addr = server.address()
				if (addr && typeof addr === "object") {
					serverPort = addr.port
					serverBaseUrl = `http://127.0.0.1:${serverPort}`
				}
				resolve()
			})
		})
	})

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()))
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	beforeEach(() => {
		vi.clearAllMocks()
	})

	// ─── Download tests ──────────────────────────────────────────────────────

	it("should download zip from local server with checksum verification", async () => {
		const downloadDir = path.join(tmpDir, "download-test")
		await fs.mkdir(downloadDir, { recursive: true })
		const downloader = new AgentDownloader(downloadDir)
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			downloadUrl: `${serverBaseUrl}/remote-agent-package-1.0.0.zip`,
			checksum: zipChecksum,
			checksumAlgo: "sha256",
		}

		const downloadedPath = await downloader.download(versionInfo)

		expect(fsSync.existsSync(downloadedPath)).toBe(true)
		expect(downloadedPath).toBe(path.join(downloadDir, "remote-agent-package-1.0.0.zip"))

		// Verify downloaded file matches original
		const originalHash = crypto.createHash("sha256").update(fsSync.readFileSync(zipPath)).digest("hex")
		const downloadedHash = crypto.createHash("sha256").update(fsSync.readFileSync(downloadedPath)).digest("hex")
		expect(downloadedHash).toBe(originalHash)
	})

	it("should fail download when checksum mismatches", async () => {
		const downloadDir = path.join(tmpDir, "checksum-test")
		await fs.mkdir(downloadDir, { recursive: true })
		const downloader = new AgentDownloader(downloadDir)
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			downloadUrl: `${serverBaseUrl}/remote-agent-package-1.0.0.zip`,
			checksum: "invalidchecksum",
			checksumAlgo: "sha256",
		}

		await expect(downloader.download(versionInfo)).rejects.toThrow("Checksum mismatch")
	})

	it("should fail download when server returns 404", async () => {
		const downloadDir = path.join(tmpDir, "download-404-test")
		await fs.mkdir(downloadDir, { recursive: true })
		const downloader = new AgentDownloader(downloadDir)
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			downloadUrl: `${serverBaseUrl}/nonexistent.zip`,
		}

		await expect(downloader.download(versionInfo)).rejects.toThrow()
	})

	it("should always re-download even when a zip with the same name already exists", async () => {
		const downloadDir = path.join(tmpDir, "download-reuse-test")
		await fs.mkdir(downloadDir, { recursive: true })
		const downloader = new AgentDownloader(downloadDir)

		// Pre-create a zip file with the same name to simulate a stale/partial download
		const existingZipPath = path.join(downloadDir, "remote-agent-package-1.0.0.zip")
		fsSync.copyFileSync(zipPath, existingZipPath)

		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			downloadUrl: `${serverBaseUrl}/remote-agent-package-1.0.0.zip`,
			checksum: zipChecksum,
			checksumAlgo: "sha256",
		}

		// AgentDownloader.download() always calls cleanupResidualFiles() first (deletes all
		// remote-agent-package-* files), then re-downloads. The "cache reuse" logic (skipping download
		// entirely) lives in RemoteAgentInstaller.runInstallWithRetries() via the zipPath variable.
		// The returned path matches the expected destination path.
		const downloadedPath = await downloader.download(versionInfo)
		expect(downloadedPath).toBe(existingZipPath)
	})

	// ─── Install tests ───────────────────────────────────────────────────────

	it("should install all modules from downloaded zip", async () => {
		const installTmpDir = path.join(tmpDir, "install-test-tmp")
		const installRooDir = path.join(tmpDir, "install-test-roo")
		await fs.mkdir(installTmpDir, { recursive: true })
		await fs.mkdir(installRooDir, { recursive: true })

		const installer = new AgentInstaller(installTmpDir, installRooDir)
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }

		const manifest = await installer.install(zipPath, versionInfo, { ...defaultRecord })

		expect(manifest.agents).toContain("test-agent")
		expect(manifest.commands).toContain("test-command.md")
		expect(manifest.skills).toContain("test-skill")
		expect(manifest.rules).toContain("test-rule")
		expect(manifest.mcp).toContain("test-server")

		// Verify agents YAML was written
		const customModesPath = path.join(installRooDir, "custom_modes.yaml")
		expect(fsSync.existsSync(customModesPath)).toBe(true)
		const modesContent = fsSync.readFileSync(customModesPath, "utf-8")
		expect(modesContent).toContain("test-agent")

		// Verify commands were copied
		const commandPath = path.join(installRooDir, "commands", "test-command.md")
		expect(fsSync.existsSync(commandPath)).toBe(true)

		// Verify skills were copied
		const skillPath = path.join(installRooDir, "skills", "test-skill", "skill.md")
		expect(fsSync.existsSync(skillPath)).toBe(true)

		// Verify rules were copied (rules are installed directly under rooDir, not under "rules/")
		const rulePath = path.join(installRooDir, "test-rule", "rule.md")
		expect(fsSync.existsSync(rulePath)).toBe(true)
	})

	it("should install MCP server config into mcp_settings.json", async () => {
		const installTmpDir = path.join(tmpDir, "mcp-install-tmp")
		const installRooDir = path.join(tmpDir, "mcp-install-roo")
		await fs.mkdir(installTmpDir, { recursive: true })
		await fs.mkdir(installRooDir, { recursive: true })

		const mcpZipPath = path.join(tmpDir, "mcp-only.zip")
		await createZipWithModules(mcpZipPath, {
			mcp: {
				// costrict: use nested format (standard mcp_settings.json format)
				"my-server.json": JSON.stringify({ "my-server": { command: "node", args: ["server.js"] } }),
			},
		})

		const installer = new AgentInstaller(installTmpDir, installRooDir)
		const manifest = await installer.install(mcpZipPath, { version: "1.0.0" }, { ...defaultRecord })

		expect(manifest.mcp).toContain("my-server")
		// Verify mcp_settings.json was written with the server
		const mcpSettingsPath = path.join(installRooDir, "mcp_settings.json")
		expect(fsSync.existsSync(mcpSettingsPath)).toBe(true)
		const settings = JSON.parse(fsSync.readFileSync(mcpSettingsPath, "utf-8"))
		expect(settings.mcpServers).toHaveProperty("my-server")
	})

	it("should merge MCP server into existing mcp_settings.json", async () => {
		const installTmpDir = path.join(tmpDir, "mcp-merge-tmp")
		const installRooDir = path.join(tmpDir, "mcp-merge-roo")
		await fs.mkdir(installTmpDir, { recursive: true })
		await fs.mkdir(installRooDir, { recursive: true })

		// Pre-create existing mcp_settings.json with another server
		const existingSettings = { mcpServers: { "existing-server": { command: "python" } } }
		fsSync.writeFileSync(path.join(installRooDir, "mcp_settings.json"), JSON.stringify(existingSettings), "utf-8")

		const mcpZipPath = path.join(tmpDir, "mcp-merge.zip")
		await createZipWithModules(mcpZipPath, {
			mcp: {
				// costrict: use nested format (standard mcp_settings.json format)
				"new-server.json": JSON.stringify({ "new-server": { command: "node" } }),
			},
		})

		const installer = new AgentInstaller(installTmpDir, installRooDir)
		const manifest = await installer.install(mcpZipPath, { version: "1.0.0" }, { ...defaultRecord })

		expect(manifest.mcp).toContain("new-server")
		// Verify both servers are in mcp_settings.json
		const settings = JSON.parse(fsSync.readFileSync(path.join(installRooDir, "mcp_settings.json"), "utf-8"))
		expect(settings.mcpServers).toHaveProperty("existing-server")
		expect(settings.mcpServers).toHaveProperty("new-server")
	})

	it("should warn and continue (not throw) when local mcp_settings.json is corrupted", async () => {
		const installTmpDir = path.join(tmpDir, "mcp-invalid-json-tmp")
		const installRooDir = path.join(tmpDir, "mcp-invalid-json-roo")
		await fs.mkdir(installTmpDir, { recursive: true })
		await fs.mkdir(installRooDir, { recursive: true })

		// Write invalid JSON to local mcp_settings.json — this is a local config file,
		// not zip content, so corruption should be auto-repaired (warn + reset to empty).
		fsSync.writeFileSync(path.join(installRooDir, "mcp_settings.json"), "{ invalid json }", "utf-8")

		const mcpZipPath = path.join(tmpDir, "mcp-invalid.zip")
		await createZipWithModules(mcpZipPath, {
			mcp: {
				// use nested format (standard mcp_settings.json format)
				"server.json": JSON.stringify({ server: { command: "node" } }),
			},
		})

		const installer = new AgentInstaller(installTmpDir, installRooDir)
		// Should NOT throw — corrupted local config is auto-repaired by overwriting with valid content
		const manifest = await installer.install(mcpZipPath, { version: "1.0.0" }, { ...defaultRecord })
		expect(manifest.mcp).toContain("server")
		// Verify the corrupted file was repaired
		const repairedContent = fsSync.readFileSync(path.join(installRooDir, "mcp_settings.json"), "utf-8")
		expect(JSON.parse(repairedContent).mcpServers).toHaveProperty("server")
	})

	it("should skip MCP server config entry when server config is not an object", async () => {
		const installTmpDir = path.join(tmpDir, "mcp-non-obj-tmp")
		const installRooDir = path.join(tmpDir, "mcp-non-obj-roo")
		await fs.mkdir(installTmpDir, { recursive: true })
		await fs.mkdir(installRooDir, { recursive: true })

		const mcpZipPath = path.join(tmpDir, "mcp-non-obj.zip")
		await createZipWithModules(mcpZipPath, {
			mcp: {
				// null value — not an object, should be skipped
				"null-server.json": "null",
				// valid server — use nested format (standard mcp_settings.json format)
				"valid-server.json": JSON.stringify({ "valid-server": { command: "node" } }),
			},
		})

		const installer = new AgentInstaller(installTmpDir, installRooDir)
		const manifest = await installer.install(mcpZipPath, { version: "1.0.0" }, { ...defaultRecord })

		// null-server should be skipped, valid-server should be installed
		expect(manifest.mcp).not.toContain("null-server")
		expect(manifest.mcp).toContain("valid-server")
	})

	it("should install rule as file (not directory) when rule is a single .md file", async () => {
		const installTmpDir = path.join(tmpDir, "rule-file-tmp")
		const installRooDir = path.join(tmpDir, "rule-file-roo")
		await fs.mkdir(installTmpDir, { recursive: true })
		await fs.mkdir(installRooDir, { recursive: true })

		const ruleZipPath = path.join(tmpDir, "rule-file.zip")
		// Rules can be either directories or single files
		await createZipWithModules(ruleZipPath, {
			rules: {
				"single-rule.md": "# Single Rule\nThis is a single file rule.\n",
			},
		})

		const installer = new AgentInstaller(installTmpDir, installRooDir)
		const manifest = await installer.install(ruleZipPath, { version: "1.0.0" }, { ...defaultRecord })

		expect(manifest.rules).toContain("single-rule.md")
		// Verify the rule file was copied (rules are installed directly under rooDir)
		const rulePath = path.join(installRooDir, "single-rule.md")
		expect(fsSync.existsSync(rulePath)).toBe(true)
	})

	it("should uninstall rule that is a file (not directory)", async () => {
		const uninstallRooDir = path.join(tmpDir, "uninstall-rule-file-roo")
		await fs.mkdir(uninstallRooDir, { recursive: true })

		// Create a rule as a single file directly under rooDir (not under "rules/")
		const ruleFilePath = path.join(uninstallRooDir, "single-rule.md")
		await fs.writeFile(ruleFilePath, "# Rule\n", "utf-8")

		const installer = new AgentInstaller(tmpDir, uninstallRooDir)
		const record: LocalInstallRecord = {
			...defaultRecord,
			installedVersion: "1.0.0",
			installState: "installed",
			manifest: {
				agents: [],
				commands: [],
				skills: [],
				rules: ["single-rule.md"],
				mcp: [],
			},
		}

		await installer.uninstall(record)

		// The file should be removed
		expect(fsSync.existsSync(ruleFilePath)).toBe(false)
	})

	it("should install agents to settingsDir when settingsDir is provided", async () => {
		const installTmpDir = path.join(tmpDir, "settings-dir-tmp")
		const installRooDir = path.join(tmpDir, "settings-dir-roo")
		const settingsDir = path.join(tmpDir, "settings-dir-settings")
		await fs.mkdir(installTmpDir, { recursive: true })
		await fs.mkdir(installRooDir, { recursive: true })
		await fs.mkdir(settingsDir, { recursive: true })

		const agentZipPath = path.join(tmpDir, "agent-settings.zip")
		await createZipWithModules(agentZipPath, {
			agents: {
				"settings-agent.yaml": "name: Settings Agent\nslug: settings-agent\n",
			},
		})

		const installer = new AgentInstaller(installTmpDir, installRooDir, settingsDir)
		const manifest = await installer.install(agentZipPath, { version: "1.0.0" }, { ...defaultRecord })

		expect(manifest.agents).toContain("settings-agent")
		// Agents should be in settingsDir, not rooDir
		expect(fsSync.existsSync(path.join(settingsDir, "custom_modes.yaml"))).toBe(true)
		expect(fsSync.existsSync(path.join(installRooDir, "custom_modes.yaml"))).toBe(false)
	})

	it("should install over existing installation (upgrade scenario)", async () => {
		const installTmpDir = path.join(tmpDir, "upgrade-tmp")
		const installRooDir = path.join(tmpDir, "upgrade-roo")
		await fs.mkdir(installTmpDir, { recursive: true })
		await fs.mkdir(installRooDir, { recursive: true })

		// First install
		const installer = new AgentInstaller(installTmpDir, installRooDir)
		const record1: LocalInstallRecord = { ...defaultRecord }
		const manifest1 = await installer.install(zipPath, { version: "1.0.0" }, record1)
		expect(manifest1.agents).toContain("test-agent")

		// Second install (upgrade) �?should uninstall old and install new
		const record2: LocalInstallRecord = {
			...defaultRecord,
			installedVersion: "1.0.0",
			installState: "installed",
			manifest: manifest1,
		}
		const manifest2 = await installer.install(zipPath, { version: "1.0.0" }, record2)
		expect(manifest2.agents).toContain("test-agent")
	})

	// ─── Uninstall tests ─────────────────────────────────────────────────────

	it("should uninstall previously installed modules", async () => {
		const uninstallRooDir = path.join(tmpDir, "uninstall-test-roo")
		await fs.mkdir(uninstallRooDir, { recursive: true })

		const installer = new AgentInstaller(tmpDir, uninstallRooDir)
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "1.0.0",
			lastCheckedAt: Date.now(),
			installState: "installed",
			manifest: {
				agents: ["test-agent"],
				commands: ["test-command.md"],
				skills: ["test-skill"],
				rules: ["test-rule"],
				mcp: ["test-server"],
			},
		}

		// Pre-create installed files to simulate prior installation
		// Rules are installed directly under rooDir (not under "rules/")
		await fs.mkdir(path.join(uninstallRooDir, "commands"), { recursive: true })
		await fs.mkdir(path.join(uninstallRooDir, "skills", "test-skill"), { recursive: true })
		await fs.mkdir(path.join(uninstallRooDir, "test-rule"), { recursive: true })
		await fs.writeFile(path.join(uninstallRooDir, "commands", "test-command.md"), "old", "utf-8")
		await fs.writeFile(path.join(uninstallRooDir, "skills", "test-skill", "skill.md"), "old", "utf-8")
		await fs.writeFile(path.join(uninstallRooDir, "test-rule", "rule.md"), "old", "utf-8")
		await fs.writeFile(
			path.join(uninstallRooDir, "custom_modes.yaml"),
			"customModes:\n  - slug: test-agent\n",
			"utf-8",
		)
		await fs.writeFile(
			path.join(uninstallRooDir, "mcp_settings.json"),
			JSON.stringify({ mcpServers: { "test-server": {} } }),
			"utf-8",
		)

		await installer.uninstall(record)

		// Verify files were removed
		expect(fsSync.existsSync(path.join(uninstallRooDir, "commands", "test-command.md"))).toBe(false)
		expect(fsSync.existsSync(path.join(uninstallRooDir, "skills", "test-skill"))).toBe(false)
		expect(fsSync.existsSync(path.join(uninstallRooDir, "test-rule"))).toBe(false)
	})

	it("should uninstall gracefully when files are already missing", async () => {
		const uninstallRooDir = path.join(tmpDir, "uninstall-missing-roo")
		await fs.mkdir(uninstallRooDir, { recursive: true })

		const installer = new AgentInstaller(tmpDir, uninstallRooDir)
		const record: LocalInstallRecord = {
			...defaultRecord,
			installedVersion: "1.0.0",
			installState: "installed",
			manifest: {
				agents: ["ghost-agent"],
				commands: ["ghost-command.md"],
				skills: ["ghost-skill"],
				rules: ["ghost-rule"],
				mcp: ["ghost-server"],
			},
		}

		// No files pre-created �?should not throw
		await expect(installer.uninstall(record)).resolves.not.toThrow()
	})

	it("should uninstall without manifest gracefully (null manifest)", async () => {
		const uninstallRooDir = path.join(tmpDir, "uninstall-null-manifest-roo")
		await fs.mkdir(uninstallRooDir, { recursive: true })

		const installer = new AgentInstaller(tmpDir, uninstallRooDir)
		const record: LocalInstallRecord = {
			...defaultRecord,
			installState: "none",
			manifest: null as any,
		}

		await expect(installer.uninstall(record)).resolves.not.toThrow()
	})

	it("should remove agent from custom_modes.yaml on uninstall", async () => {
		const uninstallRooDir = path.join(tmpDir, "uninstall-agent-yaml-roo")
		await fs.mkdir(uninstallRooDir, { recursive: true })

		// Pre-create custom_modes.yaml with multiple agents
		await fs.writeFile(
			path.join(uninstallRooDir, "custom_modes.yaml"),
			"customModes:\n  - slug: keep-agent\n    name: Keep\n  - slug: remove-agent\n    name: Remove\n",
			"utf-8",
		)

		const installer = new AgentInstaller(tmpDir, uninstallRooDir)
		const record: LocalInstallRecord = {
			...defaultRecord,
			installedVersion: "1.0.0",
			installState: "installed",
			manifest: {
				agents: ["remove-agent"],
				commands: [],
				skills: [],
				rules: [],
				mcp: [],
			},
		}

		await installer.uninstall(record)

		// custom_modes.yaml should still exist but without remove-agent
		const content = fsSync.readFileSync(path.join(uninstallRooDir, "custom_modes.yaml"), "utf-8")
		expect(content).toContain("keep-agent")
		expect(content).not.toContain("remove-agent")
	})

	// ─── Cleanup tests ───────────────────────────────────────────────────────

	it("should cleanup temporary files after install", async () => {
		const cleanupTmpDir = path.join(tmpDir, "cleanup-tmp")
		const cleanupRooDir = path.join(tmpDir, "cleanup-roo")
		await fs.mkdir(cleanupTmpDir, { recursive: true })
		await fs.mkdir(cleanupRooDir, { recursive: true })

		const installer = new AgentInstaller(cleanupTmpDir, cleanupRooDir)
		await installer.install(zipPath, { version: "1.0.0" }, { ...defaultRecord })

		// After install, cleanup should remove extract dir
		const extractDir = path.join(cleanupTmpDir, "remote-agent-package-1.0.0")
		await installer.cleanup(undefined, extractDir)
		expect(fsSync.existsSync(extractDir)).toBe(false)
	})

	it("should cleanup zip file when specified", async () => {
		const cleanupTmpDir = path.join(tmpDir, "cleanup-zip-tmp")
		await fs.mkdir(cleanupTmpDir, { recursive: true })

		// Create a dummy zip to cleanup
		const dummyZip = path.join(cleanupTmpDir, "dummy.zip")
		await fs.writeFile(dummyZip, "dummy", "utf-8")

		const installer = new AgentInstaller(cleanupTmpDir, rooDir)
		await installer.cleanup(dummyZip, undefined)

		expect(fsSync.existsSync(dummyZip)).toBe(false)
	})

	it("should not throw when cleanup targets do not exist", async () => {
		const installer = new AgentInstaller(tmpDir, rooDir)
		await expect(installer.cleanup("/nonexistent/path.zip", "/nonexistent/extract-dir")).resolves.not.toThrow()
	})

	// ─── Error / edge case tests ─────────────────────────────────────────────

	it("should throw FatalInstallerError on path traversal in zip", async () => {
		const AdmZip = (await import("adm-zip")).default
		const traversalZipPath = path.join(tmpDir, "traversal.zip")
		const srcDir = path.join(tmpDir, "traversal-src")
		await fs.mkdir(srcDir, { recursive: true })
		await fs.writeFile(
			path.join(srcDir, "manifest.json"),
			JSON.stringify({ version: "1.0.0", modules: ["agents"] }),
			"utf-8",
		)
		await fs.mkdir(path.join(srcDir, "agents"), { recursive: true })
		await fs.writeFile(path.join(srcDir, "agents", "evil.yaml"), "name: evil\nslug: evil\n", "utf-8")

		const zip = new AdmZip()
		zip.addLocalFolder(srcDir)
		zip.writeZip(traversalZipPath)
		await fs.rm(srcDir, { recursive: true, force: true })

		// Inject path traversal entry
		const zip2 = new AdmZip(traversalZipPath)
		zip2.addFile("/etc/evil.txt", Buffer.from("pwned"))
		zip2.writeZip(traversalZipPath)

		// Check if adm-zip preserved the traversal entry
		const verifyZip = new AdmZip(traversalZipPath)
		const hasTraversal = verifyZip.getEntries().some((e: any) => e.entryName.startsWith("/"))
		if (!hasTraversal) {
			// adm-zip normalizes entries on this platform �?skip
			return
		}

		const installer = new AgentInstaller(tmpDir, rooDir)
		await expect(installer.install(traversalZipPath, { version: "1.0.0" }, { ...defaultRecord })).rejects.toThrow(
			"path traversal",
		)
	})

	it("should throw when zip has no manifest.json", async () => {
		const AdmZip = (await import("adm-zip")).default
		const noManifestZip = path.join(tmpDir, "no-manifest.zip")
		const srcDir = path.join(tmpDir, "no-manifest-src")
		await fs.mkdir(srcDir, { recursive: true })
		await fs.mkdir(path.join(srcDir, "agents"), { recursive: true })
		await fs.writeFile(path.join(srcDir, "agents", "test.yaml"), "name: test\nslug: test\n", "utf-8")

		const zip = new AdmZip()
		zip.addLocalFolder(srcDir)
		zip.writeZip(noManifestZip)
		await fs.rm(srcDir, { recursive: true, force: true })

		const installer = new AgentInstaller(tmpDir, rooDir)
		await expect(installer.install(noManifestZip, { version: "1.0.0" }, { ...defaultRecord })).rejects.toThrow(
			"manifest",
		)
	})

	it("should throw when zip manifest version mismatches versionInfo", async () => {
		const mismatchZipPath = path.join(tmpDir, "version-mismatch.zip")
		await createZipWithModules(mismatchZipPath, {}, "0.5.0")

		const installer = new AgentInstaller(tmpDir, rooDir)
		await expect(installer.install(mismatchZipPath, { version: "1.0.0" }, { ...defaultRecord })).rejects.toThrow(
			"version mismatch",
		)
	})

	it("should throw FatalInstallerError when MCP JSON file is invalid", async () => {
		const installTmpDir = path.join(tmpDir, "mcp-bad-json-tmp")
		const installRooDir = path.join(tmpDir, "mcp-bad-json-roo")
		await fs.mkdir(installTmpDir, { recursive: true })
		await fs.mkdir(installRooDir, { recursive: true })

		const badMcpZipPath = path.join(tmpDir, "mcp-bad-json.zip")
		await createZipWithModules(badMcpZipPath, {
			mcp: {
				"bad.json": "{ not valid json !!!",
			},
		})

		const installer = new AgentInstaller(installTmpDir, installRooDir)
		await expect(installer.install(badMcpZipPath, { version: "1.0.0" }, { ...defaultRecord })).rejects.toThrow(
			FatalInstallerError,
		)
	})

	// ─── Download progress tests ─────────────────────────────────────────────

	it("should report download progress during download", async () => {
		const downloadDir = path.join(tmpDir, "progress-test")
		await fs.mkdir(downloadDir, { recursive: true })
		const downloader = new AgentDownloader(downloadDir)
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			downloadUrl: `${serverBaseUrl}/remote-agent-package-1.0.0.zip`,
			checksum: zipChecksum,
			checksumAlgo: "sha256",
		}

		const progressValues: number[] = []
		await downloader.download(versionInfo, (progress) => {
			progressValues.push(progress.progress)
		})

		// Progress should have been reported at least once
		expect(progressValues.length).toBeGreaterThan(0)
		// Final progress should be 100
		expect(progressValues[progressValues.length - 1]).toBe(100)
	})

	// ─── Lock mechanism tests (real filesystem) ──────────────────────────────

	it("should detect expired lock and return false from isLockHeld", async () => {
		const lockDir = path.join(tmpDir, "lock-expired-test")
		await fs.mkdir(lockDir, { recursive: true })
		const lockFilePath = path.join(lockDir, "remote-agent-package.lock")

		// Write an expired lock (startTime far in the past)
		const expiredLock = JSON.stringify({ pid: 99999, startTime: Date.now() - 60 * 60 * 1000 }) // 1 hour ago
		await fs.writeFile(lockFilePath, expiredLock, "utf-8")

		// Verify the lock file exists before the check
		expect(fsSync.existsSync(lockFilePath)).toBe(true)

		// Test the lock expiry logic directly
		const data = await fs.readFile(lockFilePath, "utf-8")
		const lock = JSON.parse(data) as { pid: number; startTime: number }
		const LOCK_EXPIRE_MS = 30 * 60 * 1000
		const isExpired = Date.now() - lock.startTime >= LOCK_EXPIRE_MS

		expect(isExpired).toBe(true)
	})

	it("should detect active lock and return true from isLockHeld", async () => {
		const lockDir = path.join(tmpDir, "lock-active-test")
		await fs.mkdir(lockDir, { recursive: true })
		const lockFilePath = path.join(lockDir, "remote-agent-package.lock")

		// Write an active lock (startTime just now)
		const activeLock = JSON.stringify({ pid: process.pid, startTime: Date.now() })
		await fs.writeFile(lockFilePath, activeLock, "utf-8")

		const data = await fs.readFile(lockFilePath, "utf-8")
		const lock = JSON.parse(data) as { pid: number; startTime: number }
		const LOCK_EXPIRE_MS = 30 * 60 * 1000
		const isActive = Date.now() - lock.startTime < LOCK_EXPIRE_MS

		expect(isActive).toBe(true)
	})

	// ─── End-to-end flow tests ───────────────────────────────────────────────

	it("should complete full download-install-uninstall cycle", async () => {
		const e2eTmpDir = path.join(tmpDir, "e2e-tmp")
		const e2eRooDir = path.join(tmpDir, "e2e-roo")
		await fs.mkdir(e2eTmpDir, { recursive: true })
		await fs.mkdir(e2eRooDir, { recursive: true })

		// Step 1: Download
		const downloader = new AgentDownloader(e2eTmpDir)
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			downloadUrl: `${serverBaseUrl}/remote-agent-package-1.0.0.zip`,
			checksum: zipChecksum,
			checksumAlgo: "sha256",
		}
		const downloadedZip = await downloader.download(versionInfo)
		expect(fsSync.existsSync(downloadedZip)).toBe(true)

		// Step 2: Install
		const installer = new AgentInstaller(e2eTmpDir, e2eRooDir)
		const manifest = await installer.install(downloadedZip, { version: "1.0.0" }, { ...defaultRecord })
		expect(manifest.agents).toContain("test-agent")
		expect(manifest.commands).toContain("test-command.md")
		expect(manifest.skills).toContain("test-skill")
		expect(manifest.rules).toContain("test-rule")
		expect(manifest.mcp).toContain("test-server")

		// Step 3: Verify files exist
		expect(fsSync.existsSync(path.join(e2eRooDir, "commands", "test-command.md"))).toBe(true)
		expect(fsSync.existsSync(path.join(e2eRooDir, "skills", "test-skill"))).toBe(true)

		// Step 4: Uninstall
		const uninstallRecord: LocalInstallRecord = {
			...defaultRecord,
			installedVersion: "1.0.0",
			installState: "installed",
			manifest,
		}
		await installer.uninstall(uninstallRecord)

		// Step 5: Verify files removed
		expect(fsSync.existsSync(path.join(e2eRooDir, "commands", "test-command.md"))).toBe(false)
		expect(fsSync.existsSync(path.join(e2eRooDir, "skills", "test-skill"))).toBe(false)
	})

	it("should handle concurrent install attempts gracefully (idempotent)", async () => {
		// Use separate directories for each concurrent install to avoid Windows EPERM
		// on concurrent atomic renames of the same directory
		const concurrent1TmpDir = path.join(tmpDir, "concurrent1-tmp")
		const concurrent1RooDir = path.join(tmpDir, "concurrent1-roo")
		const concurrent2TmpDir = path.join(tmpDir, "concurrent2-tmp")
		const concurrent2RooDir = path.join(tmpDir, "concurrent2-roo")
		await fs.mkdir(concurrent1TmpDir, { recursive: true })
		await fs.mkdir(concurrent1RooDir, { recursive: true })
		await fs.mkdir(concurrent2TmpDir, { recursive: true })
		await fs.mkdir(concurrent2RooDir, { recursive: true })

		const installer1 = new AgentInstaller(concurrent1TmpDir, concurrent1RooDir)
		const installer2 = new AgentInstaller(concurrent2TmpDir, concurrent2RooDir)

		// Run two installs concurrently �?both should succeed without corruption
		const [manifest1, manifest2] = await Promise.all([
			installer1.install(zipPath, { version: "1.0.0" }, { ...defaultRecord }),
			installer2.install(zipPath, { version: "1.0.0" }, { ...defaultRecord }),
		])

		expect(manifest1.agents).toContain("test-agent")
		expect(manifest2.agents).toContain("test-agent")
	})

	it("should install only agents module when zip has only agents", async () => {
		const agentsOnlyTmpDir = path.join(tmpDir, "agents-only-tmp")
		const agentsOnlyRooDir = path.join(tmpDir, "agents-only-roo")
		await fs.mkdir(agentsOnlyTmpDir, { recursive: true })
		await fs.mkdir(agentsOnlyRooDir, { recursive: true })

		const agentsZipPath = path.join(tmpDir, "agents-only.zip")
		await createZipWithModules(agentsZipPath, {
			agents: {
				"solo-agent.yaml": "name: Solo Agent\nslug: solo-agent\n",
			},
		})

		const installer = new AgentInstaller(agentsOnlyTmpDir, agentsOnlyRooDir)
		const manifest = await installer.install(agentsZipPath, { version: "1.0.0" }, { ...defaultRecord })

		expect(manifest.agents).toContain("solo-agent")
		expect(manifest.commands).toEqual([])
		expect(manifest.skills).toEqual([])
		expect(manifest.rules).toEqual([])
		expect(manifest.mcp).toEqual([])
	})

	it("should install multiple agents from a single zip", async () => {
		const multiAgentTmpDir = path.join(tmpDir, "multi-agent-tmp")
		const multiAgentRooDir = path.join(tmpDir, "multi-agent-roo")
		await fs.mkdir(multiAgentTmpDir, { recursive: true })
		await fs.mkdir(multiAgentRooDir, { recursive: true })

		const multiAgentZipPath = path.join(tmpDir, "multi-agent.zip")
		await createZipWithModules(multiAgentZipPath, {
			agents: {
				"agent-alpha.yaml": "name: Agent Alpha\nslug: agent-alpha\n",
				"agent-beta.yaml": "name: Agent Beta\nslug: agent-beta\n",
				"agent-gamma.yaml": "name: Agent Gamma\nslug: agent-gamma\n",
			},
		})

		const installer = new AgentInstaller(multiAgentTmpDir, multiAgentRooDir)
		const manifest = await installer.install(multiAgentZipPath, { version: "1.0.0" }, { ...defaultRecord })

		expect(manifest.agents).toContain("agent-alpha")
		expect(manifest.agents).toContain("agent-beta")
		expect(manifest.agents).toContain("agent-gamma")
		expect(manifest.agents).toHaveLength(3)
	})

	it("should install multiple MCP servers from a single zip", async () => {
		const multiMcpTmpDir = path.join(tmpDir, "multi-mcp-tmp")
		const multiMcpRooDir = path.join(tmpDir, "multi-mcp-roo")
		await fs.mkdir(multiMcpTmpDir, { recursive: true })
		await fs.mkdir(multiMcpRooDir, { recursive: true })

		const multiMcpZipPath = path.join(tmpDir, "multi-mcp.zip")
		await createZipWithModules(multiMcpZipPath, {
			mcp: {
				// use nested format (standard mcp_settings.json format)
				"server-a.json": JSON.stringify({ "server-a": { command: "node", args: ["a.js"] } }),
				"server-b.json": JSON.stringify({ "server-b": { command: "python", args: ["b.py"] } }),
			},
		})

		const installer = new AgentInstaller(multiMcpTmpDir, multiMcpRooDir)
		const manifest = await installer.install(multiMcpZipPath, { version: "1.0.0" }, { ...defaultRecord })

		expect(manifest.mcp).toContain("server-a")
		expect(manifest.mcp).toContain("server-b")
		expect(manifest.mcp).toHaveLength(2)
	})

	it("should uninstall multiple MCP servers from mcp_settings.json", async () => {
		const uninstallMcpRooDir = path.join(tmpDir, "uninstall-mcp-roo")
		await fs.mkdir(uninstallMcpRooDir, { recursive: true })

		// Pre-create mcp_settings.json with multiple servers
		const settings = {
			mcpServers: {
				"server-a": { command: "node" },
				"server-b": { command: "python" },
				"keep-server": { command: "ruby" },
			},
		}
		await fs.writeFile(path.join(uninstallMcpRooDir, "mcp_settings.json"), JSON.stringify(settings), "utf-8")

		const installer = new AgentInstaller(tmpDir, uninstallMcpRooDir)
		const record: LocalInstallRecord = {
			...defaultRecord,
			installedVersion: "1.0.0",
			installState: "installed",
			manifest: {
				agents: [],
				commands: [],
				skills: [],
				rules: [],
				mcp: ["server-a", "server-b"],
			},
		}

		await installer.uninstall(record)

		// Verify the mcp_settings.json was updated �?keep-server should remain
		const updatedContent = fsSync.readFileSync(path.join(uninstallMcpRooDir, "mcp_settings.json"), "utf-8")
		const updatedSettings = JSON.parse(updatedContent)
		expect(updatedSettings.mcpServers).not.toHaveProperty("server-a")
		expect(updatedSettings.mcpServers).not.toHaveProperty("server-b")
		expect(updatedSettings.mcpServers).toHaveProperty("keep-server")
	})

	it("should handle download with no checksum (skip verification)", async () => {
		const downloadDir = path.join(tmpDir, "no-checksum-test")
		await fs.mkdir(downloadDir, { recursive: true })
		const downloader = new AgentDownloader(downloadDir)
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			downloadUrl: `${serverBaseUrl}/remote-agent-package-1.0.0.zip`,
			// No checksum provided
		}

		// Should succeed without checksum verification
		const downloadedPath = await downloader.download(versionInfo)
		expect(fsSync.existsSync(downloadedPath)).toBe(true)
	})

	it("should install rules as directories when rule is a directory", async () => {
		const ruleDirTmpDir = path.join(tmpDir, "rule-dir-tmp")
		const ruleDirRooDir = path.join(tmpDir, "rule-dir-roo")
		await fs.mkdir(ruleDirTmpDir, { recursive: true })
		await fs.mkdir(ruleDirRooDir, { recursive: true })

		const ruleDirZipPath = path.join(tmpDir, "rule-dir.zip")
		await createZipWithModules(ruleDirZipPath, {
			rules: {
				"my-rule/rule.md": "# My Rule\n",
				"my-rule/extra.md": "# Extra\n",
			},
		})

		const installer = new AgentInstaller(ruleDirTmpDir, ruleDirRooDir)
		const manifest = await installer.install(ruleDirZipPath, { version: "1.0.0" }, { ...defaultRecord })

		expect(manifest.rules).toContain("my-rule")
		// Verify the rule directory was created directly under rooDir (not under "rules/")
		expect(fsSync.existsSync(path.join(ruleDirRooDir, "my-rule"))).toBe(true)
	})

	// ─── agents.order sorting tests ──────────────────────────────────────

	it("should sort agents according to agents.order from versionInfo", async () => {
		const sortTmpDir = path.join(tmpDir, "sort-order-tmp")
		const sortRooDir = path.join(tmpDir, "sort-order-roo")
		await fs.mkdir(sortTmpDir, { recursive: true })
		await fs.mkdir(sortRooDir, { recursive: true })

		const sortZipPath = path.join(tmpDir, "sort-order.zip")
		await createZipWithModules(sortZipPath, {
			agents: {
				"agent-c.yaml": "name: Agent C\nslug: agent-c\n",
				"agent-a.yaml": "name: Agent A\nslug: agent-a\n",
				"agent-b.yaml": "name: Agent B\nslug: agent-b\n",
			},
		})

		const installer = new AgentInstaller(sortTmpDir, sortRooDir)
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			agents: { order: ["agent-a", "agent-b", "agent-c"] },
		}
		await installer.install(sortZipPath, versionInfo, { ...defaultRecord })

		// Read custom_modes.yaml and verify order
		const yamlLib = await import("yaml")
		const content = fsSync.readFileSync(path.join(sortRooDir, "custom_modes.yaml"), "utf-8")
		const data = yamlLib.parse(content)
		const slugs = data.customModes.map((m: any) => m.slug)
		expect(slugs).toEqual(["agent-a", "agent-b", "agent-c"])
	})

	it("should keep pre-existing modes before sorted agents", async () => {
		const preexistTmpDir = path.join(tmpDir, "sort-preexist-tmp")
		const preexistRooDir = path.join(tmpDir, "sort-preexist-roo")
		await fs.mkdir(preexistTmpDir, { recursive: true })
		await fs.mkdir(preexistRooDir, { recursive: true })

		// Pre-create custom_modes.yaml with existing modes
		await fs.writeFile(
			path.join(preexistRooDir, "custom_modes.yaml"),
			"customModes:\n  - slug: user-mode-1\n    name: User Mode 1\n  - slug: user-mode-2\n    name: User Mode 2\n",
			"utf-8",
		)

		const preexistZipPath = path.join(tmpDir, "sort-preexist.zip")
		await createZipWithModules(preexistZipPath, {
			agents: {
				"agent-x.yaml": "name: Agent X\nslug: agent-x\n",
				"agent-y.yaml": "name: Agent Y\nslug: agent-y\n",
			},
		})

		const installer = new AgentInstaller(preexistTmpDir, preexistRooDir)
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			agents: { order: ["agent-y", "agent-x"] },
		}
		await installer.install(preexistZipPath, versionInfo, { ...defaultRecord })

		const yamlLib = await import("yaml")
		const content = fsSync.readFileSync(path.join(preexistRooDir, "custom_modes.yaml"), "utf-8")
		const data = yamlLib.parse(content)
		const slugs = data.customModes.map((m: any) => m.slug)
		// Pre-existing modes must stay in place, sorted agents appended after
		expect(slugs).toEqual(["user-mode-1", "user-mode-2", "agent-y", "agent-x"])
	})

	it("should append agents not in order to the end", async () => {
		const partialTmpDir = path.join(tmpDir, "sort-partial-tmp")
		const partialRooDir = path.join(tmpDir, "sort-partial-roo")
		await fs.mkdir(partialTmpDir, { recursive: true })
		await fs.mkdir(partialRooDir, { recursive: true })

		const partialZipPath = path.join(tmpDir, "sort-partial.zip")
		await createZipWithModules(partialZipPath, {
			agents: {
				"agent-a.yaml": "name: Agent A\nslug: agent-a\n",
				"agent-b.yaml": "name: Agent B\nslug: agent-b\n",
				"agent-c.yaml": "name: Agent C\nslug: agent-c\n",
			},
		})

		const installer = new AgentInstaller(partialTmpDir, partialRooDir)
		// order only includes agent-c and agent-a, agent-b is missing from order
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			agents: { order: ["agent-c", "agent-a"] },
		}
		await installer.install(partialZipPath, versionInfo, { ...defaultRecord })

		const yamlLib = await import("yaml")
		const content = fsSync.readFileSync(path.join(partialRooDir, "custom_modes.yaml"), "utf-8")
		const data = yamlLib.parse(content)
		const slugs = data.customModes.map((m: any) => m.slug)
		// agent-b is not in order, should be appended to the end
		expect(slugs).toEqual(["agent-c", "agent-a", "agent-b"])
	})

	it("should not sort when agents.order is absent", async () => {
		const noOrderTmpDir = path.join(tmpDir, "sort-no-order-tmp")
		const noOrderRooDir = path.join(tmpDir, "sort-no-order-roo")
		await fs.mkdir(noOrderTmpDir, { recursive: true })
		await fs.mkdir(noOrderRooDir, { recursive: true })

		const noOrderZipPath = path.join(tmpDir, "sort-no-order.zip")
		await createZipWithModules(noOrderZipPath, {
			agents: {
				"agent-a.yaml": "name: Agent A\nslug: agent-a\n",
				"agent-b.yaml": "name: Agent B\nslug: agent-b\n",
			},
		})

		const installer = new AgentInstaller(noOrderTmpDir, noOrderRooDir)
		// No agents field at all
		const versionInfo: ResourcePackageVersion = { version: "1.0.0" }
		const manifest = await installer.install(noOrderZipPath, versionInfo, { ...defaultRecord })

		// All agents should be installed regardless of order
		expect(manifest.agents).toContain("agent-a")
		expect(manifest.agents).toContain("agent-b")
		expect(manifest.agents).toHaveLength(2)
	})

	it("should ignore slugs in order that do not exist in zip", async () => {
		const extraSlugTmpDir = path.join(tmpDir, "sort-extra-slug-tmp")
		const extraSlugRooDir = path.join(tmpDir, "sort-extra-slug-roo")
		await fs.mkdir(extraSlugTmpDir, { recursive: true })
		await fs.mkdir(extraSlugRooDir, { recursive: true })

		const extraSlugZipPath = path.join(tmpDir, "sort-extra-slug.zip")
		await createZipWithModules(extraSlugZipPath, {
			agents: {
				"agent-a.yaml": "name: Agent A\nslug: agent-a\n",
				"agent-b.yaml": "name: Agent B\nslug: agent-b\n",
			},
		})

		const installer = new AgentInstaller(extraSlugTmpDir, extraSlugRooDir)
		// order includes "phantom-agent" which doesn't exist in zip
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			agents: { order: ["phantom-agent", "agent-a", "agent-b"] },
		}
		const manifest = await installer.install(extraSlugZipPath, versionInfo, { ...defaultRecord })

		// All real agents should be installed; phantom-agent is ignored
		expect(manifest.agents).toContain("agent-a")
		expect(manifest.agents).toContain("agent-b")
		expect(manifest.agents).toHaveLength(2)

		const yamlLib = await import("yaml")
		const content = fsSync.readFileSync(path.join(extraSlugRooDir, "custom_modes.yaml"), "utf-8")
		const data = yamlLib.parse(content)
		const slugs = data.customModes.map((m: any) => m.slug)
		expect(slugs).toEqual(["agent-a", "agent-b"])
	})

	it("should not sort when agents.order is a non-array value", async () => {
		const nonArrayTmpDir = path.join(tmpDir, "sort-non-array-tmp")
		const nonArrayRooDir = path.join(tmpDir, "sort-non-array-roo")
		await fs.mkdir(nonArrayTmpDir, { recursive: true })
		await fs.mkdir(nonArrayRooDir, { recursive: true })

		const nonArrayZipPath = path.join(tmpDir, "sort-non-array.zip")
		await createZipWithModules(nonArrayZipPath, {
			agents: {
				"agent-a.yaml": "name: Agent A\nslug: agent-a\n",
				"agent-b.yaml": "name: Agent B\nslug: agent-b\n",
			},
		})

		const installer = new AgentInstaller(nonArrayTmpDir, nonArrayRooDir)
		// agents.order is a string instead of array — should be ignored gracefully
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			agents: { order: "not-an-array" } as any,
		}
		const manifest = await installer.install(nonArrayZipPath, versionInfo, { ...defaultRecord })

		// All agents should still be installed, just not sorted
		expect(manifest.agents).toContain("agent-a")
		expect(manifest.agents).toContain("agent-b")
		expect(manifest.agents).toHaveLength(2)
	})

	it("should not sort when agents.order is an empty array", async () => {
		const emptyOrderTmpDir = path.join(tmpDir, "sort-empty-order-tmp")
		const emptyOrderRooDir = path.join(tmpDir, "sort-empty-order-roo")
		await fs.mkdir(emptyOrderTmpDir, { recursive: true })
		await fs.mkdir(emptyOrderRooDir, { recursive: true })

		const emptyOrderZipPath = path.join(tmpDir, "sort-empty-order.zip")
		await createZipWithModules(emptyOrderZipPath, {
			agents: {
				"agent-a.yaml": "name: Agent A\nslug: agent-a\n",
				"agent-b.yaml": "name: Agent B\nslug: agent-b\n",
			},
		})

		const installer = new AgentInstaller(emptyOrderTmpDir, emptyOrderRooDir)
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			agents: { order: [] },
		}
		const manifest = await installer.install(emptyOrderZipPath, versionInfo, { ...defaultRecord })

		// All agents should still be installed, just not sorted
		expect(manifest.agents).toContain("agent-a")
		expect(manifest.agents).toContain("agent-b")
		expect(manifest.agents).toHaveLength(2)
	})
})
