import { useEffect, useRef, useCallback, useState, useId, useMemo } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Unicode11Addon } from "@xterm/addon-unicode11"
import { SerializeAddon } from "@xterm/addon-serialize"
import { useEvent } from "react-use"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui"
import InlineToast from "@/components/common/InlineToast"
import { copyToClipboard } from "@/utils/clipboard"
import { vscode } from "@/utils/vscode"
import { useTranslation } from "react-i18next"
import { getTerminalClipboardAction } from "./terminalClipboardShortcuts"
import "@xterm/xterm/css/xterm.css"
import LoadingView from "../LoadingView"

interface CostrictCliViewProps {
	isHidden: boolean
}

type CliStatus = "starting" | "ready" | "restarting" | "exited" | "error"

const STATUS_COLORS: Record<CliStatus, string> = {
	starting: "#9ca3af",
	restarting: "#f59e0b",
	exited: "#f97316",
	ready: "#22c55e",
	error: "#ef4444",
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
	const fontSize =
		parseCssPixelValue(rootStyles.getPropertyValue("--vscode-editor-font-size")) ??
		parseCssPixelValue(bodyStyles.getPropertyValue("--vscode-editor-font-size")) ??
		16
	const lineHeightValue =
		rootStyles.getPropertyValue("--vscode-editor-line-height").trim() ||
		bodyStyles.getPropertyValue("--vscode-editor-line-height").trim()
	const parsedLineHeight = parseCssPixelValue(lineHeightValue)
	const lineHeight = parsedLineHeight ? Math.max(1, parsedLineHeight / fontSize) : 1

	return {
		fontFamily: '"JetBrains Mono", "WenQuanYi Micro Hei Mono", monospace',
		fontSize,
		lineHeight,
		letterSpacing: 0,
		customGlyphs: false,
	}
}

