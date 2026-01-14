/**
 * 战斗模式类型导出
 */

// 配置类型
export type { BattleModeConfig } from "./BattleModeConfig"
export { DEFAULT_BATTLE_MODE_CONFIG } from "./BattleModeConfig"

// 状态类型
export type { BattleModeState, BattleModeStatus } from "./BattleModeState"
export { DEFAULT_BATTLE_MODE_STATUS } from "./BattleModeState"

// 错误上下文类型
export type { ErrorContext, Message, RecoverableErrorPattern } from "./ErrorContext"
export { RECOVERABLE_ERROR_PATTERNS } from "./ErrorContext"

// 恢复结果类型
export type { RecoveryResult, RecoveryDetails } from "./RecoveryResult"
