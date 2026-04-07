import { memo } from "react"

import { cn } from "@/lib/utils"

interface InlineToastProps {
	message: string | null
	title?: string
	visible?: boolean
	className?: string
	iconClassName?: string
	containerClassName?: string
}

function InlineToast({
	message,
	title,
	visible = true,
	className,
	iconClassName = "codicon codicon-check",
	containerClassName,
}: InlineToastProps) {
	if (!message || !visible) {
		return null
	}

	return (
		<div
			role="status"
			aria-live="polite"
			className={cn(
				"pointer-events-none absolute top-3 right-3 z-20 max-w-[min(360px,calc(100%-24px))]",
				containerClassName,
			)}>
			<div
				className={cn(
					"flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-sm",
					"bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,var(--vscode-sideBar-background,black))]",
					"border-[var(--vscode-widget-border,var(--vscode-panel-border))] text-[var(--vscode-foreground)]",
					className,
				)}>
				<span
					aria-hidden="true"
					className={cn(
						iconClassName,
						"mt-0.5 shrink-0 rounded-full p-1 text-[11px] text-[var(--vscode-notificationsInfoIcon-foreground,var(--vscode-focusBorder))]",
						"bg-[color-mix(in_srgb,var(--vscode-focusBorder)_16%,transparent)]",
					)}
				/>
				<div className="min-w-0">
					{title && (
						<div className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--vscode-descriptionForeground)]">
							{title}
						</div>
					)}
					<div className="break-words">{message}</div>
				</div>
			</div>
		</div>
	)
}

export default memo(InlineToast)