export const CostrictCliView = ({ isHidden }: CostrictCliViewProps) => {
	const { t } = useTranslation()
	const containerRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<Terminal | null>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const restartButtonRef = useRef<HTMLButtonElement>(null)
	const lastFocusedElementRef = useRef<HTMLElement | null>(null)
	const isHiddenRef = useRef(isHidden)
	const refreshFrameRef = useRef<number | null>(null)
	const scheduleRefreshRef = useRef<(() => void) | null>(null)
	const pasteShortcutFallbackRef = useRef<number | null>(null)
	const toastTimerRef = useRef<number | null>(null)
	const hasSentStartRef = useRef(false)
	const liveRegionId = useId()
	const restartDialogContentId = useId()
	const restartDialogDescriptionId = useId()
	const terminalHelpTextId = useId()
	const [restartCount, setRestartCount] = useState(0)
	const [status, setStatus] = useState<CliStatus>("starting")
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [errorKind, setErrorKind] = useState<string | null>(null)
	const [docsUrl, setDocsUrl] = useState<string | null>(null)
	const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false)
	const [toastMessage, setToastMessage] = useState<string | null>(null)

	isHiddenRef.current = isHidden

	const showToast = useCallback((message: string) => {
		setToastMessage(message)
		if (toastTimerRef.current !== null) {
			window.clearTimeout(toastTimerRef.current)
		}
		toastTimerRef.current = window.setTimeout(() => {
			toastTimerRef.current = null
			setToastMessage(null)
		}, 2200)
	}, [])

	// Handle messages from extension
	const onMessage = useCallback(
		(e: MessageEvent) => {
			const message = e.data

			if (message.type === "CostrictCliOutput" && message.data) {
				terminalRef.current?.write(message.data)
				scheduleRefreshRef.current?.()
			}

			if (message.type === "CostrictCliExit") {
				terminalRef.current?.reset()
				terminalRef.current?.write(`\r\n\x1b[33m[${t("common:costrictCli.exited.terminalMessage")}]\x1b[0m\r\n`)
				setIsRestartConfirmOpen(false)
				setStatus("exited")
				setErrorMessage(null)
				setErrorKind(null)
				setDocsUrl(null)
			}

			if (message.type === "CostrictCliError" && message.error) {
				const nextErrorKind = message.values?.kind ?? null
				if (nextErrorKind !== "missing-cli") {
					terminalRef.current?.write(`\r\n\x1b[31mError: ${message.error}\x1b[0m\r\n`)
				}
				setStatus("error")
				setErrorMessage(message.error)
				setErrorKind(nextErrorKind)
				setDocsUrl(message.values?.docsUrl ?? null)
			}

			if (message.type === "CostrictCliClear") {
				terminalRef.current?.reset()
			}

			if (message.type === "CostrictCliPasteUnavailable") {
				terminalRef.current?.write("\r\n\x1b[33mClipboard is empty.\x1b[0m\r\n")
			}

			if (message.type === "CostrictCliRestart") {
				setIsRestartConfirmOpen(false)
				setStatus("restarting")
				setErrorMessage(null)
				setErrorKind(null)
				setDocsUrl(null)
				setRestartCount((c) => c + 1)
			}

			if (message.type === "CostrictCliHttpReady") {
				if (message.values?.ready === false) {
					setStatus("error")
					setErrorKind(message.values?.kind ?? "startup-timeout")
					setDocsUrl(message.values?.docsUrl ?? null)
					setErrorMessage(t("common:costrictCli.startError.startupTimeout"))
					return
				}

				setStatus("ready")
				setErrorMessage(null)
				setErrorKind(null)
				setDocsUrl(null)
			}

			if (message.type === "CostrictCliToast" && message.text) {
				showToast(message.text)
			}
		},
		[showToast, t],
	)

	useEvent("message", onMessage)

	// Initialize terminal
	useEffect(() => {
		hasSentStartRef.current = false
		setStatus(restartCount > 0 ? "restarting" : "starting")
		setErrorMessage(null)
		setErrorKind(null)
		setDocsUrl(null)
		const container = containerRef.current
		if (!container || terminalRef.current) return

		// Create terminal instance
		const terminal = new Terminal({
			cursorStyle: "block",
			cursorBlink: true,
			tabStopWidth: 4,
			allowProposedApi: true,
			...getTerminalRenderOptions(),
		})

		// Load addons
		const fitAddon = new FitAddon()
		const serializeAddon = new SerializeAddon()

		// activate the new version
		terminal.loadAddon(new WebLinksAddon())
		terminal.loadAddon(fitAddon)
		terminal.loadAddon(serializeAddon)
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
		const handleCopySelection = (selection: string) => {
			copyToClipboard(selection)
		}
		const clearPendingPasteShortcutFallback = () => {
			if (pasteShortcutFallbackRef.current !== null) {
				window.clearTimeout(pasteShortcutFallbackRef.current)
				pasteShortcutFallbackRef.current = null
			}
		}
		const requestPasteFromExtension = () => {
			clearPendingPasteShortcutFallback()
			vscode.postMessage({ type: "CostrictCliRequestPaste" })
		}

		const shouldUsePasteShortcutFallback = Boolean((window as any).isJetbrainsPlatform)
		terminal.attachCustomKeyEventHandler((event) => {
			const key = event.key.toLowerCase()

			// Shift + ↑/↓ → Page Up / Page Down
			if (
				event.type === "keydown" &&
				event.shiftKey &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				(key === "arrowup" || key === "arrowdown")
			) {
				event.preventDefault()
				const seq = key === "arrowup" ? "\x1b[5~" : "\x1b[6~"
				vscode.postMessage({ type: "CostrictCliInput", data: seq })
				return false
			}

			const isCtrlZStop =
				event.type === "keydown" &&
				event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				!event.shiftKey &&
				key === "z"

			if (isCtrlZStop) {
				event.preventDefault()
				clearPendingPasteShortcutFallback()
				vscode.postMessage({ type: "CostrictCliStop", values: { signal: "SIGKILL" } })
				return false
			}

			const selection = terminal.getSelection()
			const action = getTerminalClipboardAction(event, selection)

			if (action === "none") {
				return true
			}

			event.preventDefault()

			if (action === "paste") {
				if (shouldUsePasteShortcutFallback) {
					// JetBrains-hosted webviews can swallow Ctrl/Cmd+V without ever
					// dispatching a DOM paste event to xterm's textarea, so only that host
					// gets the keyboard-triggered clipboard fallback.
					clearPendingPasteShortcutFallback()
					pasteShortcutFallbackRef.current = window.setTimeout(() => {
						pasteShortcutFallbackRef.current = null
						vscode.postMessage({ type: "CostrictCliRequestPaste" })
					}, 0)
					terminalRef.current?.focus()
				}
				return false
			}

			// copy/cut 在 keydown 阶段直接执行，因为 copy/cut 没有对应的 DOM 剪贴板事件可依赖。
			if (selection) {
				handleCopySelection(selection)
			}

			return false
		})

		const clipboardTarget = terminal.textarea ?? container
		const handlePaste = (event: Event) => {
			clearPendingPasteShortcutFallback()
			event.preventDefault()
			event.stopImmediatePropagation()

			const text = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? ""
			if (text) {
				const PASTE_START = "\x1b[200~"
				const PASTE_END = "\x1b[201~"
				vscode.postMessage({ type: "CostrictCliInput", data: PASTE_START + text + PASTE_END })
				terminalRef.current?.focus()
				return
			}

			requestPasteFromExtension()
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

		clipboardTarget.addEventListener("paste", handlePaste, { capture: true })
		clipboardTarget.addEventListener("copy", handleCopy)
		clipboardTarget.addEventListener("cut", handleCut)

		// Handle resize
		terminal.onResize(({ cols, rows }) => {
			vscode.postMessage({
				type: "CostrictCliResize",
				cols,
				rows,
			})
		})

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
			if (!hasSentStartRef.current && terminal.cols > 0 && terminal.rows > 0) {
				hasSentStartRef.current = true
				vscode.postMessage({
					type: "CostrictCliStart",
					cols: terminal.cols,
					rows: terminal.rows,
				})
				terminal.focus()
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
			clearPendingPasteShortcutFallback()
			scheduleRefreshRef.current = null
			hasSentStartRef.current = false
			resizeObserver.disconnect()
			clipboardTarget.removeEventListener("paste", handlePaste, { capture: true })
			clipboardTarget.removeEventListener("copy", handleCopy)
			clipboardTarget.removeEventListener("cut", handleCut)
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

	useEffect(() => {
		return () => {
			if (toastTimerRef.current !== null) {
				window.clearTimeout(toastTimerRef.current)
			}
		}
	}, [])

	// const focusTerminal = useCallback(() => {
	// 	terminalRef.current?.focus()
	// }, [])

	useEffect(() => {
		if (isRestartConfirmOpen) {
			lastFocusedElementRef.current =
				document.activeElement instanceof HTMLElement ? document.activeElement : null
			return
		}

		if (status !== "restarting") {
			lastFocusedElementRef.current?.focus()
		}
	}, [isRestartConfirmOpen, status])

	// const handleClear = useCallback(() => {
	// 	terminalRef.current?.reset()
	// 	setErrorMessage(null)
	// 	focusTerminal()
	// }, [focusTerminal])

	const handleRestartClick = useCallback(() => {
		if (status === "restarting") {
			return
		}

		lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
		setIsRestartConfirmOpen(true)
	}, [status])

	const handleRestartConfirm = useCallback(() => {
		setIsRestartConfirmOpen(false)
		setStatus("restarting")
		setErrorMessage(null)
		setErrorKind(null)
		setDocsUrl(null)
		vscode.postMessage({ type: "CostrictCliRestart" })
	}, [])

	const handleRestartDialogOpenChange = useCallback((open: boolean) => {
		setIsRestartConfirmOpen(open)
	}, [])

	const handleOpenInstallDocs = useCallback(() => {
		if (!docsUrl) {
			return
		}

		vscode.postMessage({ type: "openExternal", url: docsUrl })
	}, [docsUrl])

	const statusMeta = useMemo(
		() => ({
			label: ["ready", "error"].includes(status) ? "" : t(`common:costrictCli.status.${status}`),
			color: STATUS_COLORS[status],
		}),
		[status, t],
	)
	const isBusy = status === "starting" || status === "restarting"
	const isExited = status === "exited"
	const cliTitle = t("common:costrictCli.title")
	// const clearLabel = t("common:costrictCli.actions.clear")
	const restartLabel = t("common:costrictCli.actions.restart")
	const terminalPanelAriaLabel = t("common:costrictCli.aria.terminalPanel")
	const terminalAriaLabel = t("common:costrictCli.aria.terminal")
	const terminalHelpText = t("common:costrictCli.help")
	const loadingDescription = t("common:costrictCli.loading.description")
	const exitedTitle = t("common:costrictCli.exited.title")
	const exitedDescription = t("common:costrictCli.exited.description")
	const isMissingCliError = errorKind === "missing-cli"
	const errorTitle = isMissingCliError
		? t("common:costrictCli.startError.missingCliTitle")
		: t("common:costrictCli.startError.genericTitle")
	const errorDescription = isMissingCliError
		? t("common:costrictCli.startError.missingCliDescription")
		: errorKind === "startup-timeout"
			? t("common:costrictCli.startError.startupTimeoutDescription")
			: t("common:costrictCli.startError.genericDescription")
	const errorHint = isMissingCliError ? null : t("common:costrictCli.startError.retryHint")

	return (
		<div
			className="costrict-cli-terminal"
			role="region"
			aria-label={terminalPanelAriaLabel}
			aria-busy={isBusy}
			aria-describedby={terminalHelpTextId}
			style={{
				width: "100%",
				height: "100%",
				boxSizing: "border-box",
				position: "relative",
				margin: 0,
				padding: 0,
				overflow: "hidden",
				display: isHidden ? "none" : "flex",
				flexDirection: "column",
			}}>
			<div id={liveRegionId} className="sr-only" aria-live="polite" aria-atomic="true">
				{t("common:costrictCli.aria.liveRegion", {
					status: statusMeta.label,
					errorSegment: errorMessage
						? t("common:costrictCli.aria.errorSegment", { error: errorMessage })
						: "",
					toastSegment:
						toastMessage && !isHidden
							? t("common:costrictCli.aria.toastSegment", { toast: toastMessage })
							: "",
				})}
			</div>
			<p id={terminalHelpTextId} className="sr-only">
				{terminalHelpText}
			</p>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "12px",
					padding: "8px 12px",
					borderBottom: "1px solid var(--vscode-panel-border)",
					background: "var(--vscode-editor-background)",
					minHeight: "40px",
				}}>
				<div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
					<span
						style={{
							width: "8px",
							height: "8px",
							borderRadius: "9999px",
							background: statusMeta.color,
							flexShrink: 0,
						}}
					/>
					<span style={{ fontSize: "12px", fontWeight: 600 }}>{cliTitle}</span>
					<span aria-hidden="true" style={{ fontSize: "12px", opacity: 0.7 }}>
						{statusMeta.label}
					</span>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
					{/* <button
						type="button"
						aria-label={clearLabel}
						title={clearLabel}
						onClick={handleClear}
						style={{
							background: "transparent",
							border: "none",
							color: "var(--vscode-foreground)",
							cursor: "pointer",
							padding: 0,
						}}>
						<span aria-hidden="true" className="codicon codicon-clear-all" style={{ fontSize: "14px" }} />
					</button> */}
					<button
						ref={restartButtonRef}
						type="button"
						aria-label={restartLabel}
						title={restartLabel}
						aria-haspopup="dialog"
						aria-expanded={isRestartConfirmOpen}
						aria-controls={isRestartConfirmOpen ? restartDialogContentId : undefined}
						onClick={handleRestartClick}
						disabled={status === "restarting"}
						style={{
							background: "transparent",
							border: "none",
							color: "var(--vscode-foreground)",
							cursor: status === "restarting" ? "not-allowed" : "pointer",
							opacity: status === "restarting" ? 0.5 : 1,
							padding: 0,
						}}>
						<span aria-hidden="true" className="codicon codicon-refresh" style={{ fontSize: "14px" }} />
					</button>
				</div>
			</div>
			<InlineToast
				message={toastMessage}
				title={cliTitle}
				visible={!isHidden}
				containerClassName="top-[52px] right-3"
			/>
			<div
				ref={containerRef}
				role="application"
				aria-label={terminalAriaLabel}
				aria-busy={isBusy}
				style={{
					flex: 1,
					position: "relative",
					margin: 0,
					padding: 0,
					overflow: "hidden",
				}}>
				{isBusy && !isHidden && (
					<div
						role="status"
						aria-live="polite"
						aria-atomic="true"
						style={{
							position: "absolute",
							inset: 0,
							zIndex: 10,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							gap: "12px",
							padding: "24px",
							textAlign: "center",
							background: "var(--vscode-editor-background)",
						}}>
						<LoadingView loadingText={loadingDescription} />
					</div>
				)}
				{status === "error" && !isHidden && (
					<div
						role="status"
						aria-live="polite"
						aria-atomic="true"
						style={{
							position: "absolute",
							inset: 0,
							zIndex: 10,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							gap: "14px",
							padding: "24px",
							textAlign: "center",
							background: "var(--vscode-editor-background)",
						}}>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "8px",
								alignItems: "center",
								maxWidth: "420px",
							}}>
							<span style={{ fontSize: "13px", fontWeight: 600 }}>{errorTitle}</span>
							{errorDescription ? (
								<span style={{ fontSize: "12px", opacity: 0.8, lineHeight: 1.5 }}>
									{errorDescription}
								</span>
							) : null}
							{!isMissingCliError && errorMessage ? (
								<span
									style={{
										fontSize: "12px",
										opacity: 0.72,
										lineHeight: 1.5,
										whiteSpace: "pre-wrap",
										overflowWrap: "anywhere",
									}}>
									{errorMessage}
								</span>
							) : null}
							{errorHint ? (
								<span style={{ fontSize: "12px", opacity: 0.72, lineHeight: 1.5 }}>{errorHint}</span>
							) : null}
						</div>
						{isMissingCliError && docsUrl ? (
							<button
								type="button"
								onClick={handleOpenInstallDocs}
								style={{
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									gap: "8px",
									padding: "8px 14px",
									borderRadius: "9999px",
									border: "1px solid var(--vscode-button-border)",
									background: "var(--vscode-button-background)",
									color: "var(--vscode-button-foreground)",
									cursor: "pointer",
								}}>
								<span
									aria-hidden="true"
									className="codicon codicon-link-external"
									style={{ fontSize: "14px" }}
								/>
								<span>{t("common:costrictCli.startError.installLink")}</span>
							</button>
						) : (
							<button
								type="button"
								onClick={handleRestartClick}
								aria-haspopup="dialog"
								aria-expanded={isRestartConfirmOpen}
								aria-controls={isRestartConfirmOpen ? restartDialogContentId : undefined}
								style={{
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									gap: "8px",
									padding: "8px 14px",
									borderRadius: "9999px",
									border: "1px solid var(--vscode-button-border)",
									background: "var(--vscode-button-background)",
									color: "var(--vscode-button-foreground)",
									cursor: "pointer",
								}}>
								<span
									aria-hidden="true"
									className="codicon codicon-refresh"
									style={{ fontSize: "14px" }}
								/>
								<span>{restartLabel}</span>
							</button>
						)}
					</div>
				)}
				{isExited && !isHidden && (
					<div
						role="status"
						aria-live="polite"
						aria-atomic="true"
						style={{
							position: "absolute",
							inset: 0,
							zIndex: 10,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							gap: "14px",
							padding: "24px",
							textAlign: "center",
							background: "var(--vscode-editor-background)",
						}}>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "6px",
								alignItems: "center",
								maxWidth: "420px",
							}}>
							<span style={{ fontSize: "13px", fontWeight: 600 }}>{exitedTitle}</span>
							<span style={{ fontSize: "12px", opacity: 0.7, lineHeight: 1.5 }}>{exitedDescription}</span>
						</div>
						<button
							type="button"
							onClick={handleRestartClick}
							aria-haspopup="dialog"
							aria-expanded={isRestartConfirmOpen}
							aria-controls={isRestartConfirmOpen ? restartDialogContentId : undefined}
							style={{
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								gap: "8px",
								padding: "8px 14px",
								borderRadius: "9999px",
								border: "1px solid var(--vscode-button-border)",
								background: "var(--vscode-button-background)",
								color: "var(--vscode-button-foreground)",
								cursor: "pointer",
							}}>
							<span aria-hidden="true" className="codicon codicon-refresh" style={{ fontSize: "14px" }} />
							<span>{restartLabel}</span>
						</button>
					</div>
				)}
			</div>
			<AlertDialog open={isRestartConfirmOpen} onOpenChange={handleRestartDialogOpenChange}>
				<AlertDialogContent id={restartDialogContentId} onCloseAutoFocus={(event) => event.preventDefault()}>
					<AlertDialogHeader>
						<AlertDialogTitle className="text-lg">
							{t("common:costrictCli.restartConfirm.title")}
						</AlertDialogTitle>
						<AlertDialogDescription id={restartDialogDescriptionId} className="text-base">
							{t("common:costrictCli.restartConfirm.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="flex-col gap-2">
						<AlertDialogCancel
							autoFocus
							className="bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground border-vscode-button-border">
							{t("common:answers.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleRestartConfirm}
							className="bg-vscode-button-background hover:bg-vscode-button-hoverBackground text-vscode-button-foreground border-vscode-button-border">
							{t("common:costrictCli.restartConfirm.confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export default CostrictCliView
