// npx vitest run src/services/checkpoints/__tests__/CheckpointConfigParser.spec.ts

import fs from "fs/promises"
import path from "path"
import os from "os"
import { CheckpointConfigParser } from "../CheckpointConfigParser"

const tmpDir = path.join(os.tmpdir(), "CheckpointConfigParser")

describe("CheckpointConfigParser", () => {
	let testDir: string

	beforeEach(async () => {
		testDir = path.join(tmpDir, `test-${Date.now()}`)
		await fs.mkdir(testDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	describe("#loadConfig", () => {
		it("returns null when config file does not exist", async () => {
			const config = await CheckpointConfigParser.loadConfig(testDir)
			expect(config).toBeNull()
		})

		it("returns null when config file has invalid JSON", async () => {
			const configPath = path.join(testDir, ".costrict-checkpoint.json")
			await fs.writeFile(configPath, "invalid json {{{")
			const config = await CheckpointConfigParser.loadConfig(testDir)
			expect(config).toBeNull()
		})

		it("returns null when config file has invalid structure", async () => {
			const configPath = path.join(testDir, ".costrict-checkpoint.json")
			await fs.writeFile(configPath, JSON.stringify({ invalid: "structure" }))
			const config = await CheckpointConfigParser.loadConfig(testDir)
			expect(config).toBeNull()
		})

		it("loads valid config file", async () => {
			const configPath = path.join(testDir, ".costrict-checkpoint.json")
			const validConfig = {
				checkpoints: {
					enabledRepos: ["repo1", "repo2"],
					disabledRepos: ["repo3"],
					defaultBehavior: "enabled" as const,
				},
			}
			await fs.writeFile(configPath, JSON.stringify(validConfig))

			const config = await CheckpointConfigParser.loadConfig(testDir)
			expect(config).toEqual(validConfig)
		})

		it("loads minimal config file", async () => {
			const configPath = path.join(testDir, ".costrict-checkpoint.json")
			const minimalConfig = {
				checkpoints: {},
			}
			await fs.writeFile(configPath, JSON.stringify(minimalConfig))

			const config = await CheckpointConfigParser.loadConfig(testDir)
			expect(config).toEqual(minimalConfig)
		})
	})

	describe("#parseConfig", () => {
		it("parses config with all fields", () => {
			const config = {
				checkpoints: {
					enabledRepos: ["repo1", "repo2"],
					disabledRepos: ["repo3"],
					defaultBehavior: "enabled" as const,
				},
			}

			const parsed = CheckpointConfigParser.parseConfig(config)

			expect(parsed.enabledRepos).toEqual(new Set(["repo1", "repo2"]))
			expect(parsed.disabledRepos).toEqual(new Set(["repo3"]))
			expect(parsed.defaultBehavior).toBe("enabled")
		})

		it("uses default values for missing fields", () => {
			const config = {
				checkpoints: {},
			}

			const parsed = CheckpointConfigParser.parseConfig(config)

			expect(parsed.enabledRepos).toEqual(new Set())
			expect(parsed.disabledRepos).toEqual(new Set())
			expect(parsed.defaultBehavior).toBe("enabled")
		})

		it("uses default value for missing defaultBehavior", () => {
			const config = {
				checkpoints: {
					enabledRepos: ["repo1"],
					disabledRepos: ["repo2"],
				},
			}

			const parsed = CheckpointConfigParser.parseConfig(config)

			expect(parsed.enabledRepos).toEqual(new Set(["repo1"]))
			expect(parsed.disabledRepos).toEqual(new Set(["repo2"]))
			expect(parsed.defaultBehavior).toBe("enabled")
		})
	})

	describe("#validateConfig", () => {
		it("validates correct config", () => {
			const config = {
				checkpoints: {
					enabledRepos: ["repo1", "repo2"],
					disabledRepos: ["repo3"],
					defaultBehavior: "enabled",
				},
			}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		it("rejects missing checkpoints field", () => {
			const config = {}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain('Missing or invalid "checkpoints" field')
		})

		it("rejects non-object checkpoints field", () => {
			const config = {
				checkpoints: "invalid",
			}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain('Missing or invalid "checkpoints" field')
		})

		it("rejects non-array enabledRepos", () => {
			const config = {
				checkpoints: {
					enabledRepos: "not an array",
				},
			}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain('"enabledRepos" must be an array')
		})

		it("rejects non-array disabledRepos", () => {
			const config = {
				checkpoints: {
					disabledRepos: 123,
				},
			}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain('"disabledRepos" must be an array')
		})

		it("rejects non-string repo name", () => {
			const config = {
				checkpoints: {
					enabledRepos: ["repo1", 123, null],
				},
			}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain("enabledRepos[1] must be a string")
			expect(result.errors).toContain("enabledRepos[2] must be a string")
		})

		it("rejects empty repo name", () => {
			const config = {
				checkpoints: {
					enabledRepos: ["repo1", "", "  "],
				},
			}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain("enabledRepos[1] cannot be empty")
			expect(result.errors).toContain("enabledRepos[2] cannot be empty")
		})

		it("rejects repo names with invalid characters", () => {
			const config = {
				checkpoints: {
					enabledRepos: ["repo1", "repo@test", "repo!"],
				},
			}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain('enabledRepos[1] contains invalid characters: "repo@test"')
			expect(result.errors).toContain('enabledRepos[2] contains invalid characters: "repo!"')
		})

		it("rejects invalid defaultBehavior value", () => {
			const config = {
				checkpoints: {
					defaultBehavior: "invalid",
				},
			}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain('"defaultBehavior" must be either "enabled" or "disabled"')
		})

		it("accepts valid repo names with special characters", () => {
			const config = {
				checkpoints: {
					enabledRepos: ["my-repo", "my_repo", "my.repo", "path/to/repo"],
				},
			}

			const result = CheckpointConfigParser.validateConfig(config)

			expect(result.valid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})
	})

	describe("#shouldEnableRepo", () => {
		it("returns true when repo is in enabledRepos", () => {
			const config = {
				enabledRepos: new Set(["repo1", "repo2"]),
				disabledRepos: new Set(["repo3"]),
				defaultBehavior: "disabled" as const,
			}

			expect(CheckpointConfigParser.shouldEnableRepo("repo1", config)).toBe(true)
			expect(CheckpointConfigParser.shouldEnableRepo("repo2", config)).toBe(true)
		})

		it("returns false when repo is in disabledRepos", () => {
			const config = {
				enabledRepos: new Set(["repo1", "repo2"]),
				disabledRepos: new Set(["repo3", "repo4"]),
				defaultBehavior: "enabled" as const,
			}

			expect(CheckpointConfigParser.shouldEnableRepo("repo3", config)).toBe(false)
			expect(CheckpointConfigParser.shouldEnableRepo("repo4", config)).toBe(false)
		})

		it("returns true when repo not in any list and defaultBehavior is enabled", () => {
			const config = {
				enabledRepos: new Set(["repo1"]),
				disabledRepos: new Set(["repo2"]),
				defaultBehavior: "enabled" as const,
			}

			expect(CheckpointConfigParser.shouldEnableRepo("repo3", config)).toBe(true)
		})

		it("returns false when repo not in any list and defaultBehavior is disabled", () => {
			const config = {
				enabledRepos: new Set(["repo1"]),
				disabledRepos: new Set(["repo2"]),
				defaultBehavior: "disabled" as const,
			}

			expect(CheckpointConfigParser.shouldEnableRepo("repo3", config)).toBe(false)
		})

		it("prioritizes enabledRepos over disabledRepos", () => {
			const config = {
				enabledRepos: new Set(["repo1"]),
				disabledRepos: new Set(["repo1"]), // repo1 is in both lists
				defaultBehavior: "disabled" as const,
			}

			expect(CheckpointConfigParser.shouldEnableRepo("repo1", config)).toBe(true)
		})
	})

	describe("integration tests", () => {
		it("loads, validates, and parses config correctly", async () => {
			const configPath = path.join(testDir, ".costrict-checkpoint.json")
			const validConfig = {
				checkpoints: {
					enabledRepos: ["repo1", "repo2"],
					disabledRepos: ["repo3"],
					defaultBehavior: "disabled" as const,
				},
			}
			await fs.writeFile(configPath, JSON.stringify(validConfig))

			// Load config
			const config = await CheckpointConfigParser.loadConfig(testDir)
			expect(config).toEqual(validConfig)

			// Validate config
			const validation = CheckpointConfigParser.validateConfig(config!)
			expect(validation.valid).toBe(true)

			// Parse config
			const parsed = CheckpointConfigParser.parseConfig(config!)
			expect(parsed.enabledRepos).toEqual(new Set(["repo1", "repo2"]))
			expect(parsed.disabledRepos).toEqual(new Set(["repo3"]))
			expect(parsed.defaultBehavior).toBe("disabled")

			// Test shouldEnableRepo
			expect(CheckpointConfigParser.shouldEnableRepo("repo1", parsed)).toBe(true)
			expect(CheckpointConfigParser.shouldEnableRepo("repo3", parsed)).toBe(false)
			expect(CheckpointConfigParser.shouldEnableRepo("repo4", parsed)).toBe(false)
		})

		it("handles selective enable configuration", async () => {
			const configPath = path.join(testDir, ".costrict-checkpoint.json")
			const config = {
				checkpoints: {
					enabledRepos: ["repo1", "repo3"],
					disabledRepos: [],
					defaultBehavior: "disabled" as const,
				},
			}
			await fs.writeFile(configPath, JSON.stringify(config))

			const loadedConfig = await CheckpointConfigParser.loadConfig(testDir)
			const parsed = CheckpointConfigParser.parseConfig(loadedConfig!)

			// Only repo1 and repo3 should be enabled
			expect(CheckpointConfigParser.shouldEnableRepo("repo1", parsed)).toBe(true)
			expect(CheckpointConfigParser.shouldEnableRepo("repo2", parsed)).toBe(false)
			expect(CheckpointConfigParser.shouldEnableRepo("repo3", parsed)).toBe(true)
			expect(CheckpointConfigParser.shouldEnableRepo("repo4", parsed)).toBe(false)
		})

		it("handles selective disable configuration", async () => {
			const configPath = path.join(testDir, ".costrict-checkpoint.json")
			const config = {
				checkpoints: {
					enabledRepos: [],
					disabledRepos: ["repo2"],
					defaultBehavior: "enabled" as const,
				},
			}
			await fs.writeFile(configPath, JSON.stringify(config))

			const loadedConfig = await CheckpointConfigParser.loadConfig(testDir)
			const parsed = CheckpointConfigParser.parseConfig(loadedConfig!)

			// Only repo2 should be disabled
			expect(CheckpointConfigParser.shouldEnableRepo("repo1", parsed)).toBe(true)
			expect(CheckpointConfigParser.shouldEnableRepo("repo2", parsed)).toBe(false)
			expect(CheckpointConfigParser.shouldEnableRepo("repo3", parsed)).toBe(true)
		})
	})
})
