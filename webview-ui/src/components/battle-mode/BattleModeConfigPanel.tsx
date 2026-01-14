import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Shield, Settings, RefreshCw, Save, X } from "lucide-react"

import { cn } from "@src/lib/utils"
import { StandardTooltip, Button } from "@src/components/ui"

export interface BattleModeConfig {
	enabled: boolean
	errorThreshold: number
	contextThreshold: number
	modelThreshold: number
	backupModel?: string
}

export interface BattleModeConfigPanelProps {
	config: BattleModeConfig
	availableModels: string[]
	onSave: (config: BattleModeConfig) => void
	onResetCounters?: () => void
	className?: string
}

const BattleModeConfigPanel = ({
	config,
	availableModels,
	onSave,
	onResetCounters,
	className,
}: BattleModeConfigPanelProps) => {
	const { t } = useTranslation()
	const [localConfig, setLocalConfig] = useState<BattleModeConfig>(config)
	const [hasChanges, setHasChanges] = useState(false)

	useEffect(() => {
		setHasChanges(JSON.stringify(localConfig) !== JSON.stringify(config))
	}, [localConfig, config])

	const handleSave = () => {
		onSave(localConfig)
	}

	const handleReset = () => {
		setLocalConfig(config)
		setHasChanges(false)
	}

	const handleInputChange = (key: keyof BattleModeConfig, value: any) => {
		setLocalConfig((prev) => ({
			...prev,
			[key]: value,
		}))
	}

	return (
		<div
			className={cn(
				"flex flex-col gap-4 p-4 rounded-lg border border-text-secondary/20 bg-vscode-sideBar-background",
				className,
			)}>
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Shield className="w-5 h-5 text-text-primary" />
					<h3 className="text-lg font-semibold text-vscode-foreground">{t("settings:battleMode.title")}</h3>
				</div>
				<div className="flex items-center gap-2">
					<StandardTooltip content={t("settings:battleMode.description")}>
						<Settings className="w-4 h-4 text-text-secondary cursor-help" />
					</StandardTooltip>
				</div>
			</div>

			{/* Enable Toggle */}
			<div className="flex items-center justify-between p-3 rounded bg-vscode-editor-background">
				<div>
					<label className="text-sm font-medium text-vscode-foreground">
						{t("settings:battleMode.config.enabled")}
					</label>
					<p className="text-xs text-text-secondary mt-1">{t("settings:battleMode.description")}</p>
				</div>
				<button
					onClick={() => handleInputChange("enabled", !localConfig.enabled)}
					className={cn(
						"relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
						localConfig.enabled ? "bg-green-600" : "bg-text-secondary/30",
					)}>
					<span
						className={cn(
							"inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
							localConfig.enabled ? "translate-x-6" : "translate-x-1",
						)}
					/>
				</button>
			</div>

			{/* Error Threshold */}
			<div className="p-3 rounded bg-vscode-editor-background">
				<div className="flex items-center justify-between mb-2">
					<label className="text-sm font-medium text-vscode-foreground">
						{t("settings:battleMode.config.errorThreshold")}
					</label>
					<StandardTooltip content={t("settings:battleMode.config.errorThresholdDescription")}>
						<span className="text-xs text-text-secondary cursor-help">(i)</span>
					</StandardTooltip>
				</div>
				<input
					type="number"
					min="1"
					max="10"
					value={localConfig.errorThreshold}
					onChange={(e) => handleInputChange("errorThreshold", parseInt(e.target.value) || 1)}
					className="w-full px-3 py-2 bg-vscode-input-background border border-text-secondary/30 rounded-md text-vscode-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
				/>
			</div>

			{/* Context Threshold */}
			<div className="p-3 rounded bg-vscode-editor-background">
				<div className="flex items-center justify-between mb-2">
					<label className="text-sm font-medium text-vscode-foreground">
						{t("settings:battleMode.config.contextThreshold")}
					</label>
					<StandardTooltip content={t("settings:battleMode.config.contextThresholdDescription")}>
						<span className="text-xs text-text-secondary cursor-help">(i)</span>
					</StandardTooltip>
				</div>
				<input
					type="number"
					min="1"
					max="10"
					value={localConfig.contextThreshold}
					onChange={(e) => handleInputChange("contextThreshold", parseInt(e.target.value) || 1)}
					className="w-full px-3 py-2 bg-vscode-input-background border border-text-secondary/30 rounded-md text-vscode-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
				/>
			</div>

			{/* Model Threshold */}
			<div className="p-3 rounded bg-vscode-editor-background">
				<div className="flex items-center justify-between mb-2">
					<label className="text-sm font-medium text-vscode-foreground">
						{t("settings:battleMode.config.modelThreshold")}
					</label>
					<StandardTooltip content={t("settings:battleMode.config.modelThresholdDescription")}>
						<span className="text-xs text-text-secondary cursor-help">(i)</span>
					</StandardTooltip>
				</div>
				<input
					type="number"
					min="1"
					max="10"
					value={localConfig.modelThreshold}
					onChange={(e) => handleInputChange("modelThreshold", parseInt(e.target.value) || 1)}
					className="w-full px-3 py-2 bg-vscode-input-background border border-text-secondary/30 rounded-md text-vscode-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
				/>
			</div>

			{/* Backup Model */}
			<div className="p-3 rounded bg-vscode-editor-background">
				<div className="flex items-center justify-between mb-2">
					<label className="text-sm font-medium text-vscode-foreground">
						{t("settings:battleMode.config.backupModel")}
					</label>
					<StandardTooltip content={t("settings:battleMode.config.backupModelDescription")}>
						<span className="text-xs text-text-secondary cursor-help">(i)</span>
					</StandardTooltip>
				</div>
				<select
					value={localConfig.backupModel || ""}
					onChange={(e) => handleInputChange("backupModel", e.target.value)}
					className="w-full px-3 py-2 bg-vscode-input-background border border-text-secondary/30 rounded-md text-vscode-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50">
					<option value="">{t("common.none")}</option>
					{availableModels.map((model) => (
						<option key={model} value={model}>
							{model}
						</option>
					))}
				</select>
			</div>

			{/* Action Buttons */}
			<div className="flex gap-2 pt-2">
				<Button
					onClick={handleSave}
					disabled={!hasChanges}
					className={cn(
						"flex-1 flex items-center justify-center gap-2",
						hasChanges ? "bg-green-600 hover:bg-green-700" : "bg-text-secondary/30 cursor-not-allowed",
					)}>
					<Save className="w-4 h-4" />
					{t("settings:battleMode.config.save")}
				</Button>
				<Button
					onClick={handleReset}
					disabled={!hasChanges}
					className="flex-1 flex items-center justify-center gap-2 bg-text-secondary/20 hover:bg-text-secondary/30 disabled:opacity-50 disabled:cursor-not-allowed">
					<X className="w-4 h-4" />
					{t("settings:battleMode.config.cancel")}
				</Button>
			</div>

			{/* Reset Counters */}
			{onResetCounters && (
				<div className="pt-2 border-t border-text-secondary/20">
					<Button
						onClick={onResetCounters}
						className="w-full flex items-center justify-center gap-2 bg-vscode-input-background hover:bg-vscode-input-background/80">
						<RefreshCw className="w-4 h-4" />
						{t("settings:battleMode.config.resetCounters")}
					</Button>
				</div>
			)}
		</div>
	)
}

export default BattleModeConfigPanel
