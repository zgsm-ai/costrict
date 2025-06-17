import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEvent } from "react-use"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionMessage } from "@roo/shared/ExtensionMessage"
import TranslationProvider from "./i18n/TranslationContext"

import { vscode } from "./utils/vscode"
import { telemetryClient } from "./utils/TelemetryClient"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import ChatView, { ChatViewRef } from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import SettingsView, { SettingsViewRef } from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"
import McpView from "./components/mcp/McpView"
import PromptsView from "./components/prompts/PromptsView"
import CodeReviewPage from "./components/code-review"
import { HumanRelayDialog } from "./components/human-relay/HumanRelayDialog"
import { TabContent, TabList, TabTrigger } from "./components/common/Tab"
import { cn } from "./lib/utils"
// import { zgsmProviderKey } from "../../src/shared/api"

type Tab = "settings" | "history" | "mcp" | "prompts" | "chat" | "codeReview"

const tabsByMessageAction: Partial<Record<NonNullable<ExtensionMessage["action"]>, Tab>> = {
	chatButtonClicked: "chat",
	settingsButtonClicked: "settings",
	promptsButtonClicked: "prompts",
	mcpButtonClicked: "mcp",
	historyButtonClicked: "history",
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
		// apiConfiguration,
		// setApiConfiguration,
	} = useExtensionState()

	const [showAnnouncement, setShowAnnouncement] = useState(false)
	const [tab, setTab] = useState<Tab>("chat")
	const isChatTab = useMemo(() => ["chat", "codeReview"].includes(tab), [tab])

	const [humanRelayDialogState, setHumanRelayDialogState] = useState<{
		isOpen: boolean
		requestId: string
		promptText: string
	}>({
		isOpen: false,
		requestId: "",
		promptText: "",
	})

	const settingsRef = useRef<SettingsViewRef>(null)
	const chatViewRef = useRef<ChatViewRef>(null)

	const switchTab = useCallback((newTab: Tab) => {
		setCurrentSection(undefined)

		if (settingsRef.current?.checkUnsaveChanges) {
			settingsRef.current.checkUnsaveChanges(() => {
				setTab(newTab)
			})
		} else {
			setTab(newTab)
		}
	}, [])

	const [currentSection, setCurrentSection] = useState<string | undefined>(undefined)

	const onMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			if (message.type === "action" && message.action) {
				const newTab = tabsByMessageAction[message.action]
				const section = message.values?.section as string | undefined

				if (newTab) {
					switchTab(newTab)
					setCurrentSection(section)
				}
			}

			if (message.type === "showHumanRelayDialog" && message.requestId && message.promptText) {
				const { requestId, promptText } = message
				setHumanRelayDialogState({ isOpen: true, requestId, promptText })
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

	const tabs = [
		{
			label: "AGENT",
			value: "chat",
		},
		{
			label: "CODE REVIEW",
			value: "codeReview",
		},
	]

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
			{tab === "prompts" && <PromptsView onDone={() => switchTab("chat")} />}
			{tab === "mcp" && <McpView onDone={() => switchTab("chat")} />}
			{tab === "history" && <HistoryView onDone={() => switchTab("chat")} />}
			{tab === "settings" && (
				<SettingsView ref={settingsRef} onDone={() => setTab("chat")} targetSection={currentSection} />
			)}
			<HumanRelayDialog
				isOpen={humanRelayDialogState.isOpen}
				requestId={humanRelayDialogState.requestId}
				promptText={humanRelayDialogState.promptText}
				onClose={() => setHumanRelayDialogState((prev) => ({ ...prev, isOpen: false }))}
				onSubmit={(requestId, text) => vscode.postMessage({ type: "humanRelayResponse", requestId, text })}
				onCancel={(requestId) => vscode.postMessage({ type: "humanRelayCancel", requestId })}
			/>
			{isChatTab && (
				<>
					<div className="header flex items-center justify-between">
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
						{tab === "chat" && (
							<ChatView
								ref={chatViewRef}
								isHidden={tab !== "chat"}
								showAnnouncement={showAnnouncement}
								hideAnnouncement={() => setShowAnnouncement(false)}
							/>
						)}
						{tab === "codeReview" && (
							<CodeReviewPage onIssueClick={onIssueClick} onTaskCancel={onTaskCancel} />
						)}
					</TabContent>
				</>
			)}
		</>
	)
}

const queryClient = new QueryClient()

const AppWithProviders = () => (
	<ExtensionStateContextProvider>
		<TranslationProvider>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</TranslationProvider>
	</ExtensionStateContextProvider>
)

export default AppWithProviders
