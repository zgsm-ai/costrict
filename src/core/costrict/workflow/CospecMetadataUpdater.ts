/**
 * .cospec 元数据自动更新器
 * 在对话过程中监听文档变更并自动更新 .cometa.json
 */

import * as vscode from "vscode"
import { CospecMetadataManager } from "./CospecMetadataManager"

/**
 * 元数据更新配置
 */
export interface CospecMetadataUpdateConfig {
	/** 是否启用自动更新 */
	enabled: boolean
	/** 防抖延迟（毫秒） */
	debounceDelay: number
	/** 全局存储目录 */
	globalStorageDir: string
}

/**
 * .cospec 元数据自动更新器
 */
export class CospecMetadataUpdater {
	private static instance: CospecMetadataUpdater | null = null
	private config: CospecMetadataUpdateConfig
	private disposables: vscode.Disposable[] = []
	private updateTimers = new Map<string, NodeJS.Timeout>()
	private currentTaskId: string | null = null
	private currentCheckpointId: string | null = null

	private constructor(config: CospecMetadataUpdateConfig) {
		this.config = config
	}

	/**
	 * 获取单例实例
	 */
	static getInstance(config?: CospecMetadataUpdateConfig): CospecMetadataUpdater {
		if (!CospecMetadataUpdater.instance) {
			if (!config) {
				throw new Error("首次创建实例时必须提供配置")
			}
			CospecMetadataUpdater.instance = new CospecMetadataUpdater(config)
		}
		return CospecMetadataUpdater.instance
	}

	/**
	 * 启动元数据更新器
	 */
	start(): void {
		if (!this.config.enabled) {
			console.log("[CospecMetadataUpdater] 元数据更新器已禁用")
			return
		}

		// 监听文档保存事件
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument((document) => {
				this.handleDocumentSave(document)
			})
		)

