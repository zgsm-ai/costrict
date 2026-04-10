import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useDeepCompareEffect, useEvent } from "react-use"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import removeMd from "remove-markdown"
// import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
// import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import useSound from "use-sound"
import { LRUCache } from "lru-cache"
// import { useTranslation } from "react-i18next"
// import { Trans } from "react-i18next"

import { useDebounceEffect } from "@src/utils/useDebounceEffect"
import { appendImages } from "@src/utils/imageUtils"
import { getCostBreakdownIfNeeded } from "@src/utils/costFormatting"
import { batchConsecutive } from "@src/utils/batchConsecutive"

import type {
	ClineAsk,
	ClineSayTool,
	ClineMessage,
	ExtensionMessage,
	AudioType,
	MultipleChoiceResponse,
} from "@roo-code/types"
// import type { ClineAsk, ClineSayTool, ClineMessage, ExtensionMessage, AudioType } from "@roo-code/types"
import { isRetiredProvider } from "@roo-code/types"

import { findLast } from "@roo/array"
import { SuggestionItem } from "@roo-code/types"
import { combineApiRequests } from "@roo/combineApiRequests"
import { combineCommandSequences } from "@roo/combineCommandSequences"
import { getApiMetrics } from "@roo/getApiMetrics"
import { getAllModes } from "@roo/modes"
import { ProfileValidator } from "@roo/ProfileValidator"
import { getLatestTodo } from "@roo/todo"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"
import RooHero from "@src/components/welcome/RooHero"
import RooTips from "@src/components/welcome/RooTips"
import { StandardTooltip, Button } from "@src/components/ui"
// import { CloudUpsellDialog } from "@src/components/cloud/CloudUpsellDialog"

// import TelemetryBanner from "../common/TelemetryBanner"
import NoticesBanner from "../common/NoticesBanner"
import VersionIndicator from "../common/VersionIndicator"
import HistoryPreview from "../history/HistoryPreview"
import type { SearchResult } from "./hooks/useChatSearch"
import { useChatSearch } from "./hooks/useChatSearch"
// import Announcement from "./Announcement"
import ChatRow from "./ChatRow"
import WarningRow from "./WarningRow"
import { ChatTextArea } from "./ChatTextArea"
// import { markdownExpandingRef } from "./Markdown"
import TaskHeader from "./TaskHeader"
import ProfileViolationWarning from "./ProfileViolationWarning"
import { CheckpointWarning } from "./CheckpointWarning"
import { QueuedMessages } from "./QueuedMessages"
import ChatSearch from "./ChatSearch"
// import DismissibleUpsell from "../common/DismissibleUpsell"
// import { useCloudUpsell } from "@src/hooks/useCloudUpsell"
// import { Cloud } from "lucide-react"
// import CloudAgents from "../cloud/CloudAgents"
import { WorktreeSelector } from "./WorktreeSelector"
import FileChangesPanel from "./FileChangesPanel"
import { useScrollLifecycle } from "@src/hooks/useScrollLifecycle"

export interface ChatViewProps {
	isHidden: boolean
	showAnnouncement: boolean
	hideAnnouncement: () => void
}

export interface ChatViewRef {
	acceptInput: () => void
}

export const MAX_IMAGES_PER_MESSAGE = 20 // This is the Anthropic limit.

// Button text keys - store translation keys instead of translated values
// This ensures React Compiler doesn't cache stale translations
type PrimaryButtonKey =
	| "chat:retry.title"
	| "chat:proceedAnyways.title"
	| "chat:save.title"
	| "chat:completeSubtaskAndReturn"
	| "chat:read-batch.approve.title"
	| "chat:approve.title"
	| "chat:runCommand.title"
	| "chat:proceedWhileRunning.title"
	| "chat:startNewTask.title"
	| "chat:resumeTask.title"
	| "chat:edit-batch.approve.title"
	| "chat:list-batch.approve.title"

type SecondaryButtonKey =
	| "chat:startNewTask.title"
	| "chat:reject.title"
	| "chat:read-batch.deny.title"
	| "chat:terminate.title"
	| "chat:killCommand.title"
	| "chat:edit-batch.deny.title"
	| "chat:list-batch.deny.title"

// Map primary button keys to their tooltip keys
const primaryButtonTooltipMap: Record<PrimaryButtonKey, string | undefined> = {
	"chat:retry.title": "chat:retry.tooltip",
	"chat:proceedAnyways.title": "chat:proceedAnyways.tooltip",
	"chat:save.title": "chat:save.tooltip",
	"chat:completeSubtaskAndReturn": undefined,
	"chat:read-batch.approve.title": undefined,
	"chat:approve.title": "chat:approve.tooltip",
	"chat:runCommand.title": "chat:runCommand.tooltip",
	"chat:proceedWhileRunning.title": "chat:proceedWhileRunning.tooltip",
	"chat:startNewTask.title": "chat:startNewTask.tooltip",
	"chat:resumeTask.title": "chat:resumeTask.tooltip",
	"chat:edit-batch.approve.title": undefined,
	"chat:list-batch.approve.title": undefined,
}

// Map secondary button keys to their tooltip keys
const secondaryButtonTooltipMap: Record<SecondaryButtonKey, string | undefined> = {
	"chat:startNewTask.title": "chat:startNewTask.tooltip",
	"chat:reject.title": "chat:reject.tooltip",
	"chat:read-batch.deny.title": undefined,
	"chat:terminate.title": "chat:terminate.tooltip",
	"chat:killCommand.title": "chat:killCommand.tooltip",
	"chat:edit-batch.deny.title": undefined,
	"chat:list-batch.deny.title": undefined,
}
const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0

