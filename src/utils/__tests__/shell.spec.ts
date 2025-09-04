import * as vscode from "vscode"
import { userInfo } from "os"
import fs from "fs"
import { getShell, SHELL_PATHS } from "../shell"

// Mock the os module
vi.mock("os", () => ({
	userInfo: vi.fn(() => ({ shell: null })),
}))

describe("Shell Detection Tests", () => {
	let originalPlatform: string
	let originalEnv: NodeJS.ProcessEnv
	let originalGetConfig: any

	// Define whitelist constants for different shell path groups
	const POWER_SHELL_WHITELIST = [SHELL_PATHS.POWERSHELL_7, SHELL_PATHS.POWERSHELL_LEGACY]
	const ALL_SHELL_PATHS_WHITELIST = Object.values(SHELL_PATHS)

	// Helper to mock VS Code configuration
	function mockVsCodeConfig(platformKey: string, defaultProfileName: string | null, profiles: Record<string, any>) {
		vscode.workspace.getConfiguration = () =>
			({
				get: (key: string) => {
					if (key === `defaultProfile.${platformKey}`) {
						return defaultProfileName
					}
					if (key === `profiles.${platformKey}`) {
						return profiles
					}
					return undefined
				},
			}) as any
	}

	// Helper to mock fs.existsSync with a whitelist of paths that should return true
	function mockExistsSync(whitelist: string[] = []) {
		return vi.spyOn(fs, "existsSync").mockImplementation((path: fs.PathLike) => {
			const pathStr = path as string
			return whitelist.includes(pathStr)
		})
	}

	// Helper to mock fs.statSync with a whitelist of paths that should return file stats
	function mockStatSync(whitelist: string[] = []) {
		return vi.spyOn(fs, "statSync").mockImplementation((path: fs.PathLike) => {
			const pathStr = path as string
			if (whitelist.includes(pathStr)) {
				return { isFile: () => true } as fs.Stats
			}
			return { isFile: () => false } as fs.Stats
		})
	}

	beforeEach(() => {
		// Store original references
		originalPlatform = process.platform
		originalEnv = { ...process.env }
		originalGetConfig = vscode.workspace.getConfiguration

		// Clear environment variables for a clean test
		delete process.env.SHELL
		delete process.env.COMSPEC

		// Reset userInfo mock to default
		vi.mocked(userInfo).mockReturnValue({ shell: null } as any)
	})

	afterEach(() => {
		// Restore everything
		Object.defineProperty(process, "platform", { value: originalPlatform })
		process.env = originalEnv
		vscode.workspace.getConfiguration = originalGetConfig
		vi.clearAllMocks()
	})

	// --------------------------------------------------------------------------
	// Windows Shell Detection
	// --------------------------------------------------------------------------
	describe("Windows Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "win32" })
		})

		it("uses explicit PowerShell 7 path from VS Code config (profile path)", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: { path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" },
			})
			expect(getShell()).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
		})

		it("uses PowerShell 7 path if source is 'PowerShell' but no explicit path", () => {
			const existsSyncMock = mockExistsSync(POWER_SHELL_WHITELIST)
			const statSyncMock = mockStatSync(POWER_SHELL_WHITELIST)

			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: { source: "PowerShell" },
			})
			expect(getShell()).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")

			// Restore mocks
			existsSyncMock.mockRestore()
			statSyncMock.mockRestore()
		})

		it("falls back to PowerShell 7 if profile includes 'powershell' but no path/source", () => {
			const existsSyncMock = mockExistsSync(POWER_SHELL_WHITELIST)
			const statSyncMock = mockStatSync(POWER_SHELL_WHITELIST)

			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: {},
			})
			expect(getShell()).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")

			existsSyncMock.mockRestore()
			statSyncMock.mockRestore()
		})

		it("uses WSL bash when profile indicates WSL source", () => {
			mockVsCodeConfig("windows", "WSL", {
				WSL: { source: "WSL" },
			})
			expect(getShell()).toBe("/bin/bash")
		})

		it("uses WSL bash when profile name includes 'wsl'", () => {
			mockVsCodeConfig("windows", "Ubuntu WSL", {
				"Ubuntu WSL": {},
			})
			expect(getShell()).toBe("/bin/bash")
		})

		it("defaults to cmd.exe if no special profile is matched", () => {
			mockVsCodeConfig("windows", "CommandPrompt", {
				CommandPrompt: {},
			})
			expect(getShell()).toBe("C:\\Windows\\System32\\cmd.exe")
		})

		it("handles undefined profile gracefully", () => {
			// Mock a case where defaultProfileName exists but the profile doesn't
			mockVsCodeConfig("windows", "NonexistentProfile", {})
			expect(getShell()).toBe("C:\\Windows\\System32\\cmd.exe")
		})

		it("respects userInfo() if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			vi.mocked(userInfo).mockReturnValue({ shell: "C:\\Custom\\PowerShell.exe" } as any)

			expect(getShell()).toBe("C:\\Custom\\PowerShell.exe")
		})

		it("respects an odd COMSPEC if no userInfo shell is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			process.env.COMSPEC = "D:\\CustomCmd\\cmd.exe"

			const mock = mockExistsSync()

			expect(getShell()).toBe("D:\\CustomCmd\\cmd.exe")

			mock.mockRestore()
		})
	})

	// --------------------------------------------------------------------------
	// macOS Shell Detection
	// --------------------------------------------------------------------------
	describe("macOS Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "darwin" })
		})

		it("uses VS Code profile path if available", () => {
			mockVsCodeConfig("osx", "MyCustomShell", {
				MyCustomShell: { path: "/usr/local/bin/fish" },
			})
			expect(getShell()).toBe("/usr/local/bin/fish")
		})

		it("falls back to userInfo().shell if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			vi.mocked(userInfo).mockReturnValue({ shell: "/opt/homebrew/bin/zsh" } as any)
			expect(getShell()).toBe("/opt/homebrew/bin/zsh")
		})

		it("falls back to SHELL env var if no userInfo shell is found", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			process.env.SHELL = "/usr/local/bin/zsh"
			const existsSyncMock = mockExistsSync()
			const statSyncMock = mockStatSync()

			expect(getShell()).toBe("/usr/local/bin/zsh")

			existsSyncMock.mockRestore()
			statSyncMock.mockRestore()
		})

		it("falls back to /bin/zsh if no config, userInfo, or env variable is set", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			const existsSyncMock = mockExistsSync([SHELL_PATHS.ZSH])
			const statSyncMock = mockStatSync([SHELL_PATHS.ZSH])

			expect(getShell()).toBe("/bin/zsh")

			existsSyncMock.mockRestore()
			statSyncMock.mockRestore()
		})
	})

	// --------------------------------------------------------------------------
	// Linux Shell Detection
	// --------------------------------------------------------------------------
	describe("Linux Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "linux" })
		})

		it("uses VS Code profile path if available", () => {
			mockVsCodeConfig("linux", "CustomProfile", {
				CustomProfile: { path: "/usr/bin/fish" },
			})
			expect(getShell()).toBe("/usr/bin/fish")
		})

		it("falls back to userInfo().shell if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			vi.mocked(userInfo).mockReturnValue({ shell: "/usr/bin/zsh" } as any)
			expect(getShell()).toBe("/usr/bin/zsh")
		})

		it("falls back to SHELL env var if no userInfo shell is found", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			process.env.SHELL = "/usr/bin/fish"
			const existsSyncMock = mockExistsSync()
			const statSyncMock = mockStatSync()

			expect(getShell()).toBe("/usr/bin/fish")

			existsSyncMock.mockRestore()
			statSyncMock.mockRestore()
		})

		it("falls back to /bin/bash if nothing is set", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			const existsSyncMock = mockExistsSync([SHELL_PATHS.BASH])
			const statSyncMock = mockStatSync([SHELL_PATHS.BASH])

			expect(getShell()).toBe("/bin/bash")

			existsSyncMock.mockRestore()
			statSyncMock.mockRestore()
		})
	})

	// --------------------------------------------------------------------------
	// Unknown Platform & Error Handling
	// --------------------------------------------------------------------------
	describe("Unknown Platform / Error Handling", () => {
		it("falls back to /bin/sh for unknown platforms", () => {
			Object.defineProperty(process, "platform", { value: "sunos" })
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			expect(getShell()).toBe("/bin/sh")
		})

		it("handles VS Code config errors gracefully, falling back to userInfo shell if present", () => {
			Object.defineProperty(process, "platform", { value: "linux" })
			vscode.workspace.getConfiguration = () => {
				throw new Error("Configuration error")
			}
			vi.mocked(userInfo).mockReturnValue({ shell: "/bin/bash" } as any)
			expect(getShell()).toBe("/bin/bash")
		})

		it("handles userInfo errors gracefully, falling back to environment variable if present", () => {
			Object.defineProperty(process, "platform", { value: "darwin" })
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			vi.mocked(userInfo).mockImplementation(() => {
				throw new Error("userInfo error")
			})
			const existsSyncMock = mockExistsSync()
			const statSyncMock = mockStatSync()

			process.env.SHELL = "/bin/zsh"
			expect(getShell()).toBe("/bin/zsh")

			existsSyncMock.mockRestore()
			statSyncMock.mockRestore()
		})

		it("falls back fully to default shell paths if everything fails", () => {
			Object.defineProperty(process, "platform", { value: "linux" })
			vscode.workspace.getConfiguration = () => {
				throw new Error("Configuration error")
			}
			vi.mocked(userInfo).mockImplementation(() => {
				throw new Error("userInfo error")
			})
			delete process.env.SHELL
			expect(getShell()).toBe("/bin/bash")
		})
	})
})
