import React, { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { useEvent } from "react-use"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionMessage } from "@roo/ExtensionMessage"
import TranslationProvider from "./i18n/TranslationContext"
// import { MarketplaceViewStateManager } from "./components/marketplace/MarketplaceViewStateManager"

import { vscode } from "./utils/vscode"
import { telemetryClient } from "./utils/TelemetryClient"
import { TelemetryEventName } from "@roo-code/types"
import { initializeSourceMaps, exposeSourceMapsForDebugging } from "./utils/sourceMapInitializer"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import ChatView, { ChatViewRef } from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import SettingsView, { SettingsViewRef } from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"
import McpView from "./components/mcp/McpView"
// import { MarketplaceView } from "./components/marketplace/MarketplaceView"
import ModesView from "./components/modes/ModesView"
import CodeReviewPage from "./components/code-review"
import { HumanRelayDialog } from "./components/human-relay/HumanRelayDialog"
import { DeleteMessageDialog, EditMessageDialog } from "./components/chat/MessageModificationConfirmationDialog"
import ErrorBoundary from "./components/ErrorBoundary"
import { AccountView } from "./components/account/AccountView"
import { useAddNonInteractiveClickListener } from "./components/ui/hooks/useNonInteractiveClick"
import { TooltipProvider } from "./components/ui/tooltip"
import { STANDARD_TOOLTIP_DELAY } from "./components/ui/standard-tooltip"
import { ZgsmAccountView } from "./components/account/ZgsmAccountView"
import { TabContent, TabList, TabTrigger } from "./components/common/Tab"
import { cn } from "./lib/utils"
import { ReauthConfirmationDialog } from "./components/chat/ReauthConfirmationDialog"
import { ZgsmCodebaseDisableConfirmDialog } from "./components/settings/ZgsmCodebaseDisableConfirmDialog"

type Tab = "settings" | "history" | "mcp" | "modes" | "chat" | "marketplace" | "account" | "zgsm-account" | "codeReview"

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
}

interface EditMessageDialogState {
	isOpen: boolean
	messageTs: number
	text: string
	images?: string[]
}

interface ZgsmCodebaseDisableConfirmDialogState {
	isOpen: boolean
}

// Memoize dialog components to prevent unnecessary re-renders
const MemoizedDeleteMessageDialog = React.memo(DeleteMessageDialog)
const MemoizedEditMessageDialog = React.memo(EditMessageDialog)
const MemoizedReauthConfirmationDialog = React.memo(ReauthConfirmationDialog)
const MemoizedHumanRelayDialog = React.memo(HumanRelayDialog)
const MemoizedZgsmCodebaseDisableConfirmDialog = React.memo(ZgsmCodebaseDisableConfirmDialog)

const tabsByMessageAction: Partial<Record<NonNullable<ExtensionMessage["action"]>, Tab>> = {
	chatButtonClicked: "chat",
	settingsButtonClicked: "settings",
	promptsButtonClicked: "modes",
	mcpButtonClicked: "mcp",
	historyButtonClicked: "history",
	// marketplaceButtonClicked: "marketplace",
	accountButtonClicked: "account",
	zgsmAccountButtonClicked: "zgsm-account",
	codeReviewButtonClicked: "codeReview",
}

