import { useMemo, useRef, useState } from "react"

import type { ModeConfig, ProviderSettings, ProviderSettingsEntry } from "@roo-code/types"
import { defaultModeSlug, type Mode } from "@roo/modes"

import { ExtensionStateContext, type ExtensionStateContextType } from "../context/ExtensionStateContext"
import { ChatTextArea } from "../components/chat/ChatTextArea"

const EMPTY_REVIEW_TASK = { status: "idle" } as unknown as ExtensionStateContextType["reviewTask"]

type CloudChatInputProps = {
	inputValue: string
	setInputValue: (value: string) => void
	onSend: () => void
	placeholderText: string
	sendingDisabled: boolean
	isStreaming?: boolean
}

export default function CloudChatInput({
	inputValue,
	setInputValue,
	onSend,
	placeholderText,
	sendingDisabled,
	isStreaming = false,
}: CloudChatInputProps) {
	const textAreaRef = useRef<HTMLTextAreaElement>(null)
	const [selectedImages, setSelectedImages] = useState<string[]>([])
	const [mode, setMode] = useState<Mode>(defaultModeSlug)

	const contextValue = useMemo<ExtensionStateContextType>(
		() => ({
			historyPreviewCollapsed: false,
			didHydrateState: true,
			showWelcome: false,
			didHydrateCliState: true,
			theme: undefined,
			mcpServers: [],
			filePaths: [],
			openedTabs: [],
			commands: [],
			organizationAllowList: { allowAll: true, providers: {} },
			organizationSettingsVersion: 0,
			cloudUserInfo: null,
			cloudIsAuthenticated: true,
			sharingEnabled: false,
			publicSharingEnabled: false,
			hasOpenedModeSelector: true,
			hasClosedCodeReviewWelcomeTips: true,
			reviewTask: EMPTY_REVIEW_TASK,
			setReviewTask: () => {},
			setDidHydrateSClitate: () => {},
			setHasOpenedModeSelector: () => {},
			alwaysAllowFollowupQuestions: false,
			setAlwaysAllowFollowupQuestions: () => {},
			followupAutoApproveTimeoutMs: 0,
			setFollowupAutoApproveTimeoutMs: () => {},
			profileThresholds: {},
			setProfileThresholds: () => {},
			setApiConfiguration: () => {},
			setCustomInstructions: () => {},
			setAlwaysAllowReadOnly: () => {},
			setAlwaysAllowReadOnlyOutsideWorkspace: () => {},
			setAlwaysAllowWrite: () => {},
			setAlwaysAllowWriteOutsideWorkspace: () => {},
			setAlwaysAllowExecute: () => {},
			setAlwaysAllowMcp: () => {},
			setAlwaysAllowModeSwitch: () => {},
			setAlwaysAllowSubtasks: () => {},
			setShowRooIgnoredFiles: () => {},
			setEnableSubfolderRules: () => {},
			setShowAnnouncement: () => {},
			setAllowedCommands: () => {},
			setDeniedCommands: () => {},
			setAllowedMaxRequests: () => {},
			setAllowedMaxCost: () => {},
			setSoundEnabled: () => {},
			setSoundVolume: () => {},
			setTerminalShellIntegrationTimeout: () => {},
			setTerminalShellIntegrationDisabled: () => {},
			setTerminalZdotdir: () => {},
			setTtsEnabled: () => {},
			setTtsSpeed: () => {},
			setEnableCheckpoints: () => {},
			setUseCostrictCustomConfig: () => {},
			checkpointTimeout: 0,
			setCheckpointTimeout: () => {},
			setWriteDelayMs: () => {},
			setTerminalOutputPreviewSize: () => {},
			mcpEnabled: false,
			setMcpEnabled: () => {},
			taskSyncEnabled: false,
			setTaskSyncEnabled: () => {},
			setCurrentApiConfigName: () => {},
			setListApiConfigMeta: () => {},
			mode,
			setMode,
			setCostrictCodeMode: () => {},
			setCustomModePrompts: () => {},
			setCustomSupportPrompts: () => {},
			enhancementApiConfigId: undefined,
			setEnhancementApiConfigId: () => {},
			setExperimentEnabled: () => {},
			setAutoApprovalEnabled: () => {},
			customModes: [] as ModeConfig[],
			setCustomModes: () => {},
			setMaxOpenTabsContext: () => {},
			maxWorkspaceFiles: 0,
			setMaxWorkspaceFiles: () => {},
			setTelemetrySetting: () => {},
			maxImageFileSize: 10,
			setMaxImageFileSize: () => {},
			maxTotalImageSize: 10,
			setMaxTotalImageSize: () => {},
			setPinnedApiConfigs: () => {},
			togglePinnedApiConfig: () => {},
			setHistoryPreviewCollapsed: () => {},
			setReasoningBlockCollapsed: () => {},
			setShowSpeedInfo: () => {},
			showSpeedInfo: false,
			setAutomaticallyFocus: () => {},
			automaticallyFocus: false,
			enterBehavior: "send",
			setEnterBehavior: () => {},
			autoCondenseContext: false,
			setAutoCondenseContext: () => {},
			autoCondenseContextPercent: 100,
			setAutoCondenseContextPercent: () => {},
			autoCleanup: undefined,
			setAutoCleanup: () => {},
			debug: false,
			setDebug: () => {},
			includeDiagnosticMessages: false,
			setIncludeDiagnosticMessages: () => {},
			maxDiagnosticMessages: 0,
			setMaxDiagnosticMessages: () => {},
			includeTaskHistoryInEnhance: false,
			setIncludeTaskHistoryInEnhance: () => {},
			includeCurrentTime: false,
			setIncludeCurrentTime: () => {},
			includeCurrentCost: false,
			setIncludeCurrentCost: () => {},
			noticesEnabled: false,
			setNoticesEnabled: () => {},
			showWorktreesInHomeScreen: false,
			setShowWorktreesInHomeScreen: () => {},
			apiConfiguration: { apiProvider: "costrict" } as ProviderSettings,
			customInstructions: "",
			alwaysAllowReadOnly: false,
			alwaysAllowReadOnlyOutsideWorkspace: false,
			alwaysAllowWrite: false,
			alwaysAllowWriteOutsideWorkspace: false,
			alwaysAllowExecute: false,
			alwaysAllowMcp: false,
			alwaysAllowModeSwitch: false,
			alwaysAllowSubtasks: false,
			showRooIgnoredFiles: false,
			enableSubfolderRules: false,
			showAnnouncement: false,
			allowedCommands: [],
			deniedCommands: [],
			allowedMaxRequests: undefined,
			allowedMaxCost: undefined,
			soundEnabled: false,
			soundVolume: 0,
			terminalShellIntegrationTimeout: 0,
			terminalShellIntegrationDisabled: true,
			terminalZdotdir: false,
			terminalZshOhMy: false,
			terminalZshP10k: false,
			ttsEnabled: false,
			ttsSpeed: 1,
			enableCheckpoints: false,
			useCostrictCustomConfig: false,
			writeDelayMs: 0,
			terminalOutputPreviewSize: "medium",
			currentApiConfigName: "cloud",
			listApiConfigMeta: [{ id: "cloud", name: "cloud", apiProvider: "costrict" }] as ProviderSettingsEntry[],
			costrictCodeMode: "vibe",
			customModePrompts: {},
			customSupportPrompts: {},
			experiments: {},
			experimentSettings: {},
			maxOpenTabsContext: 0,
			telemetrySetting: "unset",
			awsUsePromptCache: false,
			setAwsUsePromptCache: () => {},
			pinnedApiConfigs: {},
			machineId: undefined,
			clineMessages: [],
			clineMessagesSeq: 0,
			taskHistory: [],
			shouldShowAnnouncement: false,
			currentTaskItem: undefined,
			version: "cloud",
			uriScheme: "vscode",
			cwd: "",
			language: "zh-CN",
			renderContext: "editor",
			marketplaceEnabled: false,
			codebaseIndexEnabled: false,
			codebaseIndexConfig: undefined,
			searchMode: undefined,
			codeReviewEnabled: false,
			hasPersistentStorage: true,
		}),
		[mode],
	)

	return (
		<ExtensionStateContext.Provider value={contextValue}>
			<ChatTextArea
				ref={textAreaRef}
				inputValue={inputValue}
				setInputValue={setInputValue}
				sendingDisabled={sendingDisabled}
				selectApiConfigDisabled
				placeholderText={placeholderText}
				selectedImages={selectedImages}
				setSelectedImages={setSelectedImages}
				onSend={onSend}
				onSelectImages={() => {}}
				shouldDisableImages
				mode={mode}
				setMode={setMode}
				modeShortcutText=""
				hoverPreviewMap={new Map()}
				isStreaming={isStreaming}
			/>
		</ExtensionStateContext.Provider>
	)
}
