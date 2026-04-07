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
					{ id: "recommended", label: "Recommended choice", recommended: true },
					{ id: "other", label: "Other choice" },
				],
			},
		],
	}

	const noRecommendedData = {
		title: "Questionnaire",
		questions: [
			{
				id: "q1",
				prompt: "Pick one",
				options: [
					{ id: "first", label: "First choice", recommended: false },
					{ id: "second", label: "Second choice", recommended: false },
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

	it("falls back to the first option when no option is recommended", () => {
		const onSubmit = vi.fn()
		renderWithProviders(<MultipleChoiceForm data={noRecommendedData as any} onSubmit={onSubmit} />)

		fireEvent.click(screen.getByRole("button", { name: "chat:multipleChoice.confirm" }))

		expect(onSubmit).toHaveBeenCalledWith({
			q1: {
				selectedOptionIds: ["first"],
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

	it("clears custom answer when a single-select question switches back to a normal option", () => {
		const onSubmit = vi.fn()
		renderWithProviders(<MultipleChoiceForm data={data} onSubmit={onSubmit} />)

		fireEvent.click(screen.getByText("chat:multipleChoice.customAnswer"))
		fireEvent.change(screen.getByPlaceholderText("chat:multipleChoice.customAnswerPlaceholder"), {
			target: { value: "Custom plan" },
		})
		fireEvent.click(screen.getByText(/Other choice/))
		fireEvent.click(screen.getByRole("button", { name: "chat:multipleChoice.confirm" }))

		expect(onSubmit).toHaveBeenCalledWith({
			q1: {
				selectedOptionIds: ["other"],
				customAnswer: undefined,
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

	it("keeps the countdown outside the scroll container", () => {
		const onSubmit = vi.fn()
		renderWithProviders(<MultipleChoiceForm data={data} onSubmit={onSubmit} />, {
			autoApprovalEnabled: true,
			alwaysAllowFollowupQuestions: true,
			followupAutoApproveTimeoutMs: 2000,
		})

		const countdown = screen.getByText(/chat:multipleChoice.autoSelectCountdown/)
		expect(countdown.parentElement).not.toHaveClass("overflow-y-auto")
	})

	it("stops countdown when a normal option is clicked", () => {
		vi.useFakeTimers()
		const onSubmit = vi.fn()
		renderWithProviders(<MultipleChoiceForm data={data} onSubmit={onSubmit} />, {
			autoApprovalEnabled: true,
			alwaysAllowFollowupQuestions: true,
			followupAutoApproveTimeoutMs: 2000,
		})

		expect(screen.getByText(/chat:multipleChoice.autoSelectCountdown/)).toBeInTheDocument()
		fireEvent.click(screen.getByText(/Other choice/))
		expect(screen.queryByText(/chat:multipleChoice.autoSelectCountdown/)).not.toBeInTheDocument()

		act(() => {
			vi.advanceTimersByTime(2000)
		})

		expect(onSubmit).not.toHaveBeenCalled()
		vi.useRealTimers()
	})

	it("calls onCancelAutoApproval when the user manually interacts or auto-approval is toggled off", () => {
		vi.useFakeTimers()
		const onSubmit = vi.fn()
		const onCancelAutoApproval = vi.fn()
		const { rerender } = renderWithProviders(
			<MultipleChoiceForm data={data} onSubmit={onSubmit} onCancelAutoApproval={onCancelAutoApproval} />,
			{
				autoApprovalEnabled: true,
				alwaysAllowFollowupQuestions: true,
				followupAutoApproveTimeoutMs: 2000,
			},
		)

		fireEvent.click(screen.getByText(/Other choice/))
		expect(onCancelAutoApproval).toHaveBeenCalled()

		rerender(
			<TestExtensionStateProvider
				value={{
					autoApprovalEnabled: false,
					alwaysAllowFollowupQuestions: true,
					followupAutoApproveTimeoutMs: 2000,
				}}>
				<MultipleChoiceForm data={data} onSubmit={onSubmit} onCancelAutoApproval={onCancelAutoApproval} />
			</TestExtensionStateProvider>,
		)

		expect(onCancelAutoApproval).toHaveBeenCalled()
		vi.useRealTimers()
	})

	it("hides and stops countdown when the form becomes answered or stale", () => {
		vi.useFakeTimers()
		const onSubmit = vi.fn()
		const { rerender } = renderWithProviders(
			<MultipleChoiceForm data={data} onSubmit={onSubmit} isAnswered={false} />,
			{
				autoApprovalEnabled: true,
				alwaysAllowFollowupQuestions: true,
				followupAutoApproveTimeoutMs: 2000,
			},
		)

		expect(screen.getByText(/chat:multipleChoice.autoSelectCountdown/)).toBeInTheDocument()

		rerender(
			<TestExtensionStateProvider
				value={{
					autoApprovalEnabled: true,
					alwaysAllowFollowupQuestions: true,
					followupAutoApproveTimeoutMs: 2000,
				}}>
				<MultipleChoiceForm data={data} onSubmit={onSubmit} isAnswered={true} />
			</TestExtensionStateProvider>,
		)

		expect(screen.queryByText(/chat:multipleChoice.autoSelectCountdown/)).not.toBeInTheDocument()

		act(() => {
			vi.advanceTimersByTime(2000)
		})

		expect(onSubmit).not.toHaveBeenCalled()
		vi.useRealTimers()
	})

	it("does not start countdown when alwaysAllowFollowupQuestions is false", () => {
		const onSubmit = vi.fn()
		renderWithProviders(<MultipleChoiceForm data={data} onSubmit={onSubmit} />, {
			autoApprovalEnabled: true,
			alwaysAllowFollowupQuestions: false,
		})

		expect(screen.queryByText(/chat:multipleChoice.autoSelectCountdown/)).not.toBeInTheDocument()
	})
})
