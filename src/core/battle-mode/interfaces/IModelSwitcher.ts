/**
 * 模型切换器接口
 * 负责管理备用模型列表并执行模型切换操作
 */
export interface IModelSwitcher {
	/**
	 * 切换到备用模型
	 * @param currentModel - 当前使用的模型
	 * @param fallbackModels - 备用模型列表
	 * @returns 切换后的模型ID
	 */
	switchModel(currentModel: string, fallbackModels: string[]): Promise<string>

	/**
	 * 验证模型是否可用
	 * @param modelId - 模型ID
	 * @returns 是否可用
	 */
	validateModel(modelId: string): Promise<boolean>

	/**
	 * 获取备用模型列表
	 * @returns 备用模型数组
	 */
	getFallbackModels(): string[]

	/**
	 * 重置切换计数
	 */
	resetSwitchCount(): void

	/**
	 * 获取当前切换计数
	 * @returns 切换次数
	 */
	getSwitchCount(): number

	/**
	 * 获取当前模型
	 * @returns 当前模型ID
	 */
	getCurrentModel(): string

	/**
	 * 设置当前模型
	 * @param modelId - 模型ID
	 */
	setCurrentModel(modelId: string): void

	/**
	 * 检查是否达到最大切换次数
	 * @returns 是否达到最大次数
	 */
	isMaxSwitchesReached(): boolean

	/**
	 * 获取模型切换历史
	 * @returns 切换历史记录
	 */
	getSwitchHistory(): ModelSwitchHistory[]
}

/**
 * 模型切换历史记录
 */
export interface ModelSwitchHistory {
	/** 切换时间 */
	timestamp: number

	/** 从哪个模型切换 */
	fromModel: string

	/** 切换到哪个模型 */
	toModel: string

	/** 切换原因 */
	reason: string

	/** 是否成功 */
	success: boolean
}
