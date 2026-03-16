import React from "react"
import { render, screen } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ClineMessage } from "@roo-code/types"
import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { ChatRowContent } from "../ChatRow"

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	initReactI18next: { type: "3rdParty", init: () => {} },
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
		i18n: { t: (key: string) => key },
	}),
}))

vi.mock("@src/components/common/CodeBlock", () => ({
	default: () => null,
}))

const queryClient = new QueryClient()

function renderChatRow(message: ClineMessage) {
	return render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ChatRowContent
					message={message}
					isExpanded={false}
					isLast={true}
					isStreaming={true}
					onToggleExpand={() => {}}
					onSuggestionClick={() => {}}
					onMultipleChoiceSubmit={() => {}}
					onBatchFileResponse={() => {}}
					onFollowUpUnmount={() => {}}
					isFollowUpAnswered={false}
					isMultipleChoiceAnswered={false}
				/>
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ChatRow - partial multiple choice rendering", () => {
	it("renders the questionnaire form as soon as partial multiple_choice JSON is valid", () => {
		const message: ClineMessage = {
			type: "ask",
			ask: "multiple_choice",
			ts: Date.now(),
			partial: true,
			text: JSON.stringify({
				title: "Questionnaire",
				questions: [
					{
						id: "question_1",
						prompt: "What calculator type do you want?",
						options: [
							{ id: "opt_1", label: "CLI" },
							{ id: "opt_2", label: "GUI" },
						],
						allow_multiple: false,
					},
				],
			}),
		}

		renderChatRow(message)

		expect(screen.getByText("What calculator type do you want?")).toBeInTheDocument()
		expect(screen.getByText("CLI")).toBeInTheDocument()
		expect(screen.getByText("GUI")).toBeInTheDocument()
		expect(screen.queryByText("chat:multipleChoice.loading")).not.toBeInTheDocument()
	})
})
