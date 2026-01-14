/**
 * 恢复结果类型
 * 定义错误恢复操作的结果
 */
export interface RecoveryResult {
	/** 执行的操作类型 */
	action: "continue" | "retry" | "switch_model" | "abort"

	/** 操作详细信息 */
	details: RecoveryDetails

	/** 是否成功 */
	success: boolean

	/** 恢复耗时（毫秒） */
	duration?: number
}

/**
 * 恢复操作详情
 */
export interface RecoveryDetails {
	/** 恢复原因说明 */
	reason: string

	/** 移除的消息数量（可选） */
	removedMessages?: number

	/** 切换到的模型（可选） */
	switchedToModel?: string

	/** 清理后的对话历史（可选） */
	clearedHistory?: unknown[]

	/** 使用的恢复策略级别 */
	strategyLevel?: "level1" | "level2" | "level3"
}
