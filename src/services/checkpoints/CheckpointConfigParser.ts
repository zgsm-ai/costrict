import * as fs from "fs/promises"
import * as path from "path"
import type { CheckpointConfig, ParsedCheckpointConfig } from "./types/config"

export type { ParsedCheckpointConfig } from "./types/config"

/**
 * Checkpoint 配置文件解析器
 * 用于读取、验证和解析 .costrict-checkpoint.json 配置文件
 */
export class CheckpointConfigParser {
	private static readonly CONFIG_FILE = ".costrict-checkpoint.json"

	/**
	 * 读取并解析配置文件
	 * @param workspaceDir 工作区根目录
	 * @returns 解析后的配置对象，如果文件不存在则返回 null
	 */
	static async loadConfig(workspaceDir: string): Promise<CheckpointConfig | null> {
		const configPath = path.join(workspaceDir, this.CONFIG_FILE)

		try {
			// 检查文件是否存在
			await fs.access(configPath)
		} catch {
			// 文件不存在，返回 null
			return null
		}

		try {
			const content = await fs.readFile(configPath, "utf-8")
			const config = JSON.parse(content) as CheckpointConfig

			// 验证配置格式
			const validation = this.validateConfig(config)
			if (!validation.valid) {
				console.warn(`[CheckpointConfig] Invalid config file: ${validation.errors.join(", ")}`)
				return null
			}

			return config
		} catch (error) {
			if (error instanceof SyntaxError) {
				console.warn(`[CheckpointConfig] Failed to parse JSON config file: ${error.message}`)
			} else {
				console.warn(`[CheckpointConfig] Failed to read config file: ${error}`)
			}
			return null
		}
	}

	/**
	 * 解析配置并返回标准化的配置对象
	 * @param config 原始配置对象
	 * @returns 解析后的配置
	 */
	static parseConfig(config: CheckpointConfig): ParsedCheckpointConfig {
		const checkpoints = config.checkpoints

		return {
			enabledRepos: new Set(checkpoints.enabledRepos || []),
			disabledRepos: new Set(checkpoints.disabledRepos || []),
			defaultBehavior: checkpoints.defaultBehavior || "enabled",
		}
	}

	/**
	 * 验证配置文件格式
	 * @param config 配置对象
	 * @returns 验证结果
	 */
	static validateConfig(config: any): { valid: boolean; errors: string[] } {
		const errors: string[] = []

		// 验证 checkpoints 字段是否存在
		if (!config || typeof config !== "object") {
			errors.push("Config must be an object")
			return { valid: false, errors }
		}

		if (!config.checkpoints || typeof config.checkpoints !== "object") {
			errors.push('Missing or invalid "checkpoints" field')
			return { valid: false, errors }
		}

		const { checkpoints } = config

		// 验证 enabledRepos 字段
		if (checkpoints.enabledRepos !== undefined) {
			if (!Array.isArray(checkpoints.enabledRepos)) {
				errors.push('"enabledRepos" must be an array')
			} else {
				const repoErrors = this.validateRepoNames(checkpoints.enabledRepos, "enabledRepos")
				errors.push(...repoErrors)
			}
		}

		// 验证 disabledRepos 字段
		if (checkpoints.disabledRepos !== undefined) {
			if (!Array.isArray(checkpoints.disabledRepos)) {
				errors.push('"disabledRepos" must be an array')
			} else {
				const repoErrors = this.validateRepoNames(checkpoints.disabledRepos, "disabledRepos")
				errors.push(...repoErrors)
			}
		}

		// 验证 defaultBehavior 字段
		if (checkpoints.defaultBehavior !== undefined) {
			if (
				typeof checkpoints.defaultBehavior !== "string" ||
				!["enabled", "disabled"].includes(checkpoints.defaultBehavior)
			) {
				errors.push('"defaultBehavior" must be either "enabled" or "disabled"')
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		}
	}

	/**
	 * 验证仓库名称列表
	 * @param repos 仓库名称数组
	 * @param fieldName 字段名称（用于错误消息）
	 * @returns 错误列表
	 */
	private static validateRepoNames(repos: any[], fieldName: string): string[] {
		const errors: string[] = []

		for (let i = 0; i < repos.length; i++) {
			const repo = repos[i]

			if (typeof repo !== "string") {
				errors.push(`${fieldName}[${i}] must be a string`)
				continue
			}

			if (repo.trim() === "") {
				errors.push(`${fieldName}[${i}] cannot be empty`)
			}

			// 检查特殊字符（允许字母、数字、连字符、下划线、斜杠和点）
			if (!/^[\w\-./]+$/.test(repo)) {
				errors.push(`${fieldName}[${i}] contains invalid characters: "${repo}"`)
			}
		}

		return errors
	}

	/**
	 * 根据配置判断仓库是否应该启用 checkpoint
	 * @param repoName 仓库名称
	 * @param config 解析后的配置
	 * @returns 是否启用
	 */
	static shouldEnableRepo(repoName: string, config: ParsedCheckpointConfig): boolean {
		// 优先检查 enabledRepos
		if (config.enabledRepos.has(repoName)) {
			return true
		}

		// 检查 disabledRepos
		if (config.disabledRepos.has(repoName)) {
			return false
		}

		// 返回默认行为
		return config.defaultBehavior === "enabled"
	}
}
