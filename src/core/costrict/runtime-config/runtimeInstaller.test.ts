import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	compareRuntimeVersions,
	CostrictRuntimeInstaller,
	type RuntimeDownloadProgress,
	type RuntimePackageInfoResponse,
	type RuntimeVersionInfo,
} from "./runtimeInstaller"

describe("CostrictRuntimeInstaller", () => {
	const latestVersion: RuntimeVersionInfo = {
		versionId: { major: 1, minor: 0, micro: 2 },
		appUrl: "/downloads/costrict",
		infoUrl: "/downloads/costrict.json",
	}

	const oldVersion: RuntimeVersionInfo = {
		versionId: { major: 1, minor: 0, micro: 1 },
		appUrl: "/downloads/old-costrict",
		infoUrl: "/downloads/old-costrict.json",
		status: "downloaded",
		updateAt: 1,
	}

	const packageInfo: RuntimePackageInfoResponse = {
		packageName: "costrict",
		packageType: "binary",
		fileName: "costrict",
		os: "linux",
		arch: "amd64",
		size: 10,
		checksum: "abc",
		sign: "def",
		checksumAlgo: "sha256",
		versionId: latestVersion.versionId,
		build: "test",
		description: "test",
	}

	let files = new Map<string, string>()
	let mkdirs: string[] = []
	let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }
	let downloader: { downloadClient: ReturnType<typeof vi.fn> }
	let versionApi: { getLatestVersion: ReturnType<typeof vi.fn> }
	let packageInfoApi: { getPackageInfo: ReturnType<typeof vi.fn> }

	const fileSystem = {
		existsSync: (filePath: string) => files.has(filePath),
		mkdirSync: vi.fn((dirPath: string) => {
			mkdirs.push(dirPath)
		}),
		readFileSync: vi.fn((filePath: string) => {
			const content = files.get(filePath)
			if (!content) {
				throw new Error(`missing file: ${filePath}`)
			}
			return content
		}),
		writeFileSync: vi.fn((filePath: string, data: string) => {
			files.set(filePath, data)
		}),
	}

	const createInstaller = () =>
		new CostrictRuntimeInstaller({
			fileSystem,
			homeDir: "/tmp/home",
			logger: logger as any,
			platformDetector: { platform: "linux", arch: "amd64" } as any,
			versionApi,
			packageInfoApi,
			fileDownloader: downloader as any,
			now: () => 10_000,
			sleep: vi.fn().mockResolvedValue(undefined),
		})

	beforeEach(() => {
		files = new Map()
		mkdirs = []
		logger = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}
		downloader = {
			downloadClient: vi.fn(
				async (
					targetPath: string,
					_versionInfo: RuntimeVersionInfo,
					_packageInfo: RuntimePackageInfoResponse,
					onProgress?: (progress: RuntimeDownloadProgress) => void,
				) => {
					onProgress?.({ downloaded: 5, total: 10, progress: 50 })
					files.set(targetPath, "binary")
					return targetPath
				},
			),
		}
		versionApi = {
			getLatestVersion: vi.fn().mockResolvedValue(latestVersion),
		}
		packageInfoApi = {
			getPackageInfo: vi.fn().mockResolvedValue(packageInfo),
		}
	})

	it("downloads runtime on first install and writes version metadata", async () => {
		const installer = createInstaller()

		const state = await installer.ensureInstalled()
		const paths = installer.getTargetPath()
		const versionFile = JSON.parse(files.get(paths.versionFilePath) || "{}")

		expect(state).toBe("firstInstall")
		expect(downloader.downloadClient).toHaveBeenCalledWith(
			paths.targetPath,
			latestVersion,
			packageInfo,
			expect.any(Function),
		)
		expect(versionFile.status).toBe("downloaded")
		expect(versionFile.packageInfo).toEqual(packageInfo)
		expect(files.get(paths.targetPath)).toBe("binary")
		expect(mkdirs).toContain(paths.versionDir)
		expect(mkdirs).toContain(paths.packageDir)
	})

	it("logs runtime download lifecycle in background output", async () => {
		const installer = createInstaller()
		const paths = installer.getTargetPath()

		await installer.ensureInstalled()

		expect(logger.info).toHaveBeenCalledWith("[runtime-installer] starting runtime download: 1.0.2")
		expect(logger.info.mock.calls).toContainEqual([
			expect.stringMatching(/^\[runtime-installer\] download progress: 50% \.{3,6}$/),
		])
		expect(logger.info).toHaveBeenCalledWith(
			`[runtime-installer] runtime downloaded and installed successfully: ${paths.targetPath}`,
		)
	})

	it("upgrades runtime when remote version is newer", async () => {
		const installer = createInstaller()
		const paths = installer.getTargetPath()
		files.set(paths.targetPath, "old-binary")
		files.set(paths.versionFilePath, JSON.stringify(oldVersion))

		const state = await installer.ensureInstalled()
		const versionFile = JSON.parse(files.get(paths.versionFilePath) || "{}")

		expect(state).toBe("upgraded")
		expect(downloader.downloadClient).toHaveBeenCalledTimes(1)
		expect(versionFile.versionId).toEqual(latestVersion.versionId)
		expect(versionFile.status).toBe("downloaded")
	})

	it("reuses existing runtime when update metadata fetch fails but binary exists", async () => {
		versionApi.getLatestVersion.mockRejectedValue(new Error("network down"))
		const installer = createInstaller()
		const paths = installer.getTargetPath()
		files.set(paths.targetPath, "existing-binary")
		files.set(paths.versionFilePath, JSON.stringify(oldVersion))

		const state = await installer.ensureInstalled()

		expect(state).toBe("noUpdate")
		expect(downloader.downloadClient).not.toHaveBeenCalled()
	})

	it("marks failed install when download fails and no binary exists", async () => {
		downloader.downloadClient.mockRejectedValue(new Error("download failed"))
		const installer = createInstaller()
		const paths = installer.getTargetPath()

		const state = await installer.ensureInstalled()
		const versionFile = JSON.parse(files.get(paths.versionFilePath) || "{}")

		expect(state).toBe("failed")
		expect(versionFile.status).toBe("failed")
	})
})

describe("compareRuntimeVersions", () => {
	it("treats failed local version as needing update", () => {
		expect(
			compareRuntimeVersions(
				{
					versionId: { major: 1, minor: 0, micro: 0 },
					appUrl: "",
					infoUrl: "",
				},
				{
					versionId: { major: 1, minor: 0, micro: 0 },
					appUrl: "",
					infoUrl: "",
					status: "failed",
				},
			),
		).toBeGreaterThan(0)
	})
})
