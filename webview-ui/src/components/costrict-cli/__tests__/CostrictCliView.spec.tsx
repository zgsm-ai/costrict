import { render } from "@/utils/test-utils"
import { copyToClipboard } from "@/utils/clipboard"
import { vscode } from "@/utils/vscode"

import { CostrictCliView } from "../CostrictCliView"

const terminalState = {
	customKeyEventHandler: undefined as undefined | ((event: KeyboardEvent) => boolean),
	selection: "",
	textarea: undefined as HTMLTextAreaElement | undefined,
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
		write() {}
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

describe("CostrictCliView", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		terminalState.customKeyEventHandler = undefined
		terminalState.selection = ""
		terminalState.textarea = undefined
		Reflect.deleteProperty(window as any, "isJetbrainsPlatform")
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
