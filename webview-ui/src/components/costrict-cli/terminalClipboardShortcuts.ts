export type TerminalClipboardAction = "none" | "paste" | "copy-selection"

export const getTerminalClipboardAction = (event: KeyboardEvent, selection: string): TerminalClipboardAction => {
	if (event.type !== "keydown" || event.altKey) {
		return "none"
	}

	const isCtrlOrMeta = event.ctrlKey || event.metaKey
	const key = event.key.toLowerCase()

	if ((event.shiftKey && key === "insert") || (isCtrlOrMeta && key === "v")) {
		return "paste"
	}

	if (!selection) {
		return "none"
	}

	// 终端无法删除已输出内容，Ctrl+X 与 Ctrl+C 行为等价，统一返回 copy-selection
	if (
		(isCtrlOrMeta && key === "c") ||
		(event.ctrlKey && key === "insert") ||
		(isCtrlOrMeta && key === "x") ||
		(event.shiftKey && key === "delete")
	) {
		return "copy-selection"
	}

	return "none"
}
