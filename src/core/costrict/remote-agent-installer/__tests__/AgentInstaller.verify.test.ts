/**
 * AgentInstaller verification tests.
 * Covers: install verification, uninstall verification, warning detection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import * as os from "os"
import { AgentInstaller } from "../AgentInstaller"
import type { InstalledManifest, LocalInstallRecord, ResourcePackageVersion } from "../types"

vi.mock("../../../utils/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
}))

vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockResolvedValue(undefined),
}))

async function createZipWithModules(destPath: string, modules: Record<string, any>): Promise<void> {
	const AdmZip = (await import("adm-zip")).default
	const zip = new AdmZip()

	const srcDir = path.join(path.dirname(destPath), "zip-src-" + Date.now())
	await fs.mkdir(srcDir, { recursive: true })

	const manifestModules = Object.keys(modules)
	await fs.writeFile(
		path.join(srcDir, "manifest.json"),
		JSON.stringify({ version: "1.0.0", modules: manifestModules }),
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
					await fs.mkdir(path.dirname(entryPath), { recursive: true })
					await fs.writeFile(entryPath, entryContent, "utf-8")
				} else if (typeof entryContent === "object" && entryContent !== null) {
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

describe("AgentInstaller verification", () => {
	let tmpDir: string
	let rooDir: string

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `ri-verify-test-${Date.now()}`)
		rooDir = path.join(tmpDir, "roo")
		await fs.mkdir(tmpDir, { recursive: true })
		await fs.mkdir(rooDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("should return empty warnings after successful install verification", async () => {
		const zipPath = path.join(tmpDir, "verify-install.zip")
		await createZipWithModules(zipPath, {
			agents: "name: Verify Agent\nslug: verify-agent\n",
			commands: "# Verify Command\n",
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
		const installedManifest = await installer.install(zipPath, versionInfo, record)
		const warnings = await (installer as any).verifyInstalled(installedManifest)
		expect(warnings).toEqual([])
	})

	it("should warn when installed item is missing during verification", async () => {
		const installer = new AgentInstaller(tmpDir, rooDir)
		const manifest: InstalledManifest = {
			agents: ["missing-agent"],
			commands: ["missing.md"],
			skills: ["missing-skill"],
			rules: ["missing-rule"],
			mcp: ["missing-server"],
		}
		const warnings = await (installer as any).verifyInstalled(manifest)
		expect(warnings.length).toBeGreaterThan(0)
		expect(warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining("custom_modes.yaml missing"),
				expect.stringContaining("mcp_settings.json missing"),
				expect.stringContaining('command "missing.md" missing'),
				expect.stringContaining('skill "missing-skill" missing'),
				expect.stringContaining('rule "missing-rule" missing'),
			]),
		)
	})

	it("should warn when uninstalled item is still present during verification", async () => {
		const zipPath = path.join(tmpDir, "verify-uninstall.zip")
		await createZipWithModules(zipPath, {
			agents: "name: Uninstall Agent\nslug: uninstall-agent\n",
			commands: "# Uninstall Command\n",
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
		const installedManifest = await installer.install(zipPath, versionInfo, record)
		const warnings = await (installer as any).verifyUninstalled(installedManifest)
		expect(warnings.length).toBeGreaterThan(0)
		expect(warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining('agent "uninstall-agent" still present'),
				expect.stringContaining('command "test.md" still present'),
			]),
		)
	})

	it("should return empty warnings after successful uninstall verification", async () => {
		const zipPath = path.join(tmpDir, "verify-uninstall-ok.zip")
		await createZipWithModules(zipPath, {
			agents: "name: Ok Agent\nslug: ok-agent\n",
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
		const installedManifest = await installer.install(zipPath, versionInfo, record)
		await installer.uninstall({ ...record, manifest: installedManifest })
		const warnings = await (installer as any).verifyUninstalled(installedManifest)
		expect(warnings).toEqual([])
	})
})
