// npx vitest src/components/settings/__tests__/AutoCleanupSettings.spec.tsx

import { describe, it, expect, beforeEach, vi } from "vitest"
import { CleanupStrategy } from "@roo-code/types"

// Mock extension state context
vi.mock("@/context/ExtensionStateContext", () => ({
	ExtensionStateContextProvider: ({ children }: { children: React.ReactNode }) => children,
	useExtensionState: vi.fn(),
}))

// Mock translation hook
vi.mock("@/hooks/useAppTranslation", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			// Return specific translations for our test cases
			const translations: Record<string, string> = {
				"settings:sections.autoCleanup": "Auto Cleanup",
				"settings:autoCleanup.description": "Automatically clean up old task history",
				"settings:autoCleanup.enabled.label": "Enable Auto Cleanup",
				"settings:autoCleanup.enabled.description": "When enabled, extension will automatically remove old tasks based on your settings",
				"settings:autoCleanup.strategy.label": "Cleanup Strategy",
				"settings:autoCleanup.strategy.basedOnTime.label": "Based on Time",
				"settings:autoCleanup.strategy.basedOnCount.label": "Based on Count",
				"settings:autoCleanup.strategy.basedOnSize.label": "Based on Size",
				"common:save": "Save",
			}
			return translations[key] || key
		},
	}),
}))

// Mock UI components to behave like standard HTML elements
vi.mock("@/components/ui", () => ({
	...vi.importActual("@/components/ui"),
	Slider: ({ value, onValueChange, "data-testid": dataTestId, disabled, min, max }: any) => (
		<input
			type="range"
			value={value?.[0] ?? 0}
			min={min}
			max={max}
			onChange={(e) => onValueChange([parseFloat(e.target.value)])}
			data-testid={dataTestId}
			disabled={disabled}
			role="slider"
		/>
	),
	Input: ({ value, onChange, "data-testid": dataTestId, ...props }: any) => (
		<input value={value} onChange={onChange} data-testid={dataTestId} {...props} />
	),
	Button: ({ onClick, children, ...props }: any) => (
		<button onClick={onClick} {...props}>
			{children}
		</button>
	),
	Select: ({ children, ...props }: any) => (
		<div role="combobox" {...props}>
			{children}
		</div>
	),
	SelectTrigger: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	SelectValue: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	SelectContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	SelectItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	SelectItemText: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}))

// Mock VSCode components
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeCheckbox: ({ checked, onChange, children, "data-testid": dataTestId }: any) => (
		<label data-testid={dataTestId}>
			<input type="checkbox" role="checkbox" checked={checked} onChange={(e: any) => onChange?.({ target: { checked: e.target.checked } })} />
			{children}
		</label>
	),
}))

// Mock vscode interface
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

import { render, screen } from "@/utils/test-utils"
import { AutoCleanupSettings } from "../AutoCleanupSettings"

const { useExtensionState } = await import("@/context/ExtensionStateContext")
const mockUseExtensionState = vi.mocked(useExtensionState)

describe("AutoCleanupSettings", () => {
	const mockSetCachedStateField = vi.fn()
	const mockAutoCleanup = {
		enabled: true,
		strategy: CleanupStrategy.BASED_ON_TIME,
		retentionDays: 7,
		maxHistoryCount: 50,
		excludeActive: true,
		cleanupOnStartup: true,
	}

	beforeEach(() => {
		vi.clearAllMocks()

		mockUseExtensionState.mockReturnValue({
			autoCleanup: mockAutoCleanup,
			setAutoCleanup: vi.fn(),
		} as any)
	})

	it("renders auto cleanup settings with default props", () => {
		render(<AutoCleanupSettings autoCleanup={mockAutoCleanup} setCachedStateField={mockSetCachedStateField} />)

		// Check that auto cleanup section is rendered
		expect(screen.getByText("settings:sections.autoCleanup")).toBeInTheDocument()
		expect(screen.getByText("settings:autoCleanup.description")).toBeInTheDocument()

		// Check that enabled checkbox is rendered
		expect(screen.getByTestId("auto-cleanup-enabled-checkbox")).toBeInTheDocument()
	})

	it("renders strategy options", () => {
		render(<AutoCleanupSettings autoCleanup={mockAutoCleanup} setCachedStateField={mockSetCachedStateField} />)

		// Check that strategy labels are rendered
		expect(screen.getByText("settings:autoCleanup.strategy.label")).toBeInTheDocument()
		// Strategy labels should appear at least once in the UI (may appear multiple times in different UI parts)
		// Note: basedOnSize is currently disabled/commented out in the component
		expect(screen.getAllByText("settings:autoCleanup.strategy.basedOnTime.label").length).toBeGreaterThan(0)
		expect(screen.getAllByText("settings:autoCleanup.strategy.basedOnCount.label").length).toBeGreaterThan(0)
	})

	it("renders retention days slider when strategy is based_on_time", () => {
		render(<AutoCleanupSettings autoCleanup={mockAutoCleanup} setCachedStateField={mockSetCachedStateField} />)

		// Check for retention days slider
		expect(screen.getByTestId("retention-days-slider")).toBeInTheDocument()
	})

	it("renders max history count input when strategy is based_on_count", () => {
		const countBasedAutoCleanup = {
			enabled: true,
			strategy: CleanupStrategy.BASED_ON_COUNT,
			retentionDays: 7,
			maxHistoryCount: 50,
			excludeActive: true,
			cleanupOnStartup: true,
		}

		mockUseExtensionState.mockReturnValue({
			autoCleanup: countBasedAutoCleanup,
			setAutoCleanup: vi.fn(),
		} as any)

		render(<AutoCleanupSettings autoCleanup={countBasedAutoCleanup} setCachedStateField={mockSetCachedStateField} />)

		// Check for max history count input
		expect(screen.getByTestId("max-history-count-input")).toBeInTheDocument()
	})

	it("renders exclude active task checkbox", () => {
		render(<AutoCleanupSettings autoCleanup={mockAutoCleanup} setCachedStateField={mockSetCachedStateField} />)

		expect(screen.getByTestId("exclude-active-task-checkbox")).toBeInTheDocument()
	})

	it("renders cleanup on startup checkbox", () => {
		render(<AutoCleanupSettings autoCleanup={mockAutoCleanup} setCachedStateField={mockSetCachedStateField} />)

		expect(screen.getByTestId("cleanup-on-startup-checkbox")).toBeInTheDocument()
	})
})