		// 监听文档变更事件
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				this.handleDocumentChange(event)
			})
		)

		console.log("[CospecMetadataUpdater] 元数据更新器已启动")
	}

	/**
	 * 停止元数据更新器
	 */
	stop(): void {
		// 清理所有定时器
		this.updateTimers.forEach((timer) => {
			clearTimeout(timer)
		})
		this.updateTimers.clear()

		// 释放事件监听器
		this.disposables.forEach((disposable) => {
			disposable.dispose()
		})
		this.disposables = []

		console.log("[CospecMetadataUpdater] 元数据更新器已停止")
	}

	/**
	 * 设置当前任务信息
	 */
	setCurrentTask(taskId: string, checkpointId?: string): void {
		this.currentTaskId = taskId
		this.currentCheckpointId = checkpointId || null
		console.log("[CospecMetadataUpdater] 设置当前任务", { taskId, checkpointId })
	}

	/**
	 * 清除当前任务信息
	 */
	clearCurrentTask(): void {
		this.currentTaskId = null
		this.currentCheckpointId = null
		console.log("[CospecMetadataUpdater] 清除当前任务信息")
	}

	/**
	 * 处理文档保存事件
	 */
	private handleDocumentSave(document: vscode.TextDocument): void {
		if (!this.shouldUpdateMetadata(document.uri)) {
			return
		}

		// 立即更新元数据（保存时不需要防抖）
		this.updateMetadataForFile(document.uri)
	}

	/**
	 * 处理文档变更事件
	 */
	private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
		const document = event.document
		
		if (!this.shouldUpdateMetadata(document.uri)) {
			return
		}

		// 使用防抖机制，避免频繁更新
		this.scheduleMetadataUpdate(document.uri)
	}

	/**
	 * 检查是否应该更新元数据
	 */
	private shouldUpdateMetadata(uri: vscode.Uri): boolean {
		// 必须有当前任务信息
		if (!this.currentTaskId) {
			return false
		}

		// 必须是 .cospec 文件
		if (!CospecMetadataManager.isCospecFile(uri.fsPath)) {
			return false
		}

		// 只处理支持的文件类型
		const fileName = uri.fsPath.split(/[/\\]/).pop()
		const supportedFiles = ['requirements.md', 'design.md', 'tasks.md']
		
		return supportedFiles.includes(fileName || '')
	}

	/**
	 * 调度元数据更新（带防抖）
	 */
	private scheduleMetadataUpdate(uri: vscode.Uri): void {
		const filePath = uri.fsPath
		
		// 清除现有的定时器
		const existingTimer = this.updateTimers.get(filePath)
		if (existingTimer) {
			clearTimeout(existingTimer)
		}

		// 设置新的定时器
		const timer = setTimeout(() => {
			this.updateMetadataForFile(uri)
			this.updateTimers.delete(filePath)
		}, this.config.debounceDelay)

		this.updateTimers.set(filePath, timer)
	}

	/**
	 * 为指定文件更新元数据
	 */
	private async updateMetadataForFile(uri: vscode.Uri): Promise<void> {
		if (!this.currentTaskId) {
			console.warn("[CospecMetadataUpdater] 无当前任务信息，跳过元数据更新")
			return
		}

		try {
			// 获取或生成 checkpointId
			let checkpointId = this.currentCheckpointId
			if (!checkpointId) {
				// 如果没有提供 checkpointId，跳过更新
				console.log("[CospecMetadataUpdater] 没有提供 checkpointId，跳过更新")
				return
			}

			if (!checkpointId) {
				console.warn("[CospecMetadataUpdater] 无法获取 checkpointId，使用时间戳")
				checkpointId = Date.now().toString()
			}

			// 更新元数据
			await CospecMetadataManager.updateMetadataFromUri(
				uri,
				this.currentTaskId,
				checkpointId
			)

			console.log("[CospecMetadataUpdater] 元数据更新成功", {
				file: uri.fsPath,
				taskId: this.currentTaskId,
				checkpointId
			})
		} catch (error) {
			console.error("[CospecMetadataUpdater] 元数据更新失败", {
				file: uri.fsPath,
				error: error instanceof Error ? error.message : String(error)
			})
		}
	}

	/**
	 * 获取当前的 checkpointId
	 */
	private async getCurrentCheckpointId(): Promise<string | null> {
		// 暂时返回 null，实际的 checkpoint ID 会通过参数传入
		// 因为我们已经在 checkpointSave 函数中直接处理元数据更新
		return null
	}

	/**
	 * 更新配置
	 */
	updateConfig(newConfig: Partial<CospecMetadataUpdateConfig>): void {
		this.config = { ...this.config, ...newConfig }
		console.log("[CospecMetadataUpdater] 配置已更新", this.config)
	}

	/**
	 * 获取当前配置
	 */
	getConfig(): CospecMetadataUpdateConfig {
		return { ...this.config }
	}

	/**
	 * 手动触发指定文件的元数据更新
	 */
	async forceUpdateMetadata(uri: vscode.Uri, taskId?: string, checkpointId?: string): Promise<void> {
		const originalTaskId = this.currentTaskId
		const originalCheckpointId = this.currentCheckpointId

		try {
			// 临时设置任务信息
			if (taskId) this.currentTaskId = taskId
			if (checkpointId) this.currentCheckpointId = checkpointId

			await this.updateMetadataForFile(uri)
		} finally {
			// 恢复原始任务信息
			this.currentTaskId = originalTaskId
			this.currentCheckpointId = originalCheckpointId
		}
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.stop()
		CospecMetadataUpdater.instance = null
	}
}

/**
 * 便捷函数：启动元数据更新器
 */
export function startCospecMetadataUpdater(
	globalStorageDir: string,
	options: Partial<CospecMetadataUpdateConfig> = {}
): CospecMetadataUpdater {
	const config: CospecMetadataUpdateConfig = {
		enabled: true,
		debounceDelay: 2000, // 2秒防抖
		globalStorageDir,
		...options
	}

	const updater = CospecMetadataUpdater.getInstance(config)
	updater.start()
	return updater
}

/**
 * 便捷函数：停止元数据更新器
 */
export function stopCospecMetadataUpdater(): void {
	const instance = CospecMetadataUpdater.getInstance()
	instance.stop()
}