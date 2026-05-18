import React from "react"
import { render, screen, act, fireEvent } from "@testing-library/react"

import { McpExecution } from "../McpExecution"

// Mock react-i18next
vi.mock("react-i18next", async () => {
	const actual = await vi.importActual<typeof import("react-i18next")>("react-i18next")
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
			i18n: { language: "en" },
		}),
	}
})

// Mock react-use so useEvent attaches real window listeners in jsdom
vi.mock("react-use", () => ({
	useEvent: (eventName: string, handler: (event: MessageEvent) => void) => {
		React.useEffect(() => {
			const wrapped = (e: Event) => handler(e as MessageEvent)
			window.addEventListener(eventName, wrapped)
			return () => window.removeEventListener(eventName, wrapped)
		}, [eventName, handler])
	},
}))

// Mock dependencies
vi.mock("../common/CodeBlock", () => ({
	default: ({ source }: { source: string }) => <div data-testid="code-block">{source}</div>,
}))

vi.mock("../mcp/McpToolRow", () => ({
	default: () => <div data-testid="mcp-tool-row" />,
}))

vi.mock("./Markdown", () => ({
	Markdown: ({ markdown }: { markdown: string }) => <div data-testid="markdown">{markdown}</div>,
}))

describe("McpExecution", () => {
	it("renders polling status with truncated taskId", () => {
		render(<McpExecution executionId="e1" />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "mcpExecutionStatus",
						text: JSON.stringify({ executionId: "e1", status: "polling", taskId: "abcdef1234567890" }),
					},
				}),
			)
		})

		expect(screen.getByText(/execution.polling/)).toBeInTheDocument()
		expect(screen.getAllByText(/abcdef123456/)).toHaveLength(2)
	})

	it("renders stopped_waiting with reason", () => {
		render(<McpExecution executionId="e1" />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "mcpExecutionStatus",
						text: JSON.stringify({
							executionId: "e1",
							status: "stopped_waiting",
							reason: "user_cancelled",
						}),
					},
				}),
			)
		})

		expect(screen.getByText(/execution.stoppedWaiting/)).toBeInTheDocument()
	})

	it("shows copyable taskId and elapsed time during polling", async () => {
		const writeText = vi.fn()
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })

		render(<McpExecution executionId="e1" />)
		// started
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "mcpExecutionStatus",
						text: JSON.stringify({
							executionId: "e1",
							status: "started",
							serverName: "ci",
							toolName: "deploy",
						}),
					},
				}),
			)
		})
		// first poll
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "mcpExecutionStatus",
						text: JSON.stringify({
							executionId: "e1",
							status: "polling",
							taskId: "T-abc-12345",
							attempt: 1,
							lastStatus: "running",
							lastCheckedAt: Date.now(),
						}),
					},
				}),
			)
		})

		const copyBtn = await screen.findByLabelText(/execution.copyTaskId/i)
		act(() => {
			fireEvent.click(copyBtn)
		})
		expect(writeText).toHaveBeenCalledWith("T-abc-12345")
		expect(screen.getByText(/running/)).toBeInTheDocument()
	})
})
