import { useEffect, useRef, useCallback, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Unicode11Addon } from "@xterm/addon-unicode11"
import { useEvent } from "react-use"
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "@/utils/vscode"
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
