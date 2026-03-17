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

const parseCssPixelValue = (value: string | null | undefined) => {
	if (!value) {
		return undefined
	}

	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : undefined
}

const getTerminalRenderOptions = () => {
	const rootStyles = window.getComputedStyle(document.documentElement)
	const bodyStyles = window.getComputedStyle(document.body)
	const fontFamily =
		rootStyles.getPropertyValue("--vscode-editor-font-family").trim() ||
		bodyStyles.getPropertyValue("--vscode-editor-font-family").trim() ||
		"monospace"
	const fontSize =
		parseCssPixelValue(rootStyles.getPropertyValue("--vscode-editor-font-size")) ??
		parseCssPixelValue(bodyStyles.getPropertyValue("--vscode-editor-font-size")) ??
		12
	const lineHeightValue =
		rootStyles.getPropertyValue("--vscode-editor-line-height").trim() ||
		bodyStyles.getPropertyValue("--vscode-editor-line-height").trim()
	const parsedLineHeight = parseCssPixelValue(lineHeightValue)
	const lineHeight = parsedLineHeight ? Math.max(1, parsedLineHeight / fontSize) : 1

	return {
		fontFamily,
		fontSize,
		lineHeight,
		letterSpacing: 0,
		customGlyphs: false,
	}
}

export const CostrictCliView = ({ isHidden }: CostrictCliViewProps) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<Terminal | null>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const isHiddenRef = useRef(isHidden)
	const refreshFrameRef = useRef<number | null>(null)
	const scheduleRefreshRef = useRef<(() => void) | null>(null)
	const [restartCount, setRestartCount] = useState(0)
	const [isTerminalReady, setIsTerminalReady] = useState(false)

	isHiddenRef.current = isHidden

	// Handle messages from extension
	const onMessage = useCallback((e: MessageEvent) => {
		const message = e.data

		if (message.type === "CostrictCliOutput" && message.data) {
			terminalRef.current?.write(message.data)
			scheduleRefreshRef.current?.()
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
			...getTerminalRenderOptions(),
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
		scheduleRefreshRef.current = () => {
			if (refreshFrameRef.current !== null) {
				return
			}

			refreshFrameRef.current = requestAnimationFrame(() => {
				refreshFrameRef.current = null
				const currentTerminal = terminalRef.current
				if (!currentTerminal || isHiddenRef.current || currentTerminal.rows <= 0) {
					return
				}

				currentTerminal.refresh(0, currentTerminal.rows - 1)
			})
		}

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

		// Flag to track if initial fit has been done
		let hasInitialFit = false
		let resizeObserverTimer: number | null = null

		const fitTerminal = () => {
			if (isHiddenRef.current) {
				return
			}

			const width = container.clientWidth
			const height = container.clientHeight

			if (width <= 0 || height <= 0) {
				return
			}

			fitAddon.fit()

			// Only send CostrictCliStart once after first successful fit.
			if (!hasInitialFit && terminal.cols > 0 && terminal.rows > 0) {
				hasInitialFit = true
				vscode.postMessage({
					type: "CostrictCliStart",
					cols: terminal.cols,
					rows: terminal.rows,
				})
				terminal.focus()
				setIsTerminalReady(true)
			}
		}

		// Use ResizeObserver to monitor container size changes
		// This ensures terminal is resized whenever the container changes
		const resizeObserver = new ResizeObserver(() => {
			if (resizeObserverTimer !== null) {
				clearTimeout(resizeObserverTimer)
			}
			resizeObserverTimer = window.setTimeout(() => {
				fitTerminal()
			}, 50)
		})

		resizeObserver.observe(container)

		// Cleanup
		return () => {
			if (resizeObserverTimer !== null) {
				clearTimeout(resizeObserverTimer)
			}
			if (refreshFrameRef.current !== null) {
				cancelAnimationFrame(refreshFrameRef.current)
				refreshFrameRef.current = null
			}
			scheduleRefreshRef.current = null
			resizeObserver.disconnect()
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
			// When tab becomes visible, immediately try to fit before any other renders
			// Use multiple requestAnimationFrames to ensure layout is fully calculated
			let frame1: number | null = null
			let frame2: number | null = null

			frame1 = requestAnimationFrame(() => {
				frame2 = requestAnimationFrame(() => {
					if (terminalRef.current && fitAddonRef.current) {
						const container = containerRef.current
						if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) {
							return
						}

						fitAddonRef.current.fit()
						terminalRef.current.focus()
					}
				})
			})

			return () => {
				if (frame1 !== null) {
					cancelAnimationFrame(frame1)
				}
				if (frame2 !== null) {
					cancelAnimationFrame(frame2)
				}
			}
		}
	}, [isHidden])

	// Handle window resize
	useEffect(() => {
		// Debounce resize 事件，避免密集调整窗口时多次触发 PTY resize + Ink 清屏操作。
		// Ink 的 useTerminalSize.ts 中 resize handler 也有 50ms debounce，
		// 两者配合可减少竞态条件（xterm 渲染 vs Ink 清屏重绘）。
		let resizeTimer: number | null = null

		const handleResize = () => {
			if (!isHidden && fitAddonRef.current && terminalRef.current) {
				if (resizeTimer !== null) {
					clearTimeout(resizeTimer)
				}
				// Use larger debounce for window resize to ensure layout stability
				resizeTimer = window.setTimeout(() => {
					resizeTimer = null
					const container = containerRef.current
					if (
						fitAddonRef.current &&
						terminalRef.current &&
						container &&
						container.clientWidth > 0 &&
						container.clientHeight > 0
					) {
						fitAddonRef.current.fit()
					}
				}, 100)
			}
		}

		window.addEventListener("resize", handleResize)
		return () => {
			window.removeEventListener("resize", handleResize)
			if (resizeTimer !== null) {
				clearTimeout(resizeTimer)
			}
		}
	}, [isHidden])

	return (
		<div
			ref={containerRef}
			className={isHidden ? "costrict-cli-terminal hidden" : "costrict-cli-terminal"}
			style={{
				width: "100%",
				height: "100%",
				boxSizing: "border-box",
				position: "relative",
				margin: 0,
				padding: 0,
				overflow: "hidden",
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
