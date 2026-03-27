import { useEffect, useRef } from "react"
import { render, screen, act, fireEvent } from "@/utils/test-utils"
import { copyToClipboard } from "@/utils/clipboard"
import { vscode } from "@/utils/vscode"

import { CostrictCliView } from "../CostrictCliView"

const terminalState = {
	customKeyEventHandler: undefined as undefined | ((event: KeyboardEvent) => boolean),
	selection: "",
	textarea: undefined as HTMLTextAreaElement | undefined,
	write: vi.fn(),
}

vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("@/utils/clipboard", () => ({
	copyToClipboard: vi.fn().mockResolvedValue(true),
}))

vi.mock("@xterm/xterm", () => ({
	Terminal: class MockTerminal {
		cols = 80
		rows = 24
		parser = {
			registerCsiHandler: vi.fn(),
		}
		unicode = {
			activeVersion: "",
		}
		textarea = document.createElement("textarea")

		constructor() {
			terminalState.textarea = this.textarea
		}

		loadAddon() {}
		open(container: HTMLElement) {
			container.appendChild(this.textarea)
		}
		focus() {}
		reset() {}
		write = terminalState.write
		dispose() {}
		onData() {
			return { dispose() {} }
		}
		onResize() {
			return { dispose() {} }
		}
		getSelection() {
			return terminalState.selection ?? ""
		}
		attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
			terminalState.customKeyEventHandler = handler
		}
	},
}))

vi.mock("@xterm/addon-fit", () => ({
	FitAddon: class MockFitAddon {
		fit() {}
	},
}))

vi.mock("@xterm/addon-web-links", () => ({
	WebLinksAddon: class MockWebLinksAddon {},
}))

vi.mock("@xterm/addon-unicode11", () => ({
	Unicode11Addon: class MockUnicode11Addon {},
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeProgressRing: () => <div>loading</div>,
}))

let alertDialogOnOpenChange: ((open: boolean) => void) | undefined

vi.mock("@/components/ui", () => ({
	AlertDialog: ({ children, open, onOpenChange }: any) => {
		alertDialogOnOpenChange = onOpenChange
		return open ? (
			<div data-testid="restart-confirm-dialog" role="alertdialog">
				{children}
			</div>
		) : null
	},
	AlertDialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
	AlertDialogDescription: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
	AlertDialogCancel: ({ children, onClick, autoFocus, ...props }: any) => {
		const buttonRef = useRef<HTMLButtonElement>(null)

		useEffect(() => {
			if (autoFocus) {
				buttonRef.current?.focus()
			}
		}, [autoFocus])

		return (
			<button
				ref={buttonRef}
				type="button"
				onClick={() => {
					onClick?.()
					alertDialogOnOpenChange?.(false)
				}}
				{...props}>
				{children}
			</button>
		)
	},
	AlertDialogAction: ({ children, onClick, ...props }: any) => (
		<button type="button" onClick={onClick} {...props}>
			{children}
		</button>
	),
}))