const App = () => {
	const {
		didHydrateState,
		showWelcome,
		shouldShowAnnouncement,
		telemetrySetting,
		telemetryKey,
		machineId,
		cloudUserInfo,
		cloudIsAuthenticated,
		cloudApiUrl,
		renderContext,
		mdmCompliant,
		apiConfiguration,
	} = useExtensionState()

	// Create a persistent state manager
	// const marketplaceStateManager = useMemo(() => new MarketplaceViewStateManager(), [])

	const [showAnnouncement, setShowAnnouncement] = useState(false)
	const [tab, setTab] = useState<Tab>("chat")
	const isChatTab = useMemo(() => ["chat", "codeReview"].includes(tab), [tab])

	const [humanRelayDialogState, setHumanRelayDialogState] = useState<HumanRelayDialogState>({
		isOpen: false,
		requestId: "",
		promptText: "",
	})

	const [deleteMessageDialogState, setDeleteMessageDialogState] = useState<DeleteMessageDialogState>({
		isOpen: false,
		messageTs: 0,
	})

	const [reauthConfirmationDialogState, setReauthConfirmationDialogState] = useState<ReauthConfirmationDialogState>({
		isOpen: false,
		messageTs: 0,
	})

	const [editMessageDialogState, setEditMessageDialogState] = useState<EditMessageDialogState>({
		isOpen: false,
		messageTs: 0,
		text: "",
		images: [],
	})

	const [zgsmCodebaseDisableConfirmDialogState, setZgsmCodebaseDisableConfirmDialogState] =
		useState<ZgsmCodebaseDisableConfirmDialogState>({
			isOpen: false,
		})

	const settingsRef = useRef<SettingsViewRef>(null)
	const chatViewRef = useRef<ChatViewRef>(null)

	const switchTab = useCallback(
		(newTab: Tab) => {
			// Only check MDM compliance if mdmCompliant is explicitly false (meaning there's an MDM policy and user is non-compliant)
			// If mdmCompliant is undefined or true, allow tab switching
			// if (mdmCompliant === false && newTab !== "account") {
			// 	// Notify the user that authentication is required by their organization
			// 	vscode.postMessage({ type: "showMdmAuthRequiredNotification" })
			// 	return
			// }
			if (mdmCompliant === false && newTab !== "account" && newTab !== "zgsm-account") {
				return
			}

			setCurrentSection(undefined)
			setCurrentMarketplaceTab(undefined)

			if (settingsRef.current?.checkUnsaveChanges) {
				settingsRef.current.checkUnsaveChanges(() => setTab(newTab))
			} else {
				setTab(newTab)
			}
		},
		[mdmCompliant],
	)

	const [currentSection, setCurrentSection] = useState<string | undefined>(undefined)
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [currentMarketplaceTab, setCurrentMarketplaceTab] = useState<string | undefined>(undefined)

	const onMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			if (message.type === "action" && message.action) {
				// Handle switchTab action with tab parameter
				if (message.action === "switchTab" && message.tab) {
					const targetTab = message.tab as Tab
					switchTab(targetTab)
					setCurrentSection(undefined)
					setCurrentMarketplaceTab(undefined)
				} else {
					// Handle other actions using the mapping
					const newTab =
						tabsByMessageAction[
							message.action === "accountButtonClicked" ? "zgsmAccountButtonClicked" : message.action
						]
					const section = message.values?.section as string | undefined
					const marketplaceTab = message.values?.marketplaceTab as string | undefined

					if (newTab) {
						switchTab(newTab)
						setCurrentSection(section)
						setCurrentMarketplaceTab(marketplaceTab)
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
				setDeleteMessageDialogState({ isOpen: true, messageTs: message.messageTs })
			}

			if (message.type === "showEditMessageDialog" && message.messageTs && message.text) {
				setEditMessageDialogState({
					isOpen: true,
					messageTs: message.messageTs,
					text: message.text,
					images: message.images || [],
				})
			}

			if (message.type === "showZgsmCodebaseDisableConfirmDialog") {
				setZgsmCodebaseDisableConfirmDialogState({ isOpen: true })
			}

			if (message.type === "acceptInput") {
				chatViewRef.current?.acceptInput()
			}
		},
		[switchTab],
	)

	useEvent("message", onMessage)

	useEffect(() => {
		if (shouldShowAnnouncement) {
			setShowAnnouncement(true)
			vscode.postMessage({ type: "didShowAnnouncement" })
		}
	}, [shouldShowAnnouncement])

	useEffect(() => {
		if (didHydrateState) {
			telemetryClient.updateTelemetryState(telemetrySetting, telemetryKey, machineId)
		}
	}, [telemetrySetting, telemetryKey, machineId, didHydrateState])

	// Tell the extension that we are ready to receive messages.
	useEffect(() => vscode.postMessage({ type: "webviewDidLaunch" }), [])

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
				label: "AGENT",
				value: "chat",
			},
		]

		if (apiConfiguration?.apiProvider === "zgsm") {
			baseTabs.push({
				label: "CODE REVIEW",
				value: "codeReview",
			})
		}

		return baseTabs
	}, [apiConfiguration?.apiProvider])

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

	if (!didHydrateState) {
		return null
	}

	// Do not conditionally load ChatView, it's expensive and there's state we
	// don't want to lose (user input, disableInput, askResponse promise, etc.)
	return showWelcome ? (
		<WelcomeView />
	) : (
		<>
			{tab === "modes" && <ModesView onDone={() => switchTab("chat")} />}
			{tab === "mcp" && <McpView onDone={() => switchTab("chat")} />}
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
			{tab === "account" && (
				<AccountView
					userInfo={cloudUserInfo}
					isAuthenticated={cloudIsAuthenticated}
					cloudApiUrl={cloudApiUrl}
					onDone={() => switchTab("chat")}
				/>
			)}
			{tab === "zgsm-account" && (
				<ZgsmAccountView apiConfiguration={apiConfiguration} onDone={() => switchTab("chat")} />
			)}
			<div className={`${isChatTab ? "fixed inset-0 flex flex-col" : "hidden"}`}>
				<div className={`header flex items-center justify-between px-5 ${isChatTab ? "" : "hidden"}`}>
					<TabList
						value={tab}
						onValueChange={(val) => switchTab(val as Tab)}
						className="header-left h-[28px]">
						{tabs.map(({ label, value }) => {
							const isSelected = tab === value
							const activeTabClass = isSelected ? "border-b border-gray-200" : ""

							return (
								<TabTrigger
									key={value}
									value={value}
									isSelected={isSelected}
									className={cn(activeTabClass, "mr-[16px]", "cursor-pointer")}
									focusNeedRing={false}>
									{label}
								</TabTrigger>
							)
						})}
					</TabList>

					{tab === "chat" && (
						<div className="header-right flex absolute right-[12px]">
							<i
								className="codicon codicon-add mr-[4px] cursor-pointer p-[2px]"
								onClick={() => resetTabs()}></i>
							<i
								className="codicon codicon-history cursor-pointer p-[2px]"
								onClick={() => switchTab("history")}></i>
						</div>
					)}
				</div>
				<TabContent>
					<ChatView
						ref={chatViewRef}
						isHidden={tab !== "chat"}
						showAnnouncement={showAnnouncement}
						hideAnnouncement={() => setShowAnnouncement(false)}
					/>
					{tab === "codeReview" && (
						<CodeReviewPage
							isHidden={tab !== "codeReview"}
							onIssueClick={onIssueClick}
							onTaskCancel={onTaskCancel}
						/>
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
			<MemoizedDeleteMessageDialog
				open={deleteMessageDialogState.isOpen}
				onOpenChange={(open) => setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
				onConfirm={() => {
					vscode.postMessage({
						type: "deleteMessageConfirm",
						messageTs: deleteMessageDialogState.messageTs,
					})
					setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: false }))
				}}
			/>
			<MemoizedEditMessageDialog
				open={editMessageDialogState.isOpen}
				onOpenChange={(open) => setEditMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
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
			<MemoizedReauthConfirmationDialog
				open={reauthConfirmationDialogState.isOpen}
				onOpenChange={(open) => setReauthConfirmationDialogState((prev) => ({ ...prev, isOpen: open }))}
				onConfirm={() => {
					vscode.postMessage({ type: "zgsmLogin", apiConfiguration })
					setReauthConfirmationDialogState((prev) => ({ ...prev, isOpen: false }))
				}}
			/>
			<MemoizedZgsmCodebaseDisableConfirmDialog
				open={zgsmCodebaseDisableConfirmDialogState.isOpen}
				onOpenChange={(open) => setZgsmCodebaseDisableConfirmDialogState((prev) => ({ ...prev, isOpen: open }))}
				onConfirm={() => {
					vscode.postMessage({ type: "zgsmCodebaseIndexEnabled", bool: false })
					setZgsmCodebaseDisableConfirmDialogState((prev) => ({ ...prev, isOpen: false }))
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