const ChatViewComponent: React.ForwardRefRenderFunction<ChatViewRef, ChatViewProps> = (
	{ isHidden /* showAnnouncement, hideAnnouncement */ },
	ref,
) => {
	const [audioBaseUri] = useState(() => {
		return (window as unknown as { AUDIO_BASE_URI?: string }).AUDIO_BASE_URI || ""
	})

	const { t } = useAppTranslation()
	const modeShortcutText = `${isMac ? "⌘" : "Ctrl"} + . ${t("chat:forNextMode")}, ${isMac ? "⌘" : "Ctrl"} + Shift + . ${t("chat:forPreviousMode")}`

	const {
		clineMessages: messages,
		currentTaskItem,
		currentTaskTodos,
		taskHistory,
		cwd,
		apiConfiguration,
		organizationAllowList,
		mode,
		setMode,
		alwaysAllowModeSwitch,
		customModes,
		// telemetrySetting,
		// hasSystemPromptOverride,
		// telemetrySetting,
		soundEnabled,
		soundVolume,
		costrictCodeMode,
		// cloudIsAuthenticated,
		messageQueue = [],
		experiments,
		showWorktreesInHomeScreen,
		isStreaming = false,
		alwaysAllowExecute = false,
		autoApprovalEnabled,
	} = useExtensionState()

	// Show a WarningRow when the user sends a message with a retired provider.
	const [showRetiredProviderWarning, setShowRetiredProviderWarning] = useState(false)

	// When the provider changes, clear the retired-provider warning.
	const providerName = apiConfiguration?.apiProvider
	useEffect(() => {
		setShowRetiredProviderWarning(false)
	}, [providerName])

	const messagesRef = useRef(messages)

	useEffect(() => {
		messagesRef.current = messages
	}, [messages])

	// Leaving this less safe version here since if the first message is not a
	// task, then the extension is in a bad state and needs to be debugged (see
	// Cline.abort).
	const task = useMemo(() => messages.at(0), [messages])
	const curWorkspaceHistory = useMemo(
		() => (taskHistory || []).filter((t) => t.workspace === cwd),
		[cwd, taskHistory],
	)
	const latestTodos = useMemo(() => {
		// First check if we have initial todos from the state (for new subtasks)
		if (currentTaskTodos && currentTaskTodos.length > 0) {
			// Check if there are any todo updates in messages
			const messageBasedTodos = getLatestTodo(messages)
			// If there are message-based todos, they take precedence (user has updated them)
			if (messageBasedTodos && messageBasedTodos.length > 0) {
				return messageBasedTodos
			}
			// Otherwise use the initial todos from state
			return currentTaskTodos
		}
		// Fall back to extracting from messages
		return getLatestTodo(messages)
	}, [messages, currentTaskTodos])

	const modifiedMessages = useMemo(() => combineApiRequests(combineCommandSequences(messages.slice(1))), [messages])

	// Get search results from useChatSearch
	const { searchResults, searchQuery, setSearchQuery } = useChatSearch(messages)

	// Create a mapping from original message ts to modifiedMessages index

	// Has to be after api_req_finished are all reduced into api_req_started messages.
	const apiMetrics = useMemo(() => getApiMetrics(modifiedMessages), [modifiedMessages])

	const [inputValue, setInputValue] = useState("")
	const inputValueRef = useRef(inputValue)
	const textAreaRef = useRef<HTMLTextAreaElement>(null)
	const [sendingDisabled, setSendingDisabled] = useState(false)
	const [userFeedback, setUserFeedback] = useState("")
	const [selectedImages, setSelectedImages] = useState<string[]>([])

	// We need to hold on to the ask because useEffect > lastMessage will always
	// let us know when an ask comes in and handle it, but by the time
	// handleMessage is called, the last message might not be the ask anymore
	// (it could be a say that followed).
	const [clineAsk, setClineAsk] = useState<ClineAsk | undefined>(undefined)
	const [enableButtons, setEnableButtons] = useState<boolean>(false)
	const [primaryButtonTextKey, setPrimaryButtonText] = useState<PrimaryButtonKey | undefined>(undefined)
	const [secondaryButtonTextKey, setSecondaryButtonText] = useState<SecondaryButtonKey | undefined>(undefined)
	const [_didClickCancel, setDidClickCancel] = useState(false)
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})
	const prevExpandedRowsRef = useRef<Record<number, boolean>>()
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const lastTtsRef = useRef<string>("")
	const [wasStreaming, setWasStreaming] = useState<boolean>(false)
	const [checkpointWarning, setCheckpointWarning] = useState<
		{ type: "WAIT_TIMEOUT" | "INIT_TIMEOUT"; timeout: number } | undefined
	>(undefined)
	const [isCondensing, setIsCondensing] = useState<boolean>(false)
	// const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
	const [hoverPreviewMap, setHoverPreviewMap] = useState<Map<string, string>>(new Map())
	const [showSearch, setShowSearch] = useState(false)
	const everVisibleMessagesTsRef = useRef<LRUCache<number, boolean>>(
		new LRUCache({
			max: 100,
			ttl: 1000 * 60 * 5,
		}),
	)
	const [currentFollowUpTs, setCurrentFollowUpTs] = useState<number | null>(-1)
	//costrict: track multiple_choice independently so followup timestamps do not affect questionnaire answered state
	const [currentMultipleChoiceTs, setCurrentMultipleChoiceTs] = useState<number | null>(-1)
	const [aggregatedCostsMap, setAggregatedCostsMap] = useState<
		Map<
			string,
			{
				totalCost: number
				ownCost: number
				childrenCost: number
			}
		>
	>(new Map())

	// Compute translated button text and tooltips at render time
	// This ensures translations update correctly when language changes
	const primaryButtonText = primaryButtonTextKey ? t(primaryButtonTextKey) : undefined
	const secondaryButtonText = secondaryButtonTextKey ? t(secondaryButtonTextKey) : undefined
	const primaryButtonTooltip = primaryButtonTextKey
		? primaryButtonTooltipMap[primaryButtonTextKey]
			? t(primaryButtonTooltipMap[primaryButtonTextKey]!)
			: undefined
		: undefined
	const secondaryButtonTooltip = secondaryButtonTextKey
		? secondaryButtonTooltipMap[secondaryButtonTextKey]
			? t(secondaryButtonTooltipMap[secondaryButtonTextKey]!)
			: undefined
		: undefined

	const clineAskRef = useRef(clineAsk)
	useEffect(() => {
		clineAskRef.current = clineAsk
	}, [clineAsk])

	// const {
	// 	isOpen: isUpsellOpen,
	// 	openUpsell,
	// 	closeUpsell,
	// 	handleConnect,
	// } = useCloudUpsell({
	// 	autoOpenOnAuth: false,
	// })

	// Keep inputValueRef in sync with inputValue state
	useEffect(() => {
		inputValueRef.current = inputValue
	}, [inputValue])

	// Compute whether auto-approval is paused (user is typing in a followup)
	const isFollowUpAutoApprovalPaused = useMemo(() => {
		return !!(inputValue && inputValue?.trim().length > 0 && clineAsk === "followup")
	}, [inputValue, clineAsk])
	const isAutoCommandRuning = useMemo(
		// Include 'command_output' so the Stop button stays active while a command
		// is actively running and producing output (ask transitions from "command"
		// to "command_output" once execution begins).
		() => alwaysAllowExecute && autoApprovalEnabled && (clineAsk === "command" || clineAsk === "command_output"),
		[alwaysAllowExecute, autoApprovalEnabled, clineAsk],
	)
	// Cancel auto-approval timeout when user starts typing
	useEffect(() => {
		// Only send cancel if there's actual input (user is typing)
		// and we have a pending follow-up question
		if (isFollowUpAutoApprovalPaused) {
			vscode.postMessage({ type: "cancelAutoApproval", values: { cancelType: "user_input" } })
		}
	}, [isFollowUpAutoApprovalPaused])

	const isProfileDisabled = useMemo(
		() => !!apiConfiguration && !ProfileValidator.isProfileAllowed(apiConfiguration, organizationAllowList),
		[apiConfiguration, organizationAllowList],
	)

	// UI layout depends on the last 2 messages (since it relies on the content
	// of these messages, we are deep comparing) i.e. the button state after
	// hitting button sets enableButtons to false,  and this effect otherwise
	// would have to true again even if messages didn't change.
	const lastMessage = useMemo(() => messages.at(-1), [messages])
	const secondLastMessage = useMemo(() => messages.at(-2), [messages])

	const volume = typeof soundVolume === "number" ? soundVolume : 0.5
	const [playNotification] = useSound(`${audioBaseUri}/notification.wav`, { volume, soundEnabled, interrupt: true })
	const [playCelebration] = useSound(`${audioBaseUri}/celebration.wav`, { volume, soundEnabled, interrupt: true })
	const [playProgressLoop] = useSound(`${audioBaseUri}/progress_loop.wav`, { volume, soundEnabled, interrupt: true })

	const lastPlayedRef = useRef<Record<string, number>>({})

	const playSound = useCallback(
		(audioType: AudioType) => {
			if (!soundEnabled) {
				return
			}

			const now = Date.now()
			const lastPlayed = lastPlayedRef.current[audioType] ?? 0
			if (now - lastPlayed < 100) {
				return
			} // debounce: skip if played within 100ms
			lastPlayedRef.current[audioType] = now

			switch (audioType) {
				case "notification":
					playNotification()
					break
				case "celebration":
					playCelebration()
					break
				case "progress_loop":
					playProgressLoop()
					break
				default:
					console.warn(`Unknown audio type: ${audioType}`)
			}
		},
		[soundEnabled, playNotification, playCelebration, playProgressLoop],
	)

	function playTts(text: string) {
		vscode.postMessage({ type: "playTts", text })
	}

	useDeepCompareEffect(() => {
		// if last message is an ask, show user ask UI
		// if user finished a task, then start a new task with a new conversation history since in this moment that the extension is waiting for user response, the user could close the extension and the conversation history would be lost.
		// basically as long as a task is active, the conversation history will be persisted
		if (lastMessage) {
			switch (lastMessage.type) {
				case "ask":
					// Reset user response flag when a new ask arrives to allow auto-approval
					const isPartial = lastMessage.partial === true
					switch (lastMessage.ask) {
						case "api_req_failed":
							playSound("progress_loop")
							setSendingDisabled(true)
							setClineAsk("api_req_failed")
							setEnableButtons(true)
							setPrimaryButtonText("chat:retry.title")
							setSecondaryButtonText("chat:startNewTask.title")
							break
						case "mistake_limit_reached":
							playSound("progress_loop")
							setSendingDisabled(false)
							setClineAsk("mistake_limit_reached")
							setEnableButtons(true)
							setPrimaryButtonText("chat:proceedAnyways.title")
							setSecondaryButtonText("chat:startNewTask.title")
							break
						case "followup":
							setSendingDisabled(isPartial)
							setClineAsk("followup")
							// setting enable buttons to `false` would trigger a focus grab when
							// the text area is enabled which is undesirable.
							// We have no buttons for this tool, so no problem having them "enabled"
							// to workaround this issue.  See #1358.
							setEnableButtons(true)
							setPrimaryButtonText(undefined)
							setSecondaryButtonText(undefined)
							break
						// Costrict: ask_multiple_choice tool
						case "multiple_choice":
							setSendingDisabled(isPartial)
							setClineAsk("multiple_choice")
							setEnableButtons(true)
							setPrimaryButtonText(undefined)
							setSecondaryButtonText(undefined)
							break
						case "tool":
							setSendingDisabled(isPartial)
							setClineAsk("tool")
							setEnableButtons(!isPartial)
							const tool = JSON.parse(lastMessage.text || "{}") as ClineSayTool
							switch (tool.tool) {
								case "editedExistingFile":
								case "appliedDiff":
								case "newFileCreated":
									if (tool.batchDiffs && Array.isArray(tool.batchDiffs)) {
										setPrimaryButtonText("chat:edit-batch.approve.title")
										setSecondaryButtonText("chat:edit-batch.deny.title")
									} else {
										setPrimaryButtonText("chat:save.title")
										setSecondaryButtonText("chat:reject.title")
									}
									break
								case "generateImage":
									setPrimaryButtonText("chat:save.title")
									setSecondaryButtonText("chat:reject.title")
									setUserFeedback(t("chat:reject.askNextStep", { action: t("chat:save.title") }))
									break
								case "finishTask":
									setPrimaryButtonText("chat:completeSubtaskAndReturn")
									setSecondaryButtonText(undefined)
									break
								case "readFile":
									if (tool.batchFiles && Array.isArray(tool.batchFiles)) {
										setPrimaryButtonText("chat:read-batch.approve.title")
										setSecondaryButtonText("chat:read-batch.deny.title")
									} else {
										setPrimaryButtonText("chat:approve.title")
										setSecondaryButtonText("chat:reject.title")
									}
									break
								case "listFilesTopLevel":
								case "listFilesRecursive":
									if (tool.batchDirs && Array.isArray(tool.batchDirs)) {
										setPrimaryButtonText("chat:list-batch.approve.title")
										setSecondaryButtonText("chat:list-batch.deny.title")
									} else {
										setPrimaryButtonText("chat:approve.title")
										setSecondaryButtonText("chat:reject.title")
									}
									break
								default:
									setPrimaryButtonText("chat:approve.title")
									setSecondaryButtonText("chat:reject.title")
									break
							}
							break
						case "command":
							setSendingDisabled(isPartial)
							setClineAsk("command")
							setEnableButtons(!isPartial)
							setPrimaryButtonText("chat:runCommand.title")
							setSecondaryButtonText("chat:reject.title")
							setUserFeedback(t("chat:reject.askNextStep", { action: t("chat:runCommand.title") }))
							break
						case "command_output":
							setSendingDisabled(false)
							setClineAsk("command_output")
							setEnableButtons(true)
							setPrimaryButtonText("chat:proceedWhileRunning.title")
							setSecondaryButtonText("chat:killCommand.title")
							break
						case "use_mcp_server":
							setSendingDisabled(isPartial)
							setClineAsk("use_mcp_server")
							setEnableButtons(!isPartial)
							setPrimaryButtonText("chat:approve.title")
							setSecondaryButtonText("chat:reject.title")
							break
						case "completion_result":
							// Extension waiting for feedback, but we can just present a new task button.
							// Only play celebration sound if there are no queued messages.
							if (!isPartial && messageQueue.length === 0) {
								playSound("celebration")
							}
							setSendingDisabled(isPartial)
							setClineAsk("completion_result")
							setEnableButtons(!isPartial)
							setPrimaryButtonText("chat:startNewTask.title")
							setSecondaryButtonText(undefined)
							break
						case "resume_task":
							setSendingDisabled(false)
							setClineAsk("resume_task")
							setEnableButtons(true)
							// For completed subtasks, show "Start New Task" instead of "Resume"
							// A subtask is considered completed if:
							// - It has a parentTaskId AND
							// - Its messages contain a completion_result (either ask or say)
							const isCompletedSubtask =
								currentTaskItem?.parentTaskId &&
								messages.some(
									(msg) => msg.ask === "completion_result" || msg.say === "completion_result",
								)
							if (isCompletedSubtask) {
								setPrimaryButtonText("chat:startNewTask.title")
								setSecondaryButtonText(undefined)
							} else {
								setPrimaryButtonText("chat:resumeTask.title")
								setSecondaryButtonText("chat:terminate.title")
							}
							setDidClickCancel(false) // special case where we reset the cancel button state
							break
						case "resume_completed_task":
							setSendingDisabled(false)
							setClineAsk("resume_completed_task")
							setEnableButtons(true)
							setPrimaryButtonText("chat:startNewTask.title")
							setSecondaryButtonText(undefined)
							setDidClickCancel(false)
							break
					}
					break
				case "say":
					// Don't want to reset since there could be a "say" after
					// an "ask" while ask is waiting for response.
					switch (lastMessage.say) {
						case "api_req_retry_delayed":
						case "api_req_rate_limit_wait":
							setSendingDisabled(true)
							setEnableButtons(false)
							break
						case "api_req_started":
							// Clear button state when a new API request starts
							// This fixes buttons persisting when the task continues
							setSendingDisabled(true)
							// Note: Do NOT clear selectedImages here. This handler fires
							// every time the backend starts an API call, which would wipe
							// images the user has pasted while the chat is in progress.
							// Images are already cleared in the appropriate user-action
							// handlers (handleSendMessage, handlePrimaryButtonClick, etc.).
							setClineAsk(undefined)
							setEnableButtons(false)
							setPrimaryButtonText(undefined)
							setSecondaryButtonText(undefined)
							break
						case "api_req_finished":
						case "error":
						case "text":
						case "mcp_server_request_started":
						case "mcp_server_response":
						case "completion_result":
							break
						case "command_output":
							// say:command_output means the command is actively running and producing output.
							// Ensure buttons reflect the running state (Proceed/Kill) regardless of whether
							// ask:command_output or say:command_output arrived last, preventing a race condition
							// where a say message overwrites the correct button state set by ask:command_output.
							setSendingDisabled(false)
							setClineAsk("command_output")
							setEnableButtons(true)
							setPrimaryButtonText("chat:proceedWhileRunning.title")
							setSecondaryButtonText("chat:killCommand.title")
							break
					}
					break
			}
		}
	}, [lastMessage, secondLastMessage])

	// Update button text when messages change (e.g., completion_result is added) for subtasks in resume_task state
	useEffect(() => {
		if (clineAsk === "resume_task" && currentTaskItem?.parentTaskId) {
			const hasCompletionResult = messages.some(
				(msg) => msg.ask === "completion_result" || msg.say === "completion_result",
			)
			if (hasCompletionResult) {
				setPrimaryButtonText("chat:startNewTask.title")
				setSecondaryButtonText(undefined)
			}
		}
	}, [clineAsk, currentTaskItem?.parentTaskId, messages, t])

	useEffect(() => {
		if (messages.length === 0) {
			setSendingDisabled(false)
			setClineAsk(undefined)
			setEnableButtons(false)
			setPrimaryButtonText(undefined)
			setSecondaryButtonText(undefined)
		}
	}, [messages.length])

	// Reset UI states when task changes. Scroll lifecycle is handled by
	// useScrollLifecycle which has its own effect keyed on taskTs.
	useEffect(() => {
		setExpandedRows({})
		everVisibleMessagesTsRef.current.clear()
		setCurrentFollowUpTs(null)
		//costrict: reset the per-questionnaire answered watermark when switching tasks
		setCurrentMultipleChoiceTs(null)
		setIsCondensing(false)
	}, [task?.ts])

	const taskTs = task?.ts

	// Request aggregated costs when task changes and has childIds
	useEffect(() => {
		if (taskTs && currentTaskItem?.childIds && currentTaskItem.childIds.length > 0) {
			vscode.postMessage({
				type: "getTaskWithAggregatedCosts",
				text: currentTaskItem.id,
			})
		}
	}, [taskTs, currentTaskItem?.id, currentTaskItem?.childIds])

	useEffect(() => {
		if (isHidden) {
			everVisibleMessagesTsRef.current.clear()
		}
	}, [isHidden])

	useEffect(() => {
		const cache = everVisibleMessagesTsRef.current
		return () => {
			cache.clear()
		}
	}, [])

	const markFollowUpAsAnswered = useCallback(() => {
		//costrict: only advance the followup watermark from followup asks
		const lastFollowUpMessage = messagesRef.current.findLast((msg: ClineMessage) => msg.ask === "followup")
		if (lastFollowUpMessage) {
			setCurrentFollowUpTs(lastFollowUpMessage.ts)
		}
	}, [])

	const markMultipleChoiceAsAnswered = useCallback(() => {
		//costrict: keep multiple_choice answered state isolated from followup asks
		const lastMultipleChoiceMessage = messagesRef.current.findLast(
			(msg: ClineMessage) => msg.ask === "multiple_choice",
		)
		if (lastMultipleChoiceMessage) {
			setCurrentMultipleChoiceTs(lastMultipleChoiceMessage.ts)
		}
	}, [])

	const handleChatReset = useCallback(() => {
		// Only reset message-specific state, preserving mode.
		setInputValue("")
		setSendingDisabled(true)
		setSelectedImages([])
		setClineAsk(undefined)
		setEnableButtons(false)
		// Do not reset mode here as it should persist.
		// setPrimaryButtonText(undefined)
		// setSecondaryButtonText(undefined)
	}, [])

	/**
	 * Handles sending messages to the extension
	 * @param text - The message text to send
	 * @param images - Array of image data URLs to send with the message
	 */
	const handleSendMessage = useCallback(
		(text: string, images: string[], chatType = "system") => {
			text = text?.trim()

			if (text || images.length > 0) {
				// Intercept when the active provider is retired — show a
				// WarningRow instead of sending anything to the backend.
				if (apiConfiguration?.apiProvider && isRetiredProvider(apiConfiguration.apiProvider)) {
					setShowRetiredProviderWarning(true)
					return
				}

				// Queue message if:
				// - Task is busy (sendingDisabled)
				// - API request in progress (isStreaming)
				// - Queue has items (preserve message order during drain)
				// - Command is running (command_output) - user's message should be queued for AI, not sent to terminal
				if (
					sendingDisabled ||
					isStreaming ||
					messageQueue.length > 0 ||
					clineAskRef.current === "command_output"
				) {
					try {
						vscode.postMessage({ type: "queueMessage", text, images })
						setInputValue("")
						setSelectedImages([])
					} catch (error) {
						console.error(
							`Failed to queue message: ${error instanceof Error ? error.message : String(error)}`,
						)
					}

					return
				}

				// Mark that user has responded - this prevents any pending auto-approvals.
				if (messagesRef.current.length === 0) {
					vscode.postMessage({ type: "newTask", text, images, values: { chatType } })
				} else if (clineAskRef.current) {
					if (clineAskRef.current === "followup") {
						markFollowUpAsAnswered()
					}

					// Use clineAskRef.current
					switch (
						clineAskRef.current // Use clineAskRef.current
					) {
						case "command": // User can provide feedback to a tool or command use.
							if (isAutoCommandRuning) {
								setInputValue("")
								setSelectedImages([])
								setPrimaryButtonText(undefined)
								setSecondaryButtonText(undefined)
								vscode.postMessage({ type: "queueMessage", text, images })
							} else {
								vscode.postMessage({
									type: "askResponse",
									askResponse: "messageResponse",
									text,
									images,
								})
							}
							break
						case "followup":
						case "multiple_choice":
						case "tool":
						case "use_mcp_server":
						case "completion_result": // If this happens then the user has feedback for the completion result.
						case "resume_task":
						case "resume_completed_task":
						case "mistake_limit_reached":
							vscode.postMessage({
								type: "askResponse",
								askResponse: "messageResponse",
								text,
								images,
							})
							break
						// There is no other case that a textfield should be enabled.
					}
				} else {
					// This is a new message in an ongoing task.
					vscode.postMessage({ type: "askResponse", askResponse: "messageResponse", text, images })
				}

				handleChatReset()
			}
		},
		[
			apiConfiguration.apiProvider,
			sendingDisabled,
			isStreaming,
			messageQueue.length,
			handleChatReset,
			markFollowUpAsAnswered,
			isAutoCommandRuning,
		], // messagesRef and clineAskRef are stable
	)

	const handleSetChatBoxMessage = useCallback(
		(text: string, images: string[], selectText: string = "") => {
			// Avoid nested template literals by breaking down the logic
			let newValue = text

			if (inputValue !== "") {
				newValue = `${inputValue}${inputValue.endsWith(" ") ? "" : " "}${text}`
			}
			setInputValue(newValue)
			setSelectedImages([...selectedImages, ...images])

			const filePathMatch = text.match(/\b[\w/\\.-]+:\d+-\d+\b/)
			if (filePathMatch) {
				setHoverPreviewMap((prev) => new Map(prev.set(filePathMatch[0], selectText)))
			}
			textAreaRef.current?.focus()
		},
		[inputValue, selectedImages],
	)

	const handeSetChatBoxMessageByContext = useCallback(
		(text: string, images: string[]) => {
			let newValue = text

			if (inputValue !== "") {
				newValue = inputValue + text
			}

			setInputValue(newValue)
			setSelectedImages([...selectedImages, ...images])
		},
		[inputValue, selectedImages],
	)

	const startNewTask = useCallback(() => {
		setShowRetiredProviderWarning(false)
		vscode.postMessage({ type: "clearTask" })
	}, [])

	// Handle stop button click from textarea
	const handleStopTask = useCallback(() => {
		vscode.postMessage({ type: "cancelTask" })
		setDidClickCancel(true)
		setTimeout(() => {
			if (!isStreaming) return

			vscode.postMessage({ type: "cancelTask" })
			setDidClickCancel(true)
		}, 150)
	}, [setDidClickCancel, isStreaming])

	// Handle enqueue button click from textarea
	const handleEnqueueCurrentMessage = useCallback(() => {
		const text = inputValue?.trim()
		if (text || selectedImages.length > 0) {
			vscode.postMessage({
				type: "queueMessage",
				text,
				images: selectedImages,
			})
			setInputValue("")
			setSelectedImages([])
		}
	}, [inputValue, selectedImages])

	// This logic depends on the useEffect[messages] above to set clineAsk,
	// after which buttons are shown and we then send an askResponse to the
	// extension.
	const handlePrimaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			// Mark that user has responded

			const trimmedInput = text?.trim()

			switch (clineAsk) {
				case "api_req_failed":
				case "command":
				case "tool":
				case "use_mcp_server":
				case "mistake_limit_reached":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "yesButtonClicked",
							text: trimmedInput,
							images: images,
						})
						// Clear input state after sending
						setInputValue("")
						setSelectedImages([])
					} else {
						vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })
					}
					break
				case "resume_task":
					markFollowUpAsAnswered()
					// For completed subtasks (tasks with a parentTaskId and a completion_result),
					// start a new task instead of resuming since the subtask is done
					const isCompletedSubtaskForClick =
						currentTaskItem?.parentTaskId &&
						messagesRef.current.some(
							(msg) => msg.ask === "completion_result" || msg.say === "completion_result",
						)
					if (isCompletedSubtaskForClick) {
						startNewTask()
					} else {
						// // Only send text/images if they exist
						// if (trimmedInput || (images && images.length > 0)) {
						// 	vscode.postMessage({
						// 		type: "askResponse",
						// 		askResponse: "yesButtonClicked",
						// 		text: trimmedInput,
						// 		images: images,
						// 	})
						// 	// Clear input state after sending
						// 	setInputValue("")
						// 	setSelectedImages([])
						// } else {
						// 	vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })
						// }
						vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })
					}
					break
				case "completion_result":
				case "resume_completed_task":
					// Waiting for feedback, but we can just present a new task button
					startNewTask()
					break
				case "command_output":
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "continue" })
					break
			}

			setSendingDisabled(true)
			setClineAsk(undefined)
			setEnableButtons(false)
			setPrimaryButtonText(undefined)
			setSecondaryButtonText(undefined)
		},
		[clineAsk, currentTaskItem?.parentTaskId, markFollowUpAsAnswered, startNewTask],
	)

	const handleSecondaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			// Mark that user has responded

			const trimmedInput = text?.trim()

			if (isStreaming) {
				vscode.postMessage({ type: "cancelTask" })
				setDidClickCancel(true)
				return
			}

			switch (clineAsk) {
				case "api_req_failed":
				case "mistake_limit_reached":
				case "resume_task":
					startNewTask()
					break
				case "command":
				case "tool":
				case "use_mcp_server":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "noButtonClicked",
							text: trimmedInput,
							images: images,
						})
						// Clear input state after sending
						setInputValue("")
						setSelectedImages([])
					} else {
						if (["tool", "command"].includes(clineAsk) && userFeedback) {
							vscode.postMessage({
								type: "askResponse",
								askResponse: "noButtonClicked",
								text: userFeedback,
							})
							setUserFeedback("")
						} else {
							// Responds to the API with a "This operation failed" and lets it try again
							vscode.postMessage({ type: "askResponse", askResponse: "noButtonClicked" })
						}
					}
					break
				case "command_output":
					// Do NOT optimistically clear UI state here. If we clear clineAsk/enableButtons
					// before the backend confirms the abort and pushes a new state, the UI will
					// freeze permanently (no button, no input). Let the backend drive the transition.
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
					return
			}
			setSendingDisabled(true)
			setClineAsk(undefined)
			setEnableButtons(false)
		},
		[isStreaming, clineAsk, startNewTask, userFeedback],
	)
	const { info: model } = useSelectedModel(apiConfiguration)

	const selectImages = useCallback(() => vscode.postMessage({ type: "selectImages" }), [])

	const shouldDisableImages = !model?.supportsImages || selectedImages.length >= MAX_IMAGES_PER_MESSAGE

	const handleMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			switch (message.type) {
				case "action":
					switch (message.action!) {
						case "didBecomeVisible":
							if (!isHidden && !sendingDisabled && !enableButtons) {
								textAreaRef.current?.focus()
							}
							break
						case "focusInput":
							textAreaRef.current?.focus()
							break
					}
					break
				case "selectedImages":
					// Only handle selectedImages if it's not for editing context
					// When context is "edit", ChatRow will handle the images
					if (message.context !== "edit") {
						setSelectedImages((prevImages: string[]) =>
							appendImages(prevImages, message.images, MAX_IMAGES_PER_MESSAGE),
						)
					}
					break
				case "invoke":
					switch (message.invoke!) {
						case "newChat":
							handleChatReset()
							break
						case "sendMessage":
							handleSendMessage(message.text ?? "", message.images ?? [], "user")
							break
						case "setChatBoxMessage":
							handleSetChatBoxMessage(message.text ?? "", message.images ?? [], message.selectText ?? "")
							break
						case "primaryButtonClick":
							handlePrimaryButtonClick(message.text ?? "", message.images ?? [])
							break
						case "secondaryButtonClick":
							handleSecondaryButtonClick(message.text ?? "", message.images ?? [])
							break
						case "setChatBoxMessageByContext":
							handeSetChatBoxMessageByContext(message.text ?? "", message.images ?? [])
					}
					break
				case "condenseTaskContextStarted":
					// Handle both manual and automatic condensation start
					// We don't check the task ID because:
					// 1. There can only be one active task at a time
					// 2. Task switching resets isCondensing to false (see useEffect with task?.ts dependency)
					// 3. For new tasks, currentTaskItem may not be populated yet due to async state updates
					if (message.text) {
						setIsCondensing(true)
						// Note: sendingDisabled is only set for manual condensation via handleCondenseContext
						// Automatic condensation doesn't disable sending since the task is already running
					}
					break
				case "condenseTaskContextResponse":
					// Same reasoning as above - we trust this is for the current task
					if (message.text) {
						if (isCondensing && sendingDisabled) {
							setSendingDisabled(false)
						}
						setIsCondensing(false)
					}
					break
				case "checkpointInitWarning":
					setCheckpointWarning(message.checkpointWarning)
					break
				case "interactionRequired":
					playSound("notification")
					break
				case "taskWithAggregatedCosts":
					if (message.text && message.aggregatedCosts) {
						setAggregatedCostsMap((prev) => {
							const newMap = new Map(prev)
							newMap.set(message.text!, message.aggregatedCosts!)
							return newMap
						})
					}
					break
			}
			// textAreaRef.current is not explicitly required here since React
			// guarantees that ref will be stable across re-renders, and we're
			// not using its value but its reference.
		},
		[
			isHidden,
			sendingDisabled,
			enableButtons,
			handleChatReset,
			handleSendMessage,
			handleSetChatBoxMessage,
			handlePrimaryButtonClick,
			handleSecondaryButtonClick,
			handeSetChatBoxMessageByContext,
			isCondensing,
			setCheckpointWarning,
			playSound,
		],
	)

	useEvent("message", handleMessage)

	const visibleMessages = useMemo(() => {
		// Pre-compute checkpoint hashes that have associated user messages for O(1) lookup
		const userMessageCheckpointHashes = new Set<string>()
		modifiedMessages.forEach((msg) => {
			if (
				msg.say === "user_feedback" &&
				msg.checkpoint &&
				msg.checkpoint["type"] === "user_message" &&
				msg.checkpoint["hash"]
			) {
				userMessageCheckpointHashes.add(msg.checkpoint["hash"] as string)
			}
		})

		// Remove the 500-message limit to prevent array index shifting
		// Virtuoso is designed to efficiently handle large lists through virtualization
		const newVisibleMessages = modifiedMessages.filter((message) => {
			//costrict: hide stale multiple_choice loading placeholders once a later message supersedes them
			if (
				message.ask === "multiple_choice" &&
				message.partial === true &&
				modifiedMessages.at(-1)?.ts !== message.ts
			) {
				return false
			}

			// Filter out checkpoint_saved messages that should be suppressed
			if (message.say === "checkpoint_saved") {
				// Check if this checkpoint has the suppressMessage flag set
				if (
					message.checkpoint &&
					typeof message.checkpoint === "object" &&
					"suppressMessage" in message.checkpoint &&
					message.checkpoint.suppressMessage
				) {
					return false
				}
				// Also filter out checkpoint messages associated with user messages (legacy behavior)
				if (message.text && userMessageCheckpointHashes.has(message.text)) {
					return false
				}
			}

			if (everVisibleMessagesTsRef.current.has(message.ts)) {
				const alwaysHiddenOnceProcessedAsk: ClineAsk[] = [
					"api_req_failed",
					"resume_task",
					"resume_completed_task",
				]
				const alwaysHiddenOnceProcessedSay = [
					"api_req_finished",
					"api_req_retried",
					"api_req_deleted",
					"mcp_server_request_started",
				]
				if (message.ask && alwaysHiddenOnceProcessedAsk.includes(message.ask)) return false
				if (message.say && alwaysHiddenOnceProcessedSay.includes(message.say)) return false
				if (message.say === "text" && (message.text ?? "") === "" && (message.images?.length ?? 0) === 0) {
					return false
				}
				return true
			}

			switch (message.ask) {
				case "completion_result":
					if (message.text === "") return false
					break
				case "api_req_failed":
				case "resume_task":
				case "resume_completed_task":
					return false
			}
			switch (message.say) {
				case "api_req_finished":
				case "api_req_retried":
				case "api_req_deleted":
					return false
				case "api_req_retry_delayed":
				case "api_req_rate_limit_wait":
					const last1 = modifiedMessages.at(-1)
					const last2 = modifiedMessages.at(-2)
					if (last1?.ask === "resume_task" && last2 === message) {
						return true
					} else if (message !== last1) {
						return false
					}
					break
				case "text":
					if ((message.text ?? "") === "" && (message.images?.length ?? 0) === 0) return false
					break
				case "mcp_server_request_started":
					return false
			}
			return true
		})

		const viewportStart = Math.max(0, newVisibleMessages.length - 100)
		newVisibleMessages
			.slice(viewportStart)
			.forEach((msg: ClineMessage) => everVisibleMessagesTsRef.current.set(msg.ts, true))

		return newVisibleMessages
	}, [modifiedMessages])

	useEffect(() => {
		const cleanupInterval = setInterval(() => {
			const cache = everVisibleMessagesTsRef.current
			const currentMessageIds = new Set(modifiedMessages?.map((m: ClineMessage) => m.ts))
			const viewportMessages = visibleMessages.slice(Math.max(0, visibleMessages.length - 100))
			const viewportMessageIds = new Set(viewportMessages?.map((m: ClineMessage) => m.ts))

			cache.forEach((_value: boolean, key: number) => {
				if (!currentMessageIds.has(key) && !viewportMessageIds.has(key)) {
					cache.delete(key)
				}
			})
		}, 60000)

		return () => clearInterval(cleanupInterval)
	}, [modifiedMessages, visibleMessages])

	useDebounceEffect(
		() => {
			if (!isHidden && !sendingDisabled && !enableButtons) {
				textAreaRef.current?.focus()
			}
		},
		100,
		[isHidden, sendingDisabled, enableButtons],
	)

	useEffect(() => {
		// This ensures the first message is not read, future user messages are
		// labeled as `user_feedback`.
		if (lastMessage && messages.length > 1) {
			if (
				typeof lastMessage.text === "string" && // has text (must be string for startsWith)
				(lastMessage.say === "text" || lastMessage.say === "completion_result") && // is a text message
				!lastMessage.partial && // not a partial message
				!lastMessage.text.startsWith("{") // not a json object
			) {
				let text = lastMessage?.text || ""
				const mermaidRegex = /```mermaid[\s\S]*?```/g
				// remove mermaid diagrams from text
				text = text.replace(mermaidRegex, "")
				// remove markdown from text
				text = removeMd(text)

				// ensure message is not a duplicate of last read message
				if (text !== lastTtsRef.current) {
					try {
						playTts(text)
						lastTtsRef.current = text
					} catch (error) {
						console.error("Failed to execute text-to-speech:", error)
					}
				}
			}
		}

		// Update previous value.
		setWasStreaming(isStreaming)
	}, [isStreaming, lastMessage, wasStreaming, messages.length])

	const groupedMessages = useMemo(() => {
		// Only filter out the launch ask and result messages - browser actions appear in chat
		const filtered: ClineMessage[] = visibleMessages.filter((msg) => {
			// Filter additional message types for costrict provider
			if (apiConfiguration?.apiProvider === "costrict") {
				// Filter error messages
				if (msg.say === "error") return false

				// Filter rate limit retries
				if (msg?.metadata?.isRateLimitRetry) return false

				// Filter condense_context_error and shell_integration_warning
				if (["condense_context_error", "shell_integration_warning"].includes(msg.say!)) {
					return false
				}

				// Filter empty reasoning messages
				if (msg.type === "say" && msg.say === "reasoning") {
					const text = msg?.text?.trim()
					// Filter empty or placeholder reasoning messages
					if (!text) {
						return false
					}
				}
			}

			return true
		})

		// Helper to check if a message is a read_file ask that should be batched
		const isReadFileAsk = (msg: ClineMessage): boolean => {
			if (msg.type !== "ask" || msg.ask !== "tool") return false
			try {
				const tool = JSON.parse(msg.text || "{}")
				return tool.tool === "readFile" && !tool.batchFiles // Don't re-batch already batched
			} catch {
				return false
			}
		}

		// Helper to check if a message is a list_files ask that should be batched
		const isListFilesAsk = (msg: ClineMessage): boolean => {
			if (msg.type !== "ask" || msg.ask !== "tool") return false
			try {
				const tool = JSON.parse(msg.text || "{}")
				return (
					(tool.tool === "listFilesTopLevel" || tool.tool === "listFilesRecursive") && !tool.batchDirs // Don't re-batch already batched
				)
			} catch {
				return false
			}
		}

		// Set of tool names that represent file-editing operations
		const editFileTools = new Set([
			"editedExistingFile",
			"appliedDiff",
			"newFileCreated",
			"insertContent",
			"searchAndReplace",
		])

		// Helper to check if a message is a file-edit ask that should be batched
		const isEditFileAsk = (msg: ClineMessage): boolean => {
			if (msg.type !== "ask" || msg.ask !== "tool") return false
			try {
				const tool = JSON.parse(msg.text || "{}")
				return editFileTools.has(tool.tool) && !tool.batchDiffs // Don't re-batch already batched
			} catch {
				return false
			}
		}

		// Synthesize a batch of consecutive read_file asks into a single message
		const synthesizeReadFileBatch = (batch: ClineMessage[]): ClineMessage => {
			const batchFiles = batch.map((batchMsg) => {
				try {
					const tool = JSON.parse(batchMsg.text || "{}")
					return {
						path: tool.path || "",
						lineSnippet: tool.reason || "",
						isOutsideWorkspace: tool.isOutsideWorkspace || false,
						key: `${tool.path}${tool.reason ? ` (${tool.reason})` : ""}`,
						content: tool.content || "",
					}
				} catch {
					return { path: "", lineSnippet: "", key: "", content: "" }
				}
			})

			let firstTool
			try {
				firstTool = JSON.parse(batch[0].text || "{}")
			} catch {
				return batch[0]
			}
			return {
				...batch[0],
				text: JSON.stringify({ ...firstTool, batchFiles }),
			}
		}

		// Synthesize a batch of consecutive list_files asks into a single message
		const synthesizeListFilesBatch = (batch: ClineMessage[]): ClineMessage => {
			const batchDirs = batch.map((batchMsg) => {
				try {
					const tool = JSON.parse(batchMsg.text || "{}")
					return {
						path: tool.path || "",
						recursive: tool.tool === "listFilesRecursive",
						isOutsideWorkspace: tool.isOutsideWorkspace || false,
						key: tool.path || "",
					}
				} catch {
					return { path: "", recursive: false, key: "" }
				}
			})

			let firstTool
			try {
				firstTool = JSON.parse(batch[0].text || "{}")
			} catch {
				return batch[0]
			}
			return {
				...batch[0],
				text: JSON.stringify({ ...firstTool, batchDirs }),
			}
		}

		// Synthesize a batch of consecutive file-edit asks into a single message
		const synthesizeEditFileBatch = (batch: ClineMessage[]): ClineMessage => {
			const batchDiffs = batch.map((batchMsg) => {
				try {
					const tool = JSON.parse(batchMsg.text || "{}")
					return {
						path: tool.path || "",
						changeCount: 1,
						key: tool.path || "",
						content: tool.content || tool.diff || "",
						diffStats: tool.diffStats,
					}
				} catch {
					return { path: "", changeCount: 0, key: "", content: "" }
				}
			})

			let firstTool
			try {
				firstTool = JSON.parse(batch[0].text || "{}")
			} catch {
				return batch[0]
			}
			return {
				...batch[0],
				text: JSON.stringify({ ...firstTool, batchDiffs }),
			}
		}

		// Consolidate consecutive ask messages into batches
		const readFileBatched = batchConsecutive(filtered, isReadFileAsk, synthesizeReadFileBatch)
		const listFilesBatched = batchConsecutive(readFileBatched, isListFilesAsk, synthesizeListFilesBatch)
		const result = batchConsecutive(listFilesBatched, isEditFileAsk, synthesizeEditFileBatch)

		if (isCondensing) {
			result.push({
				type: "say",
				say: "condense_context",
				ts: Date.now(),
				partial: true,
			} as ClineMessage)
		}
		return result
	}, [apiConfiguration?.apiProvider, isCondensing, visibleMessages])

	// Scroll lifecycle is managed by a dedicated hook to keep ChatView focused
	// on message handling and UI orchestration.
	const {
		showScrollToBottom,
		handleRowHeightChange,
		handleScrollToBottomClick,
		enterUserBrowsingHistory,
		followOutputCallback,
		atBottomStateChangeCallback,
		scrollToBottomAuto,
		isAtBottomRef,
		scrollPhaseRef,
	} = useScrollLifecycle({
		virtuosoRef,
		scrollContainerRef,
		taskTs: task?.ts,
		isStreaming,
		isHidden,
		hasTask: !!task,
	})

	// Expanding a row indicates the user is browsing; disable sticky follow.
	// Placed after the hook call so enterUserBrowsingHistory is defined.
	useEffect(() => {
		const prev = prevExpandedRowsRef.current
		let wasAnyRowExpandedByUser = false
		if (prev) {
			for (const [tsKey, isExpanded] of Object.entries(expandedRows)) {
				const ts = Number(tsKey)
				if (isExpanded && !(prev[ts] ?? false)) {
					wasAnyRowExpandedByUser = true
					break
				}
			}
		}

		if (wasAnyRowExpandedByUser) {
			enterUserBrowsingHistory("row-expansion")
		}

		prevExpandedRowsRef.current = expandedRows
	}, [enterUserBrowsingHistory, expandedRows])

	const handleSetExpandedRow = useCallback(
		(ts: number, expand?: boolean) => {
			setExpandedRows((prev: Record<number, boolean>) => ({
				...prev,
				[ts]: expand === undefined ? !prev[ts] : expand,
			}))
		},
		[setExpandedRows], // setExpandedRows is stable
	)

	// Scroll to specified message
	const scrollToMessage = useCallback(
		(messageIndex?: number) => {
			if (messageIndex === undefined || messageIndex < 0 || messageIndex >= groupedMessages.length) return
			if (virtuosoRef.current && messageIndex >= 0 && messageIndex < groupedMessages.length && !isStreaming) {
				virtuosoRef.current.scrollToIndex({
					index: messageIndex,
					behavior: "smooth",
					align: "center",
				})
				// // Disable auto-scrolling because user is manually navigating
				// disableAutoScrollRef.current = true
			}
		},
		[groupedMessages.length, isStreaming],
	)

	// Scroll when user toggles certain rows.
	const toggleRowExpansion = useCallback(
		(ts: number) => {
			handleSetExpandedRow(ts)
			// The logic to set disableAutoScrollRef.current = true on expansion
			// is now handled by the useEffect hook that observes expandedRows.
		},
		[handleSetExpandedRow],
	)

	// Effect to clear checkpoint warning when messages appear or task changes
	useEffect(() => {
		if (isHidden || !task) {
			setCheckpointWarning(undefined)
		}
	}, [modifiedMessages.length, isStreaming, isHidden, task])

	const placeholderTip = `\n(${t("chat:addContext")}${shouldDisableImages ? `, ${t("chat:dragFiles")}` : `, ${t("chat:dragFilesImages")}`})`

	const placeholderText = `${task ? t("chat:typeMessage") : t("chat:typeTask")}${placeholderTip}`

	const switchToMode = useCallback(
		(modeSlug: string): void => {
			// Update local state and notify extension to sync mode change.
			setMode(modeSlug)

			// Send the mode switch message.
			vscode.postMessage({ type: "mode", text: modeSlug })
		},
		[setMode],
	)

	const handleMultipleChoiceSubmit = useCallback(
		(response: MultipleChoiceResponse) => {
			//costrict: optimistically mark the current questionnaire as answered in UI before backend persistence lands
			markMultipleChoiceAsAnswered()
			// 后端会在 handleWebviewAskResponse 中自动设置 isAnswered 和 userResponse
			// 不需要前端处理，避免重复和耦合
			//costrict: submit structured multiple choice answers through a dedicated response channel
			vscode.postMessage({
				type: "askResponse",
				askResponse: "multipleChoiceResponse",
				text: JSON.stringify(response),
			})

			setSendingDisabled(true)
			setClineAsk(undefined)
			setEnableButtons(false)
		},
		[markMultipleChoiceAsAnswered],
	)

	const handleSuggestionClickInRow = useCallback(
		(suggestion: SuggestionItem, event?: React.MouseEvent) => {
			// Mark that user has responded if this is a manual click (not auto-approval)

			// Mark the current follow-up question as answered when a suggestion is clicked
			if (clineAsk === "followup" && !event?.shiftKey) {
				markFollowUpAsAnswered()
			}

			// Check if we need to switch modes
			if (suggestion.mode) {
				// Only switch modes if it's a manual click (event exists) or auto-approval is allowed
				const isManualClick = !!event
				if (isManualClick || alwaysAllowModeSwitch) {
					// Switch mode without waiting
					switchToMode(suggestion.mode)
				}
			}

			if (event?.shiftKey) {
				// Always append to existing text, don't overwrite
				setInputValue((currentValue: string) => {
					return currentValue !== "" ? `${currentValue} \n${suggestion.answer}` : suggestion.answer
				})
			} else {
				// Don't clear the input value when sending a follow-up choice
				// The message should be sent but the text area should preserve what the user typed
				const preservedInput = inputValueRef.current
				handleSendMessage(suggestion.answer, [])
				// Restore the input value after sending
				setInputValue(preservedInput)
			}
		},
		[handleSendMessage, setInputValue, switchToMode, alwaysAllowModeSwitch, clineAsk, markFollowUpAsAnswered],
	)

	const handleBatchFileResponse = useCallback((response: { [key: string]: boolean }) => {
		// Handle batch file response, e.g., for file uploads
		vscode.postMessage({ type: "askResponse", askResponse: "objectResponse", text: JSON.stringify(response) })
	}, [])

	const shouldHighlight = useCallback(
		(messageOrGroup?: ClineMessage, searchResults: SearchResult[] = [], showSearch?: boolean) => {
			if (!searchQuery || !showSearch || !messageOrGroup || !searchResults || searchResults.length === 0) {
				return false
			}

			// Find if this message is in searchResults
			// const matchingResult = searchResults.find((result) => result.ts === messageOrGroup.ts)
			return searchResults.find((result) => result.ts === messageOrGroup.ts) !== undefined
		},
		[searchQuery],
	)
	// Cancel backend auto-approval timeout when FollowUpSuggest's countdown effect cleans up.
	// This is called when auto-approve is toggled off, a suggestion is clicked, or the component unmounts.
	const handleFollowUpUnmount = useCallback(() => {
		vscode.postMessage({ type: "cancelAutoApproval", values: { cancelType: "follow_up_unmount" } })
	}, [])
	//costrict: reuse the existing backend timeout cancellation path for multiple_choice countdown cleanup and manual interaction
	const handleMultipleChoiceUnmount = useCallback(() => {
		vscode.postMessage({ type: "cancelAutoApproval", values: { cancelType: "multiple_choice_unmount" } })
	}, [])

	const itemContent = useCallback(
		(index: number, messageOrGroup: ClineMessage) => {
			const hasCheckpoint = modifiedMessages.some((message) => message.say === "checkpoint_saved")

			// regular message
			return (
				<ChatRow
					key={messageOrGroup.ts}
					message={messageOrGroup}
					isExpanded={expandedRows[messageOrGroup.ts] || false}
					onToggleExpand={toggleRowExpansion} // This was already stabilized
					lastModifiedMessage={modifiedMessages.at(-1)} // Original direct access
					isLast={index === groupedMessages.length - 1} // Original direct access
					onHeightChange={handleRowHeightChange}
					isStreaming={isStreaming}
					onSuggestionClick={handleSuggestionClickInRow} // This was already stabilized
					onMultipleChoiceSubmit={handleMultipleChoiceSubmit}
					onBatchFileResponse={handleBatchFileResponse}
					onFollowUpUnmount={handleFollowUpUnmount}
					onMultipleChoiceUnmount={handleMultipleChoiceUnmount}
					isFollowUpAutoApprovalPaused={isFollowUpAutoApprovalPaused}
					isFollowUpAnswered={
						messageOrGroup.isAnswered === true || messageOrGroup.ts <= Number(currentFollowUpTs)
					}
					// Costrict: ask_multiple_choice answered
					isMultipleChoiceAnswered={
						//costrict: compare against the dedicated multiple_choice watermark instead of the followup one
						messageOrGroup.isAnswered === true || messageOrGroup.ts <= Number(currentMultipleChoiceTs)
					}
					editable={
						messageOrGroup.type === "ask" &&
						messageOrGroup.ask === "tool" &&
						(() => {
							let tool: any = {}
							try {
								tool = JSON.parse(messageOrGroup.text || "{}")
							} catch (_) {
								if (messageOrGroup.text?.includes("updateTodoList")) {
									tool = { tool: "updateTodoList" }
								}
							}
							return tool.tool === "updateTodoList" && enableButtons && !!primaryButtonText
						})()
					}
					shouldHighlight={shouldHighlight(messageOrGroup, searchResults, showSearch)}
					searchResults={searchResults}
					searchQuery={searchQuery}
					hasCheckpoint={hasCheckpoint}
				/>
			)
		},
		[
			modifiedMessages,
			expandedRows,
			toggleRowExpansion,
			groupedMessages.length,
			handleRowHeightChange,
			isStreaming,
			handleSuggestionClickInRow,
			handleMultipleChoiceSubmit,
			handleBatchFileResponse,
			handleFollowUpUnmount,
			handleMultipleChoiceUnmount,
			isFollowUpAutoApprovalPaused,
			currentFollowUpTs,
			currentMultipleChoiceTs,
			shouldHighlight,
			searchResults,
			showSearch,
			searchQuery,
			enableButtons,
			primaryButtonText,
		],
	)

	const allModes = useMemo(
		() =>
			getAllModes(customModes).filter((v) => {
				if (v.costrictCodeModeGroup) {
					if (v.costrictCodeModeGroup === "hide") return false
					if (!v.costrictCodeModeGroup?.split(",").includes(costrictCodeMode!)) return false
				}

				return true
			}),
		[customModes, costrictCodeMode],
	)

	// Function to handle mode switching
	const switchToNextMode = useCallback(() => {
		const currentModeIndex = allModes.findIndex((m) => m.slug === mode)
		const nextModeIndex = (currentModeIndex + 1) % allModes.length
		// Update local state and notify extension to sync mode change
		switchToMode(allModes[nextModeIndex].slug)
	}, [allModes, switchToMode, mode])

	// Function to handle switching to previous mode
	const switchToPreviousMode = useCallback(() => {
		const currentModeIndex = allModes.findIndex((m) => m.slug === mode)
		const previousModeIndex = (currentModeIndex - 1 + allModes.length) % allModes.length
		// Update local state and notify extension to sync mode change
		switchToMode(allModes[previousModeIndex].slug)
	}, [allModes, switchToMode, mode])

	// Mode switching keyboard handler. Scroll-intent keyboard detection
	// (PageUp, Home, ArrowUp) is handled by useScrollLifecycle.
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === ".") {
				event.preventDefault()
				if (event.shiftKey) {
					switchToPreviousMode()
				} else {
					switchToNextMode()
				}
			}

			// Check for Command/Ctrl + F for search - toggle functionality
			if ((event.metaKey || event.ctrlKey) && event.key === "f") {
				event.preventDefault() // Prevent default browser behavior
				event.stopPropagation() // Prevent event from bubbling to VSCode
				setShowSearch((prev) => !prev)
			}

			// Escape key to close search
			if (event.key === "Escape" && showSearch) {
				event.preventDefault()
				event.stopPropagation() // Prevent event from bubbling to VSCode
				setShowSearch(false)
				setSearchQuery("")
			}
		},
		[showSearch, switchToPreviousMode, switchToNextMode, setSearchQuery],
	)

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown)

		return () => {
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [handleKeyDown])

	useImperativeHandle(ref, () => ({
		acceptInput: () => {
			const hasInput = inputValue?.trim() || selectedImages?.length > 0

			// Special case: during command_output, queue the message instead of
			// triggering the primary button action (which would lose the message)
			if (clineAskRef.current === "command_output" && hasInput) {
				vscode.postMessage({ type: "queueMessage", text: inputValue.trim(), images: selectedImages })
				setInputValue("")
				setSelectedImages([])
				return
			}

			if (enableButtons && primaryButtonText) {
				handlePrimaryButtonClick(inputValue, selectedImages)
			} else if (!sendingDisabled && !isProfileDisabled && hasInput) {
				handleSendMessage(inputValue, selectedImages)
			}
		},
	}))

	const handleCondenseContext = (taskId: string) => {
		if (isCondensing || sendingDisabled) {
			return
		}
		setIsCondensing(true)
		setSendingDisabled(true)
		vscode.postMessage({ type: "condenseTaskContextRequest", text: taskId })
	}

	const areButtonsVisible = showScrollToBottom || primaryButtonText || secondaryButtonText
	const lastUserFeedback = findLast(groupedMessages, (msg) => msg.say === "user_feedback")
	return (
		<div
			data-testid="chat-view"
			className={isHidden ? "hidden" : "fixed top-8 left-0 right-0 bottom-0 flex flex-col overflow-hidden"}>
			{/* {(showAnnouncement || showAnnouncementModal) && (
				<Announcement
					hideAnnouncement={() => {
						if (showAnnouncementModal) {
							setShowAnnouncementModal(false)
						}
						if (showAnnouncement) {
							hideAnnouncement()
						}
					}}
				/>
			)} */}
			{task ? <></> : <NoticesBanner />}
			{task ? (
				<>
					<TaskHeader
						task={task}
						tokensIn={apiMetrics.totalTokensIn}
						tokensOut={apiMetrics.totalTokensOut}
						cacheWrites={apiMetrics.totalCacheWrites}
						cacheReads={apiMetrics.totalCacheReads}
						totalCost={apiMetrics.totalCost}
						aggregatedCost={
							currentTaskItem?.id && aggregatedCostsMap.has(currentTaskItem.id)
								? aggregatedCostsMap.get(currentTaskItem.id)!.totalCost
								: undefined
						}
						hasSubtasks={
							!!(
								currentTaskItem?.id &&
								aggregatedCostsMap.has(currentTaskItem.id) &&
								aggregatedCostsMap.get(currentTaskItem.id)!.childrenCost > 0
							)
						}
						parentTaskId={currentTaskItem?.parentTaskId}
						costBreakdown={
							currentTaskItem?.id && aggregatedCostsMap.has(currentTaskItem.id)
								? getCostBreakdownIfNeeded(aggregatedCostsMap.get(currentTaskItem.id)!, {
										own: t("common:costs.own"),
										subtasks: t("common:costs.subtasks"),
									})
								: undefined
						}
						contextTokens={apiMetrics.contextTokens}
						buttonsDisabled={sendingDisabled}
						handleCondenseContext={handleCondenseContext}
						todos={latestTodos}
						lastUserFeedbackIndex={groupedMessages.findIndex((msg) => msg.ts === lastUserFeedback?.ts)}
						lastUserFeedback={lastUserFeedback?.text || ""}
						isStreaming={isStreaming}
						scrollToMessage={scrollToMessage}
					/>

					{checkpointWarning && (
						<div className="px-3">
							<CheckpointWarning warning={checkpointWarning} />
						</div>
					)}
				</>
			) : (
				<div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 relative">
					<div
						className={` w-full flex flex-col gap-4 m-auto ${curWorkspaceHistory.length > 0 ? "mt-4" : ""} px-3.5 min-[370px]:px-10 pt-5 transition-all duration-300`}>
						{/* Version indicator in top-right corner - only on welcome screen */}
						{/* <VersionIndicator
							onClick={() => setShowAnnouncementModal(false)}
							className="absolute top-2 right-3 z-10"
						/> */}
						<VersionIndicator onClick={() => {}} className="fixed top-10 right-6 z-10" />

						<RooHero />
						{/* {telemetrySetting === "unset" && <TelemetryBanner />} */}

						{/* <div className="mb-2.5">
							{cloudIsAuthenticated || curWorkspaceHistory.length < 4 ? (
								<RooTips />
							) : (
								<>
									<DismissibleUpsell
										upsellId="taskList"
										icon={<Cloud className="size-4 mt-0.5 shrink-0" />}
										onClick={() => openUpsell()}
										dismissOnClick={false}
										className="bg-vscode-editor-background p-4 !text-base">
										<Trans
											i18nKey="cloud:upsell.taskList"
											components={{
												learnMoreLink: <VSCodeLink href="#" />,
											}}
										/>
									</DismissibleUpsell>
								</>
							)}
						</div> */}
						<div className="mb-2.5">
							<RooTips />
						</div>
						{/* Show the task history preview if expanded and tasks exist */}
						{curWorkspaceHistory.length > 0 && <HistoryPreview />}

						{/* {cloudIsAuthenticated ? (
							// Logged in users should always see their agents (or be upsold)
							<CloudAgents />
						) : (
							// Logged out users should be upsold at least once on Cloud
							<DismissibleUpsell
								upsellId="taskList2"
								icon={<Cloud className="size-5 shrink-0" />}
								onClick={() => openUpsell()}
								dismissOnClick={false}
								className="bg-none mt-6 border-border rounded-xl p-3 !text-base">
								<Trans
									i18nKey="cloud:upsell.taskList"
									components={{
										learnMoreLink: <VSCodeLink href="#" />,
									}}
								/>
							</DismissibleUpsell>
						)} */}
					</div>
				</div>
			)}

			{!task && showWorktreesInHomeScreen && <WorktreeSelector />}

			{task && (
				<>
					{showSearch && !isHidden && experiments?.chatSearch && (
						<ChatSearch
							showSearch={showSearch}
							messages={modifiedMessages}
							onNavigateToResult={scrollToMessage}
							onClose={() => {
								setSearchQuery("")
								setShowSearch(false)
							}}
							onSearchChange={(_, query) => setSearchQuery((query || "")?.trim())}
						/>
					)}
					<div className="grow flex" ref={scrollContainerRef}>
						<Virtuoso
							ref={virtuosoRef}
							key={task.ts}
							className="scrollable grow overflow-y-scroll mb-1"
							increaseViewportBy={{ top: 3_000, bottom: 1000 }}
							data={groupedMessages}
							itemContent={itemContent}
							followOutput={followOutputCallback}
							atBottomStateChange={atBottomStateChangeCallback}
							atBottomThreshold={10}
						/>
					</div>
					<FileChangesPanel clineMessages={messages} />
					{areButtonsVisible && (
						<div
							className={`flex h-9 items-center mb-1 px-[15px] ${
								showScrollToBottom ? "opacity-100" : enableButtons ? "opacity-100" : "opacity-50"
							}`}>
							{showScrollToBottom ? (
								<StandardTooltip content={t("chat:scrollToBottom")}>
									<Button
										variant="secondary"
										className="flex-[2]"
										onClick={handleScrollToBottomClick}>
										<span className="codicon codicon-chevron-down"></span>
									</Button>
								</StandardTooltip>
							) : (
								<>
									{primaryButtonText && (
										<StandardTooltip content={primaryButtonTooltip}>
											<Button
												variant="primary"
												disabled={!enableButtons}
												className={secondaryButtonText ? "flex-1 mr-[6px]" : "flex-[2] mr-0"}
												onClick={() => handlePrimaryButtonClick(inputValue, selectedImages)}>
												{primaryButtonText}
											</Button>
										</StandardTooltip>
									)}
									{secondaryButtonText && (
										<StandardTooltip content={secondaryButtonTooltip}>
											<Button
												variant="secondary"
												disabled={!enableButtons}
												className="flex-1 ml-[6px]"
												onClick={() => handleSecondaryButtonClick(inputValue, selectedImages)}>
												{secondaryButtonText}
											</Button>
										</StandardTooltip>
									)}
								</>
							)}
						</div>
					)}
				</>
			)}

			<QueuedMessages
				queue={messageQueue}
				onRemove={(index) => {
					if (messageQueue[index]) {
						vscode.postMessage({ type: "removeQueuedMessage", text: messageQueue[index].id })
					}
				}}
				onUpdate={(index, newText) => {
					if (messageQueue[index]) {
						vscode.postMessage({
							type: "editQueuedMessage",
							payload: { id: messageQueue[index].id, text: newText, images: messageQueue[index].images },
						})
					}
				}}
			/>
			{showRetiredProviderWarning && (
				<div className="px-[15px] py-1">
					<WarningRow
						title={t("chat:retiredProvider.title")}
						message={t("chat:retiredProvider.message")}
						actionText={t("chat:retiredProvider.openSettings")}
						onAction={() => vscode.postMessage({ type: "switchTab", tab: "settings" })}
					/>
				</div>
			)}
			<ChatTextArea
				ref={textAreaRef}
				inputValue={inputValue}
				setInputValue={setInputValue}
				sendingDisabled={sendingDisabled || isProfileDisabled}
				selectApiConfigDisabled={sendingDisabled && clineAsk !== "api_req_failed"}
				placeholderText={placeholderText}
				selectedImages={selectedImages}
				setSelectedImages={setSelectedImages}
				onSend={() => handleSendMessage(inputValue, selectedImages, "user")}
				onSelectImages={selectImages}
				shouldDisableImages={shouldDisableImages}
				onHeightChange={() => {
					if (isAtBottomRef.current && scrollPhaseRef.current !== "USER_BROWSING_HISTORY") {
						scrollToBottomAuto()
					}
				}}
				mode={mode}
				setMode={setMode}
				isAutoCommandRuning={isAutoCommandRuning}
				onStopCommand={() => {
					handleSecondaryButtonClick(inputValue, selectedImages)
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
				}}
				modeShortcutText={modeShortcutText}
				hoverPreviewMap={hoverPreviewMap}
				isStreaming={isStreaming}
				onStop={handleStopTask}
				onEnqueueMessage={handleEnqueueCurrentMessage}
			/>

			{isProfileDisabled && (
				<div className="px-3">
					<ProfileViolationWarning />
				</div>
			)}

			<div id="costrict-portal" />
			{/* <CloudUpsellDialog open={isUpsellOpen} onOpenChange={closeUpsell} onConnect={handleConnect} /> */}
		</div>
	)
}

const ChatView = forwardRef(ChatViewComponent)

export default ChatView