describe("CostrictCliView", () => {
	beforeEach(() => {
		vi.useRealTimers()
		vi.clearAllMocks()
		terminalState.customKeyEventHandler = undefined
		terminalState.selection = ""
		terminalState.textarea = undefined
		Reflect.deleteProperty(window as any, "isJetbrainsPlatform")
		terminalState.write.mockReset()
	})

	it("renders CoStrict CLI header and starting state", () => {
		render(<CostrictCliView isHidden={false} />)

		expect(screen.getAllByText("common:costrictCli.title").length).toBeGreaterThan(0)
		expect(screen.getAllByText("common:costrictCli.status.starting").length).toBeGreaterThan(0)
	})

	it("shows ready state after http ready message", async () => {
		render(<CostrictCliView isHidden={false} />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "CostrictCliHttpReady" },
				}),
			)
		})

		expect(screen.getByRole("region", { name: "common:costrictCli.aria.terminalPanel" })).toHaveAttribute(
			"aria-busy",
			"false",
		)
		expect(screen.getByRole("application", { name: "common:costrictCli.aria.terminal" })).toHaveAttribute(
			"aria-busy",
			"false",
		)
		expect(screen.queryByText("common:costrictCli.loading.description")).not.toBeInTheDocument()
		expect(screen.queryByText("common:costrictCli.status.starting")).not.toBeInTheDocument()
	})

	it("opens a restart confirmation dialog before sending restart", () => {
		render(<CostrictCliView isHidden={false} />)

		fireEvent.click(screen.getByRole("button", { name: "common:costrictCli.actions.restart" }))

		expect(screen.getByTestId("restart-confirm-dialog")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.restartConfirm.title")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "common:answers.cancel" })).toBeInTheDocument()
		expect(vscode.postMessage).not.toHaveBeenCalledWith({ type: "CostrictCliRestart" })
	})

	it("posts restart after confirm and shows restarting state", async () => {
		render(<CostrictCliView isHidden={false} />)

		fireEvent.click(screen.getByRole("button", { name: "common:costrictCli.actions.restart" }))
		fireEvent.click(screen.getByRole("button", { name: "common:costrictCli.restartConfirm.confirm" }))

		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "CostrictCliRestart" })
		expect(screen.queryByTestId("restart-confirm-dialog")).not.toBeInTheDocument()
		expect(screen.getByRole("region", { name: "common:costrictCli.aria.terminalPanel" })).toHaveAttribute(
			"aria-busy",
			"true",
		)
		expect(await screen.findByText("common:costrictCli.status.restarting")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.loading.description")).toBeInTheDocument()
	})

	it("closes the restart confirmation dialog when cancelled without restarting", () => {
		render(<CostrictCliView isHidden={false} />)

		const restartButton = screen.getByRole("button", { name: "common:costrictCli.actions.restart" })
		fireEvent.click(restartButton)
		fireEvent.click(screen.getByRole("button", { name: "common:answers.cancel" }))

		expect(screen.queryByTestId("restart-confirm-dialog")).not.toBeInTheDocument()
		expect(vscode.postMessage).not.toHaveBeenCalledWith({ type: "CostrictCliRestart" })
	})

	it("renders an accessible restart control", () => {
		render(<CostrictCliView isHidden={false} />)

		expect(screen.getByRole("button", { name: "common:costrictCli.actions.restart" })).toHaveAttribute(
			"aria-haspopup",
			"dialog",
		)
	})

	it("announces loading state on the terminal region", () => {
		render(<CostrictCliView isHidden={false} />)

		expect(screen.getByRole("region", { name: "common:costrictCli.aria.terminalPanel" })).toHaveAttribute(
			"aria-busy",
			"true",
		)
		expect(screen.getAllByRole("status")[0]).toHaveTextContent("common:costrictCli.loading.description")
	})

	it("shows an exited state with restart entrypoint after cli exit", () => {
		render(<CostrictCliView isHidden={false} />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "CostrictCliExit" },
				}),
			)
		})

		expect(screen.getByText("common:costrictCli.status.exited")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.exited.title")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.exited.description")).toBeInTheDocument()
		expect(screen.getAllByRole("button", { name: "common:costrictCli.actions.restart" })).toHaveLength(2)
		expect(screen.getByRole("region", { name: "common:costrictCli.aria.terminalPanel" })).toHaveAttribute(
			"aria-busy",
			"false",
		)
		expect(screen.getByRole("application", { name: "common:costrictCli.aria.terminal" })).toHaveAttribute(
			"aria-busy",
			"false",
		)
		expect(terminalState.write).toHaveBeenCalledWith(
			"\r\n\x1b[33m[common:costrictCli.exited.terminalMessage]\x1b[0m\r\n",
		)
	})

	it("reuses restart confirmation from the exited state", () => {
		render(<CostrictCliView isHidden={false} />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "CostrictCliExit" },
				}),
			)
		})

		fireEvent.click(screen.getAllByRole("button", { name: "common:costrictCli.actions.restart" })[1])

		expect(screen.getByTestId("restart-confirm-dialog")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.restartConfirm.title")).toBeInTheDocument()
		expect(vscode.postMessage).not.toHaveBeenCalledWith({ type: "CostrictCliRestart" })
	})

	it("shows a styled inline toast when a file path is inserted into CoStrict CLI", () => {
		vi.useFakeTimers()
		render(<CostrictCliView isHidden={false} />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "CostrictCliToast", text: "File path inserted into CoStrict CLI" },
				}),
			)
		})

		const toast = screen.getByText("File path inserted into CoStrict CLI").closest("[role='status']")
		expect(toast).not.toBeNull()
		expect(toast).toHaveTextContent("common:costrictCli.title")
		expect(toast?.firstElementChild).toHaveClass("rounded-xl")
		expect(toast?.firstElementChild).toHaveClass("backdrop-blur-sm")
		expect(toast?.querySelector(".codicon.codicon-check")).toBeInTheDocument()

		act(() => {
			vi.advanceTimersByTime(2200)
		})

		expect(screen.queryByText("File path inserted into CoStrict CLI")).not.toBeInTheDocument()
	})

	it("shows compact retry-focused guidance for generic startup errors", () => {
		render(<CostrictCliView isHidden={false} />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "CostrictCliError",
						error: "Failed to start CLI",
						values: { kind: "start-failed" },
					},
				}),
			)
		})

		expect(screen.getByText("common:costrictCli.startError.genericTitle")).toBeInTheDocument()
		expect(screen.getByText("Failed to start CLI")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.startError.retryHint")).toBeInTheDocument()
		expect(screen.queryAllByRole("button", { name: "common:costrictCli.actions.restart" })).toHaveLength(2)
		expect(screen.queryByRole("alert")).not.toBeInTheDocument()
		expect(screen.queryByText("common:costrictCli.startError.suggestionsTitle")).not.toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: "common:costrictCli.startError.installLink" }),
		).not.toBeInTheDocument()
		expect(terminalState.write).toHaveBeenCalledWith("\r\n\x1b[31mError: Failed to start CLI\x1b[0m\r\n")
	})

	it("shows install guidance when CoStrict CLI is missing", () => {
		render(<CostrictCliView isHidden={false} />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "CostrictCliError",
						error: "CoStrict CLI was not found on this machine.",
						values: {
							kind: "missing-cli",
							docsUrl: "https://docs.costrict.ai/en/cli/guide/installation",
						},
					},
				}),
			)
		})

		expect(screen.getByText("common:costrictCli.startError.missingCliTitle")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.startError.missingCliDescription")).toBeInTheDocument()
		expect(screen.queryByText("common:costrictCli.startError.missingCliHint")).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "common:costrictCli.startError.installLink" })).toBeInTheDocument()
		expect(screen.queryAllByRole("button", { name: "common:costrictCli.actions.restart" })).toHaveLength(1)
		expect(screen.queryByText("CoStrict CLI was not found on this machine.")).not.toBeInTheDocument()
		expect(terminalState.write).not.toHaveBeenCalledWith(
			"\r\n\x1b[31mError: CoStrict CLI was not found on this machine.\x1b[0m\r\n",
		)
		fireEvent.click(screen.getByRole("button", { name: "common:costrictCli.startError.installLink" }))
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "openExternal",
			url: "https://docs.costrict.ai/en/cli/guide/installation",
		})
	})

	it("shows startup timeout guidance with retry action only", () => {
		render(<CostrictCliView isHidden={false} />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "CostrictCliHttpReady",
						values: {
							ready: false,
							kind: "startup-timeout",
							docsUrl: "https://docs.costrict.ai/en/cli/guide/installation",
						},
					},
				}),
			)
		})

		expect(screen.getByText("common:costrictCli.startError.genericTitle")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.startError.startupTimeoutDescription")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.startError.startupTimeout")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.startError.retryHint")).toBeInTheDocument()
		expect(screen.queryAllByRole("button", { name: "common:costrictCli.actions.restart" })).toHaveLength(2)
		expect(
			screen.queryByRole("button", { name: "common:costrictCli.startError.installLink" }),
		).not.toBeInTheDocument()
	})

	it("does not render the toast while the CLI tab is hidden", () => {
		vi.useFakeTimers()
		render(<CostrictCliView isHidden={true} />)

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "CostrictCliToast", text: "File path inserted into CoStrict CLI" },
				}),
			)
		})

		expect(screen.queryByRole("status")).not.toBeInTheDocument()
	})

	it("waits for the DOM paste event in VS Code instead of scheduling an extension fallback", () => {
		vi.useFakeTimers()
		try {
			render(<CostrictCliView isHidden={false} />)

			expect(terminalState.customKeyEventHandler).toBeDefined()

			const event = new KeyboardEvent("keydown", {
				key: "v",
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			})
			const preventDefaultSpy = vi.spyOn(event, "preventDefault")

			const result = terminalState.customKeyEventHandler?.(event)

			expect(result).toBe(false)
			expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
			expect(vscode.postMessage).not.toHaveBeenCalled()

			vi.runOnlyPendingTimers()

			expect(vscode.postMessage).not.toHaveBeenCalled()
			expect(vi.mocked(copyToClipboard)).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	it("falls back to extension clipboard paste in JetBrains when no DOM paste event arrives", () => {
		vi.useFakeTimers()
		try {
			Object.assign(window as any, { isJetbrainsPlatform: true })
			render(<CostrictCliView isHidden={false} />)

			expect(terminalState.customKeyEventHandler).toBeDefined()

			const event = new KeyboardEvent("keydown", {
				key: "v",
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			})
			const preventDefaultSpy = vi.spyOn(event, "preventDefault")

			const result = terminalState.customKeyEventHandler?.(event)

			expect(result).toBe(false)
			expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
			expect(vscode.postMessage).not.toHaveBeenCalled()

			vi.runOnlyPendingTimers()

			expect(vscode.postMessage).toHaveBeenCalledWith({ type: "CostrictCliRequestPaste" })
			expect(vi.mocked(copyToClipboard)).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	it("routes Ctrl+Z through the stop flow so the CLI can enter the exited state", () => {
		render(<CostrictCliView isHidden={false} />)

		const event = new KeyboardEvent("keydown", {
			key: "z",
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		})
		const preventDefaultSpy = vi.spyOn(event, "preventDefault")

		const result = terminalState.customKeyEventHandler?.(event)

		expect(result).toBe(false)
		expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "CostrictCliStop",
			values: { signal: "SIGKILL" },
		})
		expect(vi.mocked(copyToClipboard)).not.toHaveBeenCalled()

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "CostrictCliExit" },
				}),
			)
		})

		expect(screen.getByText("common:costrictCli.status.exited")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.exited.title")).toBeInTheDocument()
		expect(screen.getByText("common:costrictCli.exited.description")).toBeInTheDocument()
		expect(terminalState.write).toHaveBeenCalledWith(
			"\r\n\x1b[33m[common:costrictCli.exited.terminalMessage]\x1b[0m\r\n",
		)
	})

	it("passes Ctrl+C through when there is no selection", () => {
		render(<CostrictCliView isHidden={false} />)

		const event = new KeyboardEvent("keydown", {
			key: "c",
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		})

		const result = terminalState.customKeyEventHandler?.(event)

		expect(result).toBe(true)
		expect(vscode.postMessage).not.toHaveBeenCalled()
		expect(vi.mocked(copyToClipboard)).not.toHaveBeenCalled()
	})

	it("copies selected text once when Ctrl+X is pressed with selection", () => {
		terminalState.selection = "selected text"
		render(<CostrictCliView isHidden={false} />)

		const event = new KeyboardEvent("keydown", {
			key: "x",
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		})
		const preventDefaultSpy = vi.spyOn(event, "preventDefault")

		const result = terminalState.customKeyEventHandler?.(event)

		expect(result).toBe(false)
		expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
		expect(vi.mocked(copyToClipboard)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(copyToClipboard)).toHaveBeenCalledWith("selected text")
		expect(vscode.postMessage).not.toHaveBeenCalled()
	})

	it("closes the restart confirmation dialog after confirming restart", () => {
		render(<CostrictCliView isHidden={false} />)

		const restartButton = screen.getByRole("button", { name: "common:costrictCli.actions.restart" })
		fireEvent.click(restartButton)
		fireEvent.click(screen.getByRole("button", { name: "common:costrictCli.restartConfirm.confirm" }))

		expect(screen.queryByTestId("restart-confirm-dialog")).not.toBeInTheDocument()
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "CostrictCliRestart" })
	})

	it("uses pasted clipboard text and cancels the keyboard fallback when DOM paste arrives", () => {
		vi.useFakeTimers()
		try {
			render(<CostrictCliView isHidden={false} />)

			const keydownEvent = new KeyboardEvent("keydown", {
				key: "v",
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			})
			terminalState.customKeyEventHandler?.(keydownEvent)

			const pasteEvent = new Event("paste", { bubbles: true, cancelable: true })
			Object.defineProperty(pasteEvent, "clipboardData", {
				value: { getData: vi.fn(() => "pasted from dom") },
			})
			const preventDefaultSpy = vi.spyOn(pasteEvent, "preventDefault")
			const stopImmediatePropagationSpy = vi.spyOn(pasteEvent, "stopImmediatePropagation")

			terminalState.textarea?.dispatchEvent(pasteEvent)
			vi.runOnlyPendingTimers()

			expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
			expect(stopImmediatePropagationSpy).toHaveBeenCalledTimes(1)
			expect(vscode.postMessage).toHaveBeenCalledTimes(1)
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "CostrictCliInput",
				data: "\x1b[200~pasted from dom\x1b[201~",
			})
			expect(vi.mocked(copyToClipboard)).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	it("intercepts cut events so they do not fall through to the native clipboard chain", () => {
		terminalState.selection = "selected text"
		render(<CostrictCliView isHidden={false} />)

		const cutEvent = new Event("cut", { bubbles: true, cancelable: true })
		const preventDefaultSpy = vi.spyOn(cutEvent, "preventDefault")
		const stopPropagationSpy = vi.spyOn(cutEvent, "stopPropagation")

		terminalState.textarea?.dispatchEvent(cutEvent)

		expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
		expect(stopPropagationSpy).toHaveBeenCalledTimes(1)
		expect(vi.mocked(copyToClipboard)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(copyToClipboard)).toHaveBeenCalledWith("selected text")
		expect(vscode.postMessage).not.toHaveBeenCalled()
	})
})
