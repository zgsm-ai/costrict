import { useEffect, useRef, useCallback, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Unicode11Addon } from "@xterm/addon-unicode11"
import { useEvent } from "react-use"
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"
import { copyToClipboard } from "@/utils/clipboard"
import { vscode } from "@/utils/vscode"
import { getTerminalClipboardAction } from "./terminalClipboardShortcuts"
import "@xterm/xterm/css/xterm.css"

interface CostrictCliViewProps {
	isHidden: boolean
}

export const CostrictCliView = ({ isHidden }: CostrictCliViewProps) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<Terminal | null>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const [restartCount, setRestartCount] = useState(0)
	const [isTerminalReady, setIsTerminalReady] = useState(false)

	// Handle messages from extension
	const onMessage = useCallback((e: MessageEvent) => {
		const message = e.data

		if (message.type === "CostrictCliOutput" && message.data) {
			terminalRef.current?.write(message.data)
		}

		if (message.type === "CostrictCliExit") {
			terminalRef.current?.write("\r\n\x1b[33m[Welcome to CoStrict]\x1b[0m\r\n")
		}

		if (message.type === "CostrictCliError" && message.error) {
			terminalRef.current?.write(`\r\n\x1b[31mError: ${message.error}\x1b[0m\r\n`)
		}

		if (message.type === "CostrictCliClear") {
			terminalRef.current?.reset()
		}

		if (message.type === "CostrictCliPasteUnavailable") {
			terminalRef.current?.write("\r\n\x1b[33mClipboard is empty.\x1b[0m\r\n")
		}

		if (message.type === "CostrictCliRestart") {
			// 先重置 isTerminalReady，让 React 立即渲染 loading 动画，
			// 再通过 restartCount 触发 useEffect 重新初始化 xterm。
			// 如果只在 useEffect 内 setIsTerminalReady(false)，React 会在 effect
			// 同步执行完毕后才处理该 setState，此时 xterm 已完成挂载，
			// loading 动画几乎不可见。
			setIsTerminalReady(false)
			setRestartCount((c) => c + 1)
		}
	}, [])

	useEvent("message", onMessage)

	// Initialize terminal
	useEffect(() => {
		setIsTerminalReady(false)
		const container = containerRef.current
		if (!container || terminalRef.current) return

		// Create terminal instance
		const terminal = new Terminal({
			// cursorBlink: true,
			// cursorStyle: "block",
			scrollback: 0,
			allowProposedApi: true,
		})

		// Load addons
		const fitAddon = new FitAddon()

		// activate the new version
		terminal.loadAddon(new WebLinksAddon())
		terminal.loadAddon(fitAddon)
		terminal.loadAddon(new Unicode11Addon())
		terminal.unicode.activeVersion = "11"

		// Open terminal in container
		terminal.open(container)
		terminal.parser.registerCsiHandler({ intermediates: "$", final: "p" }, () => true)
		terminal.parser.registerCsiHandler({ prefix: "?", intermediates: "$", final: "p" }, () => true)

		// Store refs
		terminalRef.current = terminal
		fitAddonRef.current = fitAddon

		// Handle user input - send to extension
		terminal.onData((data) => {
			vscode.postMessage({
				type: "CostrictCliInput",
				data,
			})
		})

		const handleCopySelection = (selection: string) => {
			copyToClipboard(selection)
		}

		terminal.attachCustomKeyEventHandler((event) => {
			const selection = terminal.getSelection()
			const action = getTerminalClipboardAction(event, selection)

			if (action === "none") {
				return true
			}

			event.preventDefault()

			// paste 交由 DOM paste 事件统一处理（见 handlePaste），
			// copy/cut 在 keydown 阶段直接执行，因为 copy/cut 没有对应的 DOM 剪贴板事件可依赖。
			if (action !== "paste" && selection) {
				handleCopySelection(selection)
			}

			return false
		})

		const clipboardTarget = terminal.textarea ?? container
		const handlePaste = (event: Event) => {
			// 必须在捕获阶段（capture: true）且立即阻止后续监听器（stopImmediatePropagation），
			// 否则 xterm 自己注册在同一 textarea 上的 paste 监听器会先于此函数执行，
			// 把剪贴板内容通过 onData 写入 PTY，再加上 CostrictCliRequestPaste 又写一次，
			// 导致文本被粘贴两次。
			event.preventDefault()
			event.stopImmediatePropagation()

			// 优先从 paste 事件的 clipboardData 同步读取，避免异步往返插件端。
			// Ctrl+V 和右键粘贴都会触发 paste 事件，clipboardData 在两种情况下均可用。
			const text = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? ""
			if (text) {
				const PASTE_START = "\x1b[200~"
				const PASTE_END = "\x1b[201~"
				vscode.postMessage({ type: "CostrictCliInput", data: PASTE_START + text + PASTE_END })
				return
			}

			// 兜底：clipboardData 为空时（极少数情况）走插件端读取
			vscode.postMessage({ type: "CostrictCliRequestPaste" })
		}
		const handleCopy = (event: Event) => {
			const selection = terminal.getSelection()
			if (!selection) {
				return
			}

			event.preventDefault()
			event.stopPropagation()
			handleCopySelection(selection)
		}
		const handleCut = (event: Event) => {
			const selection = terminal.getSelection()
			if (!selection) {
				return
			}

			event.preventDefault()
			event.stopPropagation()
			handleCopySelection(selection)
		}

		// capture: true 确保在捕获阶段触发，早于 xterm 注册的冒泡阶段 paste 监听器
		clipboardTarget.addEventListener("paste", handlePaste, { capture: true })
		clipboardTarget.addEventListener("copy", handleCopy)
		clipboardTarget.addEventListener("cut", handleCut)

		// 将鼠标滚轮事件转换为方向键发给 PTY，由 Ink ScrollArea 处理滚动。
		// 原因：cs cli 基于 Ink 的自定义 ScrollArea（marginTop 负值裁切 + 自绘滚动条）。
		// xterm 的 scrollback 已设为 0 以禁用其独立缓冲，但如果不拦截 wheel 事件，
		// xterm 会尝试发送鼠标上报序列（X10/SGR 协议），而 Ink 并不处理这些序列。
		// 转换为 ↑/↓ ANSI 方向键序列后，PTY 直接传给 Ink，触发 ScrollArea 的 SCROLL_UP/DOWN。
		const handleWheel = (e: WheelEvent) => {
			e.preventDefault()
			// 每 100px deltaY 触发一次滚动，至少触发 1 次
			const lines = Math.max(1, Math.round(Math.abs(e.deltaY) / 100))
			// 上箭头: \x1b[A，下箭头: \x1b[B
			const seq = e.deltaY < 0 ? "\x1b[A" : "\x1b[B"
			const data = seq.repeat(lines)
			vscode.postMessage({ type: "CostrictCliInput", data })
		}
		container.addEventListener("wheel", handleWheel, { passive: false })

		// Handle resize
		terminal.onResize(({ cols, rows }) => {
			vscode.postMessage({
				type: "CostrictCliResize",
				cols,
				rows,
			})
		})
		// 延迟 fit，确保 DOM 已渲染完成（重启时 React 的重新渲染需要一帧）
		const rafId = setTimeout(() => {
			fitAddon.fit()
			// Request to start Costrict process with actual terminal dimensions
			vscode.postMessage({
				type: "CostrictCliStart",
				cols: terminal.cols,
				rows: terminal.rows,
			})
			terminal.focus()
			setIsTerminalReady(true)
		}, 1000)

		// Cleanup
		return () => {
			clearTimeout(rafId)
			clipboardTarget.removeEventListener("paste", handlePaste, { capture: true })
			clipboardTarget.removeEventListener("copy", handleCopy)
			clipboardTarget.removeEventListener("cut", handleCut)
			container.removeEventListener("wheel", handleWheel)
			vscode.postMessage({
				type: "CostrictCliStop",
			})
			terminal.dispose()
			terminalRef.current = null
			fitAddonRef.current = null
		}
	}, [restartCount])

	// Handle resize when visibility changes
	useEffect(() => {
		if (!isHidden && terminalRef.current && fitAddonRef.current) {
			// 使用 requestAnimationFrame 确保 DOM 已渲染完成
			requestAnimationFrame(() => {
				// 再次检查，因为状态可能在等待期间改变
				if (terminalRef.current && fitAddonRef.current) {
					// fit() 内部会调用 terminal.resize(cols, rows)，触发 onResize 回调，
					// 自动发送 CostrictCliResize 消息给 PTY，无需额外 postMessage。
					fitAddonRef.current.fit()
					terminalRef.current?.focus()
				}
			})
		}
	}, [isHidden])

	// Handle window resize
	useEffect(() => {
		// Debounce resize 事件，避免密集调整窗口时多次触发 PTY resize + Ink 清屏操作。
		// Ink 的 useTerminalSize.ts 中 resize handler 也有 50ms debounce，
		// 两者配合可减少竞态条件（xterm 渲染 vs Ink 清屏重绘）。
		let resizeTimer: number | null = null

		const handleResize = () => {
			if (!isHidden && fitAddonRef.current) {
				if (resizeTimer !== null) {
					cancelAnimationFrame(resizeTimer)
				}
				resizeTimer = requestAnimationFrame(() => {
					resizeTimer = null
					fitAddonRef.current?.fit()
				})
			}
		}

		window.addEventListener("resize", handleResize)
		return () => {
			window.removeEventListener("resize", handleResize)
			if (resizeTimer !== null) {
				cancelAnimationFrame(resizeTimer)
			}
		}
	}, [isHidden])

	return (
		<div
			ref={containerRef}
			className={isHidden ? "hidden" : ""}
			style={{
				width: "100%",
				height: "100%",
				boxSizing: "border-box",
				position: "relative",
				margin: 0,
				padding: 0,
			}}>
			{!isTerminalReady && !isHidden && (
				<div
					style={{
						position: "absolute",
						inset: 0,
						zIndex: 10,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: "12px",
					}}>
					<VSCodeProgressRing />
					<span style={{ fontSize: "13px", opacity: 0.7 }}>Loading...</span>
				</div>
			)}
		</div>
	)
}

export default CostrictCliView
