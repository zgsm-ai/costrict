import React from "react"
import { render, screen, act, fireEvent } from "@testing-library/react"

import { ExtensionStateContext } from "../../../context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

import { McpExecution } from "../McpExecution"

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

function renderWithState(state: any, children: React.ReactNode) {
	return render(<ExtensionStateContext.Provider value={state}>{children}</ExtensionStateContext.Provider>)
}

const defaultState = { mcpAsyncTaskRecords: [] }

// Mock react-i18next
vi.mock("react-i18next", async () => {
	const actual = await vi.importActual<typeof import("react-i18next")>("react-i18next")
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => {
				if (key === "execution.continueQuery") return "Continue query"
				return key
			},
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
		renderWithState(defaultState, <McpExecution executionId="e1" />)

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
		renderWithState(defaultState, <McpExecution executionId="e1" />)

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

		renderWithState(defaultState, <McpExecution executionId="e1" />)
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

	it("renders 'Continue Query' button when a matching async task record exists", async () => {
		const state = {
			mcpAsyncTaskRecords: [
				{
					id: "r1",
					executionId: "e1",
					serverName: "ci",
					originalToolName: "deploy",
					taskId: "T-xyz",
					lastStatus: "running",
				},
			],
		}
		renderWithState(state, <McpExecution executionId="e1" />)
		expect(await screen.findByRole("button", { name: /continue query|继续查询/i })).toBeInTheDocument()
		expect(screen.getByText(/T-xyz/)).toBeInTheDocument()
	})

	it("disables 'Continue Query' for terminal records that already returned a result", () => {
		const state = {
			mcpAsyncTaskRecords: [
				{
					id: "r1",
					executionId: "e2",
					serverName: "ci",
					originalToolName: "deploy",
					taskId: "T",
					terminalStatus: "completed",
					resultFetchedAt: 1,
				},
			],
		}
		renderWithState(state, <McpExecution executionId="e2" />)
		const btn = screen.getByRole("button", { name: /continue query|继续查询/i })
		expect(btn).toBeDisabled()
	})

	it("posts queryMcpAsyncTask message on click", async () => {
		;(vscode.postMessage as any).mockClear()

		const state = {
			mcpAsyncTaskRecords: [
				{ id: "r1", executionId: "e1", serverName: "ci", originalToolName: "deploy", taskId: "T" },
			],
		}
		renderWithState(state, <McpExecution executionId="e1" />)
		fireEvent.click(await screen.findByRole("button", { name: /continue query|继续查询/i }))
		expect(vscode.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({ type: "queryMcpAsyncTask", recordId: "r1" }),
		)
	})

	describe("narrow-width layout", () => {
		it("polling metadata container has flex-wrap, min-w-0, and max-w-full", () => {
			renderWithState(defaultState, <McpExecution executionId="e1" />)
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

			const codeEl = document.querySelector("code")
			expect(codeEl).toBeTruthy()
			const container = codeEl!.parentElement!
			expect(container.className).toContain("flex-wrap")
			expect(container.className).toContain("min-w-0")
			expect(container.className).toContain("max-w-full")
		})

		it("long taskId code element has truncate and min-w-0", () => {
			renderWithState(defaultState, <McpExecution executionId="e1" />)
			act(() => {
				window.dispatchEvent(
					new MessageEvent("message", {
						data: {
							type: "mcpExecutionStatus",
							text: JSON.stringify({
								executionId: "e1",
								status: "polling",
								taskId: "very-long-task-id-that-should-truncate-xyz",
								attempt: 1,
								lastStatus: "running",
								lastCheckedAt: Date.now(),
							}),
						},
					}),
				)
			})

			const codeEl = document.querySelector("code")
			expect(codeEl).toBeTruthy()
			expect(codeEl!.className).toContain("truncate")
			expect(codeEl!.className).toContain("min-w-0")
		})

		it("continue query button has min-w-0 to prevent overflow from long taskId", () => {
			const state = {
				mcpAsyncTaskRecords: [
					{
						id: "r1",
						executionId: "e1",
						serverName: "ci",
						originalToolName: "deploy",
						taskId: "extremely-long-task-id-that-should-not-overflow",
						lastStatus: "running",
					},
				],
			}
			renderWithState(state, <McpExecution executionId="e1" />)

			const btn = screen.getByRole("button", { name: /continue query|继续查询/i })
			expect(btn.className).toContain("min-w-0")
			expect(btn.className).toContain("max-w-full")
			const taskIdSpan = btn.querySelector("span")
			expect(taskIdSpan).toBeTruthy()
			expect(taskIdSpan!.className).toContain("truncate")
			expect(taskIdSpan!.className).toContain("inline-block")
			expect(taskIdSpan!.className).toContain("max-w-full")
		})

		it("outer right-side header flex item has min-w-0 to allow shrinking", () => {
			renderWithState(defaultState, <McpExecution executionId="e1" />)
			act(() => {
				window.dispatchEvent(
					new MessageEvent("message", {
						data: {
							type: "mcpExecutionStatus",
							text: JSON.stringify({
								executionId: "e1",
								status: "polling",
								taskId: "T-abc-12345",
							}),
						},
					}),
				)
			})

			const statusText = screen.getByText(/execution\.polling/)
			const innerRow = statusText.parentElement!.parentElement!
			const outerRightSide = innerRow.parentElement!
			expect(outerRightSide.className).toContain("min-w-0")
		})
	})
})
