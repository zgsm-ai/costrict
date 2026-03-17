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
	})

	it("posts a paste request when Ctrl+V is pressed in the terminal", () => {
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
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "CostrictCliRequestPaste" })
		expect(vi.mocked(copyToClipboard)).not.toHaveBeenCalled()
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

	it("intercepts paste events so only the custom paste chain runs", () => {
		render(<CostrictCliView isHidden={false} />)

		const pasteEvent = new Event("paste", { bubbles: true, cancelable: true })
		const preventDefaultSpy = vi.spyOn(pasteEvent, "preventDefault")
		const stopPropagationSpy = vi.spyOn(pasteEvent, "stopPropagation")

		terminalState.textarea?.dispatchEvent(pasteEvent)

		expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
		expect(stopPropagationSpy).toHaveBeenCalledTimes(1)
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "CostrictCliRequestPaste" })
		expect(vi.mocked(copyToClipboard)).not.toHaveBeenCalled()
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
