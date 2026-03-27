// npx vitest run src/__tests__/App.spec.tsx

import React from "react"
import { render, screen, act, cleanup, fireEvent } from "@/utils/test-utils"

import AppWithProviders from "../App"

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock the ErrorBoundary component
vi.mock("@src/components/ErrorBoundary", () => ({
	__esModule: true,
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock the telemetry client
vi.mock("@src/utils/TelemetryClient", () => ({
	telemetryClient: {
		capture: vi.fn(),
		updateTelemetryState: vi.fn(),
	},
}))

vi.mock("@src/components/chat/ChatView", () => ({
	__esModule: true,
	default: function ChatView({ isHidden }: { isHidden: boolean }) {
		return (
			<div data-testid="chat-view" data-hidden={isHidden}>
				Chat View
			</div>
		)
	},
}))

vi.mock("@src/components/settings/SettingsView", () => ({
	__esModule: true,
	default: function SettingsView({ onDone }: { onDone: () => void }) {
		return (
			<div data-testid="settings-view" onClick={onDone}>
				Settings View
			</div>
		)
	},
}))

vi.mock("@src/components/costrict-cli/CostrictCliView", () => ({
	__esModule: true,
	default: function CostrictCliView({ isHidden }: { isHidden: boolean }) {
		return (
			<div data-testid="costrict-cli-view" data-hidden={isHidden}>
				Costrict CLI View
				<button type="button">Restart CoStrict CLI</button>
			</div>
		)
	},
}))

vi.mock("@src/components/history/HistoryView", () => ({
	__esModule: true,
	default: function HistoryView({ onDone }: { onDone: () => void }) {
		return (
			<div data-testid="history-view" onClick={onDone}>
				History View
			</div>
		)
	},
}))

vi.mock("@src/components/mcp/McpView", () => ({
	__esModule: true,
	default: function McpView() {
		return <div data-testid="mcp-view">MCP View</div>
	},
}))

vi.mock("@src/components/modes/ModesView", () => ({
	__esModule: true,
	default: function ModesView() {
		return <div data-testid="prompts-view">Modes View</div>
	},
}))

// vi.mock("@src/components/marketplace/MarketplaceView", () => ({
// 	MarketplaceView: function MarketplaceView({ onDone }: { onDone: () => void }) {
// 		return (
// 			<div data-testid="marketplace-view" onClick={onDone}>
// 				Marketplace View
// 			</div>
// 		)
// 	},
// }))

vi.mock("@src/components/cloud/CloudView", () => ({
	CloudView: function CloudView() {
		return <div data-testid="cloud-view">Cloud View</div>
	},
}))

const mockUseExtensionState = vi.fn()

// Mock the HumanRelayDialog component
vi.mock("@src/components/human-relay/HumanRelayDialog", () => ({
	HumanRelayDialog: ({ _children, isOpen, onClose }: any) => (
		<div data-testid="human-relay-dialog" data-open={isOpen} onClick={onClose}>
			Human Relay Dialog
		</div>
	),
}))

// Mock i18next and react-i18next
vi.mock("i18next", () => {
	const tFunction = (key: string) => key
	const i18n = {
		t: tFunction,
		use: () => i18n,
		init: () => Promise.resolve(tFunction),
		changeLanguage: vi.fn(() => Promise.resolve()),
	}
	return { default: i18n }
})

vi.mock("react-i18next", () => {
	const tFunction = (key: string) => key
	return {
		withTranslation: () => (Component: any) => {
			const MockedComponent = (props: any) => {
				return <Component t={tFunction} i18n={{ t: tFunction }} tReady {...props} />
			}
			MockedComponent.displayName = `withTranslation(${Component.displayName || Component.name || "Component"})`
			return MockedComponent
		},
		Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
		useTranslation: () => {
			return {
				t: tFunction,
				i18n: {
					t: tFunction,
					changeLanguage: vi.fn(() => Promise.resolve()),
				},
			}
		},
		initReactI18next: {
			type: "3rdParty",
			init: vi.fn(),
		},
	}
})

// Mock TranslationProvider to pass through children
vi.mock("@src/i18n/TranslationContext", () => {
	const tFunction = (key: string) => key
	return {
		__esModule: true,
		default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
		useAppTranslation: () => ({
			t: tFunction,
			i18n: {
				t: tFunction,
				changeLanguage: vi.fn(() => Promise.resolve()),
			},
		}),
	}
})

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => mockUseExtensionState(),
	ExtensionStateContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock environment variables
vi.mock("process.env", () => ({
	NODE_ENV: "test",
	COSTRICT_PKG_VERSION: "1.0.0-test",
}))

const createExtensionState = (overrides: Record<string, any> = {}) => ({
	didHydrateState: true,
	showWelcome: false,
	shouldShowAnnouncement: false,
	experiments: {},
	language: "en",
	telemetrySetting: "enabled",
	telemetryKey: undefined,
	machineId: undefined,
	renderContext: "sidebar",
	mdmCompliant: true,
	apiConfiguration: {
		apiProvider: "openai",
	},
	hasClosedCodeReviewWelcomeTips: true,
	didHydrateCliState: false,
	setDidHydrateSClitate: vi.fn(),
	reviewTask: {
		status: "initial",
		data: {
			issues: [],
			progress: 0,
		},
	},
	setReviewTask: vi.fn(),
	...overrides,
})

describe("App", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		window.removeEventListener("message", () => {})
		mockUseExtensionState.mockReturnValue(createExtensionState())
	})

	afterEach(() => {
		cleanup()
		window.removeEventListener("message", () => {})
	})

	const triggerActionMessage = (action: string, extraData?: Record<string, unknown>) => {
		const messageEvent = new MessageEvent("message", {
			data: {
				type: "action",
				action,
				...extraData,
			},
		})
		window.dispatchEvent(messageEvent)
	}

	it("shows chat view by default", () => {
		render(<AppWithProviders />)

		const chatView = screen.getByTestId("chat-view")
		expect(chatView).toBeInTheDocument()
		expect(chatView.getAttribute("data-hidden")).toBe("false")
	}, 10000)

	it("switches to settings view when receiving settingsButtonClicked action", async () => {
		render(<AppWithProviders />)

		act(() => {
			triggerActionMessage("settingsButtonClicked")
		})

		const settingsView = await screen.findByTestId("settings-view")
		expect(settingsView).toBeInTheDocument()

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("true")
	})

	it("switches to history view when receiving historyButtonClicked action", async () => {
		render(<AppWithProviders />)

		act(() => {
			triggerActionMessage("historyButtonClicked")
		})

		const historyView = await screen.findByTestId("history-view")
		expect(historyView).toBeInTheDocument()

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("true")
	})

	it("returns to chat view when clicking done in settings view", async () => {
		render(<AppWithProviders />)

		act(() => {
			triggerActionMessage("settingsButtonClicked")
		})

		const settingsView = await screen.findByTestId("settings-view")

		act(() => {
			settingsView.click()
		})

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("false")
		expect(screen.queryByTestId("settings-view")).not.toBeInTheDocument()
	})

	it.each(["history"])("returns to chat view when clicking done in %s view", async (view) => {
		render(<AppWithProviders />)

		act(() => {
			triggerActionMessage(`${view}ButtonClicked`)
		})

		const viewElement = await screen.findByTestId(`${view}-view`)

		act(() => {
			viewElement.click()
		})

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("false")
		expect(screen.queryByTestId(`${view}-view`)).not.toBeInTheDocument()
	})

	it("shows the COSTRICT CLI tab label for zgsm provider", () => {
		mockUseExtensionState.mockReturnValue(
			createExtensionState({
				apiConfiguration: {
					apiProvider: "zgsm",
				},
			}),
		)

		render(<AppWithProviders />)

		expect(screen.getByRole("tab", { name: "common:costrictCli.tabs.cli" })).toBeInTheDocument()
	})

	it("shows the CLI tab for zgsm provider and activates the CLI tab on click", () => {
		const setDidHydrateSClitate = vi.fn()
		mockUseExtensionState.mockReturnValue(
			createExtensionState({
				apiConfiguration: {
					apiProvider: "zgsm",
				},
				setDidHydrateSClitate,
			}),
		)

		render(<AppWithProviders />)

		const cliTab = screen.getByRole("tab", { name: "common:costrictCli.tabs.cli" })
		fireEvent.click(cliTab)

		expect(setDidHydrateSClitate).toHaveBeenCalledWith(true)
		expect(cliTab).toHaveAttribute("aria-selected", "true")
	})

	it("does not show the CLI tab for non-zgsm providers", () => {
		render(<AppWithProviders />)

		expect(screen.queryByRole("tab", { name: "common:costrictCli.tabs.cli" })).not.toBeInTheDocument()
	})

	it("does not render the old App header actions when the CLI tab is active", async () => {
		mockUseExtensionState.mockReturnValue(
			createExtensionState({
				apiConfiguration: {
					apiProvider: "zgsm",
				},
				didHydrateCliState: true,
			}),
		)

		render(<AppWithProviders />)

		act(() => {
			triggerActionMessage("switchTab", { tab: "cs-cli" })
		})

		const cliView = await screen.findByTestId("costrict-cli-view")
		expect(cliView.getAttribute("data-hidden")).toBe("false")
		expect(screen.queryByText("chat:startNewTask.title")).not.toBeInTheDocument()
		expect(screen.queryByText("history:history")).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Restart CoStrict CLI" })).toBeInTheDocument()
	})

	// todo: fix this test
	// it("switches to marketplace view when receiving marketplaceButtonClicked action", async () => {
	// 	render(<AppWithProviders />)

	// 	act(() => {
	// 		triggerActionMessage("marketplaceButtonClicked")
	// 	})

	// 	const marketplaceView = await screen.findByTestId("marketplace-view")
	// 	expect(marketplaceView).toBeInTheDocument()

	// 	const chatView = screen.queryByTestId("chat-view")
	// 	expect(chatView).not.toBeInTheDocument()
	// })
	// todo: fix this test
	// it("returns to chat view when clicking done in marketplace view", async () => {
	// 	render(<AppWithProviders />)

	// 	act(() => {
	// 		triggerActionMessage("marketplaceButtonClicked")
	// 	})

	// 	const marketplaceView = await screen.findByTestId("marketplace-view")

	// 	act(() => {
	// 		marketplaceView.click()
	// 	})

	// 	const marketplaceView = await screen.findByTestId("marketplace-view")

	// 	act(() => {
	// 		marketplaceView.click()
	// 	})

	// 	const chatView = screen.getByTestId("chat-view")
	// 	expect(chatView.getAttribute("data-hidden")).toBe("false")
	// 	expect(screen.queryByTestId("marketplace-view")).not.toBeInTheDocument()
	// })
})
