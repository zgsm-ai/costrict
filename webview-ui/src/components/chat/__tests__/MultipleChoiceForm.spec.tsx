import React, { createContext, useContext } from "react"
import { fireEvent, render, screen, act } from "@testing-library/react"

import { MultipleChoiceForm } from "../MultipleChoiceForm"

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

interface TestExtensionState {
	autoApprovalEnabled: boolean
	alwaysAllowFollowupQuestions: boolean
	followupAutoApproveTimeoutMs: number
}

const TestExtensionStateContext = createContext<TestExtensionState | undefined>(undefined)

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => {
		const context = useContext(TestExtensionStateContext)
		if (!context) {
			throw new Error("useExtensionState must be used within TestExtensionStateProvider")
		}
		return context
	},
}))

const TestExtensionStateProvider: React.FC<{ children: React.ReactNode; value: TestExtensionState }> = ({
	children,
	value,
}) => <TestExtensionStateContext.Provider value={value}>{children}</TestExtensionStateContext.Provider>

const renderWithProviders = (component: React.ReactElement, extensionState?: Partial<TestExtensionState>) => {
	return render(
		<TestExtensionStateProvider
			value={{
				autoApprovalEnabled: false,
				alwaysAllowFollowupQuestions: false,
				followupAutoApproveTimeoutMs: 3000,
				...extensionState,
			}}>
			{component}
		</TestExtensionStateProvider>,
	)
}

describe("MultipleChoiceForm", () => {
	const data = {
		title: "Questionnaire",
		questions: [
			{
				id: "q1",
				prompt: "Pick one",
				options: [
					{ id: "recommended", label: "Recommended choice (Recommended)" },
					{ id: "other", label: "Other choice" },
				],
			},
		],
	}

	it("defaults to selecting the first option", () => {
		const onSubmit = vi.fn()
		renderWithProviders(<MultipleChoiceForm data={data} onSubmit={onSubmit} />)

		fireEvent.click(screen.getByRole("button", { name: "chat:multipleChoice.confirm" }))

		expect(onSubmit).toHaveBeenCalledWith({
			q1: {
				selectedOptionIds: ["recommended"],
			},
		})
	})

	it("shows custom input and includes custom answer in submission", () => {
		const onSubmit = vi.fn()
		renderWithProviders(<MultipleChoiceForm data={data} onSubmit={onSubmit} />)

		fireEvent.click(screen.getByText("chat:multipleChoice.customAnswer"))
		expect(screen.getByText("chat:multipleChoice.customAnswerRequired")).toBeInTheDocument()

		fireEvent.change(screen.getByPlaceholderText("chat:multipleChoice.customAnswerPlaceholder"), {
			target: { value: "Custom plan" },
		})
		expect(screen.queryByText("chat:multipleChoice.customAnswerRequired")).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "chat:multipleChoice.confirm" }))

		expect(onSubmit).toHaveBeenCalledWith({
			q1: {
				selectedOptionIds: [],
				customAnswer: "Custom plan",
			},
		})
	})

	it("auto-submits default recommended selections during countdown", () => {
		vi.useFakeTimers()
		const onSubmit = vi.fn()
		renderWithProviders(<MultipleChoiceForm data={data} onSubmit={onSubmit} />, {
			autoApprovalEnabled: true,
			alwaysAllowFollowupQuestions: true,
			followupAutoApproveTimeoutMs: 2000,
		})

		expect(screen.getByText(/chat:multipleChoice.autoSelectCountdown/)).toBeInTheDocument()

		act(() => {
			vi.advanceTimersByTime(2000)
		})

		expect(onSubmit).toHaveBeenCalledWith({
			q1: {
				selectedOptionIds: ["recommended"],
			},
		})
		vi.useRealTimers()
	})

	it("starts countdown when only autoApprovalEnabled is true", () => {
		const onSubmit = vi.fn()
		renderWithProviders(<MultipleChoiceForm data={data} onSubmit={onSubmit} />, {
			autoApprovalEnabled: true,
			alwaysAllowFollowupQuestions: false,
		})

		expect(screen.getByText(/chat:multipleChoice.autoSelectCountdown/)).toBeInTheDocument()
	})
})
