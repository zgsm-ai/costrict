import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Shield, ShieldAlert, ShieldCheck, Activity, AlertCircle } from "lucide-react"

import { cn } from "@src/lib/utils"
import { StandardTooltip } from "@src/components/ui"

export interface BattleModeStatusProps {
	isActive: boolean
	isPaused: boolean
	errorCount: number
	recoveryActions: number
	className?: string
}

const BattleModeStatus = ({ isActive, isPaused, errorCount, recoveryActions, className }: BattleModeStatusProps) => {
	const { t } = useTranslation()

	// Determine status
	const getStatus = () => {
		if (!isActive) return "inactive"
		if (isPaused) return "paused"
		return "active"
	}

	const status = getStatus()

	// Get status icon and label
	const getStatusConfig = () => {
		switch (status) {
			case "active":
				return {
					icon: ShieldCheck,
					iconColor: "text-green-500",
					label: t("settings:battleMode.status.active"),
					bgColor: "bg-green-500/10",
					borderColor: "border-green-500/20",
				}
			case "paused":
				return {
					icon: ShieldAlert,
					iconColor: "text-yellow-500",
					label: t("settings:battleMode.status.paused"),
					bgColor: "bg-yellow-500/10",
					borderColor: "border-yellow-500/20",
				}
			case "inactive":
			default:
				return {
					icon: Shield,
					iconColor: "text-text-secondary",
					label: t("settings:battleMode.status.inactive"),
					bgColor: "bg-vscode-editor-background",
					borderColor: "border-text-secondary/20",
				}
		}
	}

	const statusConfig = getStatusConfig()
	const StatusIcon = statusConfig.icon

	return (
		<div
			className={cn(
				"flex items-center gap-3 p-3 rounded-lg border",
				statusConfig.bgColor,
				statusConfig.borderColor,
				className,
			)}>
			{/* Status Icon and Label */}
			<div className="flex items-center gap-2">
				<StatusIcon className={cn("w-5 h-5", statusConfig.iconColor)} />
				<span className="text-sm font-medium text-vscode-foreground">{statusConfig.label}</span>
			</div>

			{/* Separator */}
			<div className="w-px h-6 bg-text-secondary/20" />

			{/* Error Count */}
			<div className="flex items-center gap-2">
				<Activity className="w-4 h-4 text-text-secondary" />
				<span className="text-xs text-text-secondary">{t("settings:battleMode.errors.count")}:</span>
				<span className={cn("text-sm font-medium", errorCount > 0 ? "text-red-400" : "text-vscode-foreground")}>
					{errorCount}
				</span>
			</div>

			{/* Recovery Actions */}
			<StandardTooltip content={t("settings:battleMode.errors.recovery")}>
				<div className="flex items-center gap-2 cursor-help">
					<AlertCircle className="w-4 h-4 text-text-secondary" />
					<span className="text-xs text-text-secondary">{t("settings:battleMode.errors.recovery")}:</span>
					<span className="text-sm font-medium text-vscode-foreground">{recoveryActions}</span>
				</div>
			</StandardTooltip>
		</div>
	)
}

export default memo(BattleModeStatus)
