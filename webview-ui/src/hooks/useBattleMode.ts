import { useCallback, useEffect, useState } from "react"

import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"

export interface BattleModeState {
	isActive: boolean
	isPaused: boolean
	errorCount: number
	recoveryActions: number
	config: {
		enabled: boolean
		errorThreshold: number
		contextThreshold: number
		modelThreshold: number
		backupModel?: string
	}
}

export function useBattleMode() {
	const [battleModeState, setBattleModeState] = useState<BattleModeState>({
		isActive: false,
		isPaused: false,
		errorCount: 0,
		recoveryActions: 0,
		config: {
			enabled: false,
			errorThreshold: 3,
			contextThreshold: 3,
			modelThreshold: 3,
			backupModel: undefined,
		},
	})

	// 从扩展接收战斗模式状态更新
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data as any
			if (message.type === "battleModeStateUpdate") {
				setBattleModeState({
					isActive: message.isActive ?? false,
					isPaused: message.isPaused ?? false,
					errorCount: message.errorCount ?? 0,
					recoveryActions: message.recoveryActions ?? 0,
					config: message.config ?? battleModeState.config,
				})
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [])

	// 更新战斗模式配置
	const updateBattleModeConfig = useCallback(
		(config: Partial<BattleModeState["config"]>) => {
			vscode.postMessage({
				type: "updateBattleModeConfig",
				config: { ...battleModeState.config, ...config },
			} as any)
		},
		[battleModeState.config],
	)

	// 重置战斗模式计数器
	const resetBattleModeCounters = useCallback(() => {
		vscode.postMessage({ type: "resetBattleModeCounters" } as any)
	}, [])

	// 切换战斗模式启用状态
	const toggleBattleMode = useCallback((enabled: boolean) => {
		vscode.postMessage({
			type: "toggleBattleMode",
			enabled,
		} as any)
	}, [])

	return {
		...battleModeState,
		updateBattleModeConfig,
		resetBattleModeCounters,
		toggleBattleMode,
	}
}
