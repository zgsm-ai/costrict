import React, { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { useEvent } from "react-use"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { type ExtensionMessage, TelemetryEventName } from "@roo-code/types"

import { ReviewTaskStatus } from "@roo/codeReview"
import TranslationProvider from "./i18n/TranslationContext"
// import { MarketplaceViewStateManager } from "./components/marketplace/MarketplaceViewStateManager"

import { vscode } from "./utils/vscode"
import { telemetryClient } from "./utils/TelemetryClient"
import { initializeSourceMaps, exposeSourceMapsForDebugging } from "./utils/sourceMapInitializer"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import ChatView, { ChatViewRef } from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import SettingsView, { SettingsViewRef } from "./components/settings/SettingsView"
import CodeReviewPage from "./components/code-review"
import CodeReviewHistoryView from "./components/code-review/CodeReviewHistoryView"
import CostrictCliView from "./components/costrict-cli/CostrictCliView"
import LoadingView from "./components/LoadingView"
import WelcomeView from "./components/welcome/WelcomeViewProvider"
import { HumanRelayDialog } from "./components/human-relay/HumanRelayDialog"
import { CheckpointRestoreDialog } from "./components/chat/CheckpointRestoreDialog"
import { DeleteMessageDialog, EditMessageDialog } from "./components/chat/MessageModificationConfirmationDialog"
import ErrorBoundary from "./components/ErrorBoundary"
// import { WorktreesView } from "./components/worktrees"
// import { CloudView } from "./components/cloud/CloudView"
import { useAddNonInteractiveClickListener } from "./components/ui/hooks/useNonInteractiveClick"
import { TooltipProvider } from "./components/ui/tooltip"
import { STANDARD_TOOLTIP_DELAY, StandardTooltip } from "./components/ui/standard-tooltip"
import { CostrictAccountView } from "./components/cloud/CostrictAccountView"
import { TabContent, TabList, TabTrigger } from "./components/common/Tab"
import { cn } from "./lib/utils"
import { ReauthConfirmationDialog } from "./components/chat/ReauthConfirmationDialog"
import { useTranslation } from "react-i18next"
import { EXPERIMENT_IDS } from "@roo/experiments"

type Tab =
	| "settings"
	| "history"
	| "chat"
	| "cs-cli"
	| "marketplace"
	| "cloud"
	| "costrict-account"
	| "codeReview"
	// | "worktrees"
	| "codeReviewHistory"

interface HumanRelayDialogState {
	isOpen: boolean
	requestId: string
	promptText: string
}

interface ReauthConfirmationDialogState {
	isOpen: boolean
	messageTs: number
}
interface DeleteMessageDialogState {
	isOpen: boolean
	messageTs: number
	hasCheckpoint: boolean
}

interface EditMessageDialogState {
	isOpen: boolean
	messageTs: number
	text: string
	hasCheckpoint: boolean
	images?: string[]
}

// Memoize dialog components to prevent unnecessary re-renders
const MemoizedDeleteMessageDialog = React.memo(DeleteMessageDialog)
const MemoizedEditMessageDialog = React.memo(EditMessageDialog)
const MemoizedReauthConfirmationDialog = React.memo(ReauthConfirmationDialog)
const MemoizedCheckpointRestoreDialog = React.memo(CheckpointRestoreDialog)
const MemoizedHumanRelayDialog = React.memo(HumanRelayDialog)

const tabsByMessageAction: Partial<Record<NonNullable<ExtensionMessage["action"]>, Tab>> = {
	chatButtonClicked: "chat",
	settingsButtonClicked: "settings",
	historyButtonClicked: "history",
	// marketplaceButtonClicked: "marketplace",
	cloudButtonClicked: "cloud",
	costrictAccountButtonClicked: "costrict-account",
	codeReviewButtonClicked: "codeReview",
}

const App = () => {
	const {
		didHydrateState,
		showWelcome,
		// shouldShowAnnouncement,
		telemetrySetting,
		telemetryKey,
		machineId,
		experiments,
		// cloudUserInfo,
		// cloudIsAuthenticated,
		// cloudApiUrl,
		// cloudOrganizations,
		renderContext,
		mdmCompliant,
		apiConfiguration,
		hasClosedCodeReviewWelcomeTips,
		reviewTask,
		setReviewTask,
		didHydrateCliState,
		setDidHydrateSClitate,
	} = useExtensionState()
	const { t } = useTranslation()

	// Create a persistent state manager
	// const marketplaceStateManager = useMemo(() => new MarketplaceViewStateManager(), [])

	const [showAnnouncement, setShowAnnouncement] = useState(false)
	const [tab, setTab] = useState<Tab>("chat")
	const isChatTab = useMemo(() => ["chat", "codeReview", "cs-cli"].includes(tab), [tab])

	const [humanRelayDialogState, setHumanRelayDialogState] = useState<HumanRelayDialogState>({
		isOpen: false,
		requestId: "",
		promptText: "",
	})

	const [deleteMessageDialogState, setDeleteMessageDialogState] = useState<DeleteMessageDialogState>({
		isOpen: false,
		messageTs: 0,
		hasCheckpoint: false,
	})

	const [reauthConfirmationDialogState, setReauthConfirmationDialogState] = useState<ReauthConfirmationDialogState>({
		isOpen: false,
		messageTs: 0,
	})

	const [editMessageDialogState, setEditMessageDialogState] = useState<EditMessageDialogState>({
		isOpen: false,
		messageTs: 0,
		text: "",
		hasCheckpoint: false,
		images: [],
	})

	const settingsRef = useRef<SettingsViewRef>(null)
	const chatViewRef = useRef<ChatViewRef>(null)
	const codeReviewNavigateRef = useRef<(() => void) | null>(null)

	const switchTab = useCallback(
		(newTab: Tab) => {
			// Only check MDM compliance if mdmCompliant is explicitly false (meaning there's an MDM policy and user is non-compliant)
			// If mdmCompliant is undefined or true, allow tab switching
			if (mdmCompliant === false && newTab !== "cloud" && newTab !== "costrict-account") {
				// Notify the user that authentication is required by their organization
				// vscode.postMessage({ type: "showMdmAuthRequiredNotification" })
				return
			}

			setCurrentSection(undefined)
			// setCurrentMarketplaceTab(undefined)
			if (newTab === "cs-cli" && !didHydrateCliState) {
				setDidHydrateSClitate(true)
			}
			// Notify backend of active tab change so it can hibernate/wake non-CLI features
			if (settingsRef.current?.checkUnsaveChanges) {
				settingsRef.current.checkUnsaveChanges(() => {
					setTab(newTab)
					vscode.postMessage({ type: "switchTab", tab: newTab })
				})
			} else {
				setTab(newTab)
				vscode.postMessage({ type: "switchTab", tab: newTab })
			}
		},
		[didHydrateCliState, mdmCompliant, setDidHydrateSClitate],
	)

	const toggleCodeReviewTips = useCallback(() => {
		vscode.postMessage({
			type: "setCodeReviewWelcomeTips",
			payload: { value: !hasClosedCodeReviewWelcomeTips },
		})
	}, [hasClosedCodeReviewWelcomeTips])

	const [currentSection, setCurrentSection] = useState<string | undefined>(undefined)
	// // eslint-disable-next-line @typescript-eslint/no-unused-vars
	// const [currentMarketplaceTab, setCurrentMarketplaceTab] = useState<string | undefined>(undefined)

	const onMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			// When CLI tab is active, route invoke messages to the terminal via bracketed paste
			if (message.type === "invoke" && tab === "cs-cli") {
				const text = message.text ?? ""
				if (text) {
					const PASTE_START = "\x1b[200~"
					const PASTE_END = "\x1b[201~"
					vscode.postMessage({ type: "CostrictCliInput", data: PASTE_START + text + PASTE_END })
				}
				return
			}

			if (message.type === "action" && message.action) {
				// Handle switchTab action with tab parameter
				if (message.action === "switchTab" && message.tab) {
					const targetTab = message.tab as Tab
					// Use setTab directly instead of switchTab to avoid re-posting
					// to the backend (which would echo back and cause an infinite loop).
					if (targetTab === "cs-cli" && !didHydrateCliState) {
						setDidHydrateSClitate(true)
					}
					setTab(targetTab)
					// Extract targetSection from values if provided
					const targetSection = message.values?.section as string | undefined
					setCurrentSection(targetSection)
					// setCurrentMarketplaceTab(undefined)
				} else {
					// Handle other actions using the mapping
					const newTab =
						tabsByMessageAction[
							message.action === "cloudButtonClicked" ? "costrictAccountButtonClicked" : message.action
						]
					const section = message.values?.section as string | undefined
					// const marketplaceTab = message.values?.marketplaceTab as string | undefined

					if (newTab) {
						switchTab(newTab)
						setCurrentSection(section)
						// setCurrentMarketplaceTab(marketplaceTab)
					}
				}
			}

			if (message.type === "showHumanRelayDialog" && message.requestId && message.promptText) {
				const { requestId, promptText } = message
				setHumanRelayDialogState({ isOpen: true, requestId, promptText })
			}

			if (message.type === "showReauthConfirmationDialog" && message.messageTs) {
				setReauthConfirmationDialogState({ isOpen: true, messageTs: message.messageTs })
			}

			if (message.type === "showDeleteMessageDialog" && message.messageTs) {
				setDeleteMessageDialogState({
					isOpen: true,
					messageTs: message.messageTs,
					hasCheckpoint: message.hasCheckpoint || false,
				})
			}

			if (message.type === "showEditMessageDialog" && message.messageTs && message.text) {
				setEditMessageDialogState({
					isOpen: true,
					messageTs: message.messageTs,
					text: message.text,
					hasCheckpoint: message.hasCheckpoint || false,
					images: message.images || [],
				})
			}

			if (message.type === "acceptInput") {
				chatViewRef.current?.acceptInput()
			}
		},
		[switchTab, didHydrateCliState, setDidHydrateSClitate, tab],
	)

	useEvent("message", onMessage)

	// useEffect(() => {
	// 	if (shouldShowAnnouncement && tab === "chat") {
	// 		setShowAnnouncement(true)
	// 		vscode.postMessage({ type: "didShowAnnouncement" })
	// 	}
	// }, [shouldShowAnnouncement, tab])

	useEffect(() => {
		if (didHydrateState) {
			telemetryClient.updateTelemetryState(telemetrySetting, telemetryKey, machineId)
		}
	}, [telemetrySetting, telemetryKey, machineId, didHydrateState])

	// Tell the extension that we are ready to receive messages.
	useEffect(() => vscode.postMessage({ type: "webviewDidLaunch" }), [])
	useEffect(() => {
		if (experiments[EXPERIMENT_IDS.CUSTOM_TOOLS] ?? false) {
			vscode.postMessage({ type: "refreshCustomTools" })
		}
	}, [experiments])
	// Initialize source map support for better error reporting
	useEffect(() => {
		// Initialize source maps for better error reporting in production
		initializeSourceMaps()

		// Expose source map debugging utilities in production
		if (process.env.NODE_ENV === "production") {
			exposeSourceMapsForDebugging()
		}

		// Log initialization for debugging
		console.debug("App initialized with source map support")
	}, [])

	// Focus the WebView when non-interactive content is clicked (only in editor/tab mode)
	useAddNonInteractiveClickListener(
		useCallback(() => {
			// Only send focus request if we're in editor (tab) mode, not sidebar
			if (renderContext === "editor") {
				vscode.postMessage({ type: "focusPanelRequest" })
			}
		}, [renderContext]),
	)
	// Track marketplace tab views
	useEffect(() => {
		if (tab === "marketplace") {
			telemetryClient.capture(TelemetryEventName.MARKETPLACE_TAB_VIEWED)
		}
	}, [tab])

	const tabs = useMemo(() => {
		const baseTabs = [
			{
				label: t("common:costrictCli.tabs.agent"),
				value: "chat",
				icon: "codicon-hubot",
			},
		]

		if (apiConfiguration?.apiProvider === "costrict") {
			baseTabs.push(
				{
					label: t("common:costrictCli.tabs.codeReview"),
					value: "codeReview",
					icon: "codicon-code-review",
					// icon: "codicon-search",
				},
				{
					label: t("common:costrictCli.tabs.cli"),
					value: "cs-cli",
					icon: "codicon-terminal",
				},
			)
		}

		return baseTabs
	}, [apiConfiguration?.apiProvider, t])

	const resetTabs = useCallback(() => {
		setTab("chat")
		vscode.postMessage({ type: "clearTask" })
	}, [setTab])

	const onIssueClick = useCallback((issueId: string) => {
		vscode.postMessage({ type: "checkReviewSuggestion", issueId })
	}, [])
	const onTaskCancel = useCallback(() => {
		vscode.postMessage({ type: "cancelReviewTask" })
	}, [])
	const onNavigateBack = useCallback(() => {
		if (reviewTask.status !== ReviewTaskStatus.RUNNING && codeReviewNavigateRef.current) {
			setReviewTask({
				status: ReviewTaskStatus.INITIAL,
				data: {
					issues: [],
					progress: 0,
				},
			})
			codeReviewNavigateRef.current()
		}
	}, [reviewTask.status, setReviewTask])

	if (!didHydrateState) {
		return <LoadingView />
	}

	// Do not conditionally load ChatView, it's expensive and there's state we
	// don't want to lose (user input, disableInput, askResponse promise, etc.)
	return showWelcome ? (
		<WelcomeView />
	) : (
		<>
			{tab === "history" && <HistoryView onDone={() => switchTab("chat")} />}
			{tab === "settings" && (
				<SettingsView ref={settingsRef} onDone={() => setTab("chat")} targetSection={currentSection} />
			)}
			{/* {tab === "marketplace" && (
				<MarketplaceView
					stateManager={marketplaceStateManager}
					onDone={() => switchTab("chat")}
					targetTab={currentMarketplaceTab as "mcp" | "mode" | undefined}
				/>
			)} */}
			{/* {tab === "cloud" && (
				<CloudView
					userInfo={cloudUserInfo}
					isAuthenticated={cloudIsAuthenticated}
					cloudApiUrl={cloudApiUrl}
					organizations={cloudOrganizations}
				/>
			)} */}
			{tab === "costrict-account" && (
				<CostrictAccountView apiConfiguration={apiConfiguration} onDone={() => switchTab("chat")} />
			)}
			{/* {tab === "worktrees" && <WorktreesView onDone={() => switchTab("chat")} />} */}
			{tab === "codeReviewHistory" && <CodeReviewHistoryView onDone={() => switchTab("codeReview")} />}
			<div className={`${isChatTab ? "fixed inset-0 flex flex-col" : "hidden"}`}>
				<div className={`header flex items-center justify-between px-5 ${isChatTab ? "" : "hidden"}`}>
					<TabList value={tab} onValueChange={(val) => switchTab(val as Tab)} className="header-left h-7">
						{tabs.map(({ label, value, icon }) => {
							const isSelected = tab === value

							return (
								<TabTrigger
									key={value}
									value={value}
									isSelected={isSelected}
									className={cn(
										"mr-4",
										"cursor-pointer",
										"border-none",
										"outline-none",
										"shadow-none",
										"bg-transparent",
										"no-underline",
										isSelected && "text-vscode-focusBorder",
									)}
									focusNeedRing={false}>
									<span className="flex items-center gap-1">
										{icon && <i className={cn("codicon", icon)} style={{ fontSize: "14px" }}></i>}
										{label}
									</span>
								</TabTrigger>
							)
						})}
					</TabList>

					{tab === "chat" && (
						<div className="header-right flex absolute right-3 gap-1">
							<StandardTooltip content={t("chat:startNewTask.title")}>
								<i className="codicon codicon-add cursor-pointer p-0.5" onClick={() => resetTabs()}></i>
							</StandardTooltip>
							{/* <StandardTooltip content={t("worktrees:title")}>
								<i
									className="codicon codicon-git-branch-create cursor-pointer p-0.5"
									onClick={() => switchTab("worktrees")}></i>
							</StandardTooltip> */}
							<StandardTooltip content={t("history:history")}>
								<i
									className="codicon codicon-history cursor-pointer p-0.5"
									onClick={() => switchTab("history")}></i>
							</StandardTooltip>
						</div>
					)}
					{tab === "codeReview" && (
						<div className="header-right flex absolute right-3">
							{reviewTask?.status !== ReviewTaskStatus.INITIAL && (
								<StandardTooltip content={t("chat:startNewTask.title")}>
									<i
										className={`codicon codicon-arrow-left mr-1 p-0.5 ${
											reviewTask?.status !== ReviewTaskStatus.RUNNING
												? "cursor-pointer"
												: "cursor-not-allowed opacity-50"
										}`}
										onClick={onNavigateBack}></i>
								</StandardTooltip>
							)}
							{reviewTask.status === ReviewTaskStatus.INITIAL && (
								<StandardTooltip content={t("codeReview:codeReview")}>
									<i
										className="codicon codicon-question cursor-pointer mr-1 p-0.5"
										onClick={() => toggleCodeReviewTips()}></i>
								</StandardTooltip>
							)}
							<StandardTooltip content={t("history:history")}>
								<i
									className="codicon codicon-history cursor-pointer p-0.5"
									onClick={() => switchTab("codeReviewHistory")}></i>
							</StandardTooltip>
						</div>
					)}
				</div>
				<TabContent className={tab === "cs-cli" ? "p-0 overflow-hidden" : tab === "codeReview" ? "p-0" : ""}>
					{tab !== "cs-cli" && (
						<ChatView
							ref={chatViewRef}
							isHidden={tab !== "chat"}
							showAnnouncement={showAnnouncement}
							hideAnnouncement={() => setShowAnnouncement(false)}
						/>
					)}
					{tab === "codeReview" && (
						<CodeReviewPage
							isHidden={tab !== "codeReview"}
							onIssueClick={onIssueClick}
							onTaskCancel={onTaskCancel}
							onNavigateToWelcome={(fn) => {
								codeReviewNavigateRef.current = fn
							}}
						/>
					)}
					{apiConfiguration.apiProvider === "costrict" && didHydrateCliState && (
						<CostrictCliView isHidden={tab !== "cs-cli"} />
					)}
				</TabContent>
			</div>
			<MemoizedHumanRelayDialog
				isOpen={humanRelayDialogState.isOpen}
				requestId={humanRelayDialogState.requestId}
				promptText={humanRelayDialogState.promptText}
				onClose={() => setHumanRelayDialogState((prev) => ({ ...prev, isOpen: false }))}
				onSubmit={(requestId, text) => vscode.postMessage({ type: "humanRelayResponse", requestId, text })}
				onCancel={(requestId) => vscode.postMessage({ type: "humanRelayCancel", requestId })}
			/>
			{deleteMessageDialogState.hasCheckpoint ? (
				<MemoizedCheckpointRestoreDialog
					open={deleteMessageDialogState.isOpen}
					type="delete"
					hasCheckpoint={deleteMessageDialogState.hasCheckpoint}
					onOpenChange={(open: boolean) => setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
					onConfirm={(restoreCheckpoint: boolean) => {
						vscode.postMessage({
							type: "deleteMessageConfirm",
							messageTs: deleteMessageDialogState.messageTs,
							restoreCheckpoint,
						})
						setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: false }))
					}}
				/>
			) : (
				<MemoizedDeleteMessageDialog
					open={deleteMessageDialogState.isOpen}
					onOpenChange={(open: boolean) => setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
					onConfirm={() => {
						vscode.postMessage({
							type: "deleteMessageConfirm",
							messageTs: deleteMessageDialogState.messageTs,
						})
						setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: false }))
					}}
				/>
			)}
			{editMessageDialogState.hasCheckpoint ? (
				<MemoizedCheckpointRestoreDialog
					open={editMessageDialogState.isOpen}
					type="edit"
					hasCheckpoint={editMessageDialogState.hasCheckpoint}
					onOpenChange={(open: boolean) => setEditMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
					onConfirm={(restoreCheckpoint: boolean) => {
						vscode.postMessage({
							type: "editMessageConfirm",
							messageTs: editMessageDialogState.messageTs,
							text: editMessageDialogState.text,
							restoreCheckpoint,
						})
						setEditMessageDialogState((prev) => ({ ...prev, isOpen: false }))
					}}
				/>
			) : (
				<MemoizedEditMessageDialog
					open={editMessageDialogState.isOpen}
					onOpenChange={(open: boolean) => setEditMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
					onConfirm={() => {
						vscode.postMessage({
							type: "editMessageConfirm",
							messageTs: editMessageDialogState.messageTs,
							text: editMessageDialogState.text,
							images: editMessageDialogState.images,
						})
						setEditMessageDialogState((prev) => ({ ...prev, isOpen: false }))
					}}
				/>
			)}
			<MemoizedReauthConfirmationDialog
				open={reauthConfirmationDialogState.isOpen}
				onOpenChange={(open) => setReauthConfirmationDialogState((prev) => ({ ...prev, isOpen: open }))}
				onConfirm={() => {
					vscode.postMessage({ type: "costrictLogin", apiConfiguration })
					setReauthConfirmationDialogState((prev) => ({ ...prev, isOpen: false }))
				}}
			/>
		</>
	)
}

const queryClient = new QueryClient()

const AppWithProviders = () => (
	<ErrorBoundary>
		<ExtensionStateContextProvider>
			<TranslationProvider>
				<QueryClientProvider client={queryClient}>
					<TooltipProvider delayDuration={STANDARD_TOOLTIP_DELAY}>
						<App />
					</TooltipProvider>
				</QueryClientProvider>
			</TranslationProvider>
		</ExtensionStateContextProvider>
	</ErrorBoundary>
)

export default AppWithProviders
