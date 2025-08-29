import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { RefreshCw, FileText, AlertCircle, Copy } from "lucide-react"
import { format } from "date-fns"

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "@/utils/vscode"
import {
	Button,
	Progress,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
	Popover,
	PopoverTrigger,
	PopoverContent,
	Badge,
} from "@/components/ui"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
// import { ExtensionStateContextType } from "@/context/ExtensionStateContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { SetCachedStateField } from "./types"
import { useEvent } from "react-use"

interface ZgsmCodebaseSettingsProps {
	setCachedStateField?: SetCachedStateField<"zgsmCodebaseIndexEnabled">
}

interface IndexStatus {
	fileCount: number | string
	lastUpdated: string
	progress: number
	status: "success" | "failed" | "running" | "pending"
	errorMessage?: string
	failedFiles?: string[]
}

// Index status information type returned from backend
export interface IndexStatusInfo {
	status: "success" | "failed" | "running" | "pending"
	process: number
	totalFiles: number
	totalSucceed: number
	totalFailed: number
	failedReason: string
	failedFiles: string[]
	processTs: number
	totalChunks?: number
}

// Convert backend IndexStatusInfo to IndexStatus format used by frontend component
const mapIndexStatusInfoToIndexStatus = (statusInfo: IndexStatusInfo, t: (key: string) => string): IndexStatus => {
	let errorMessage: string | undefined
	let progress = 0

	switch (statusInfo.status) {
		case "running":
			progress = statusInfo.process
			break
		case "pending":
			progress = 0
			break
		case "success":
			progress = 100
			break
		case "failed":
			progress = statusInfo.process
			errorMessage = statusInfo.failedReason || t("settings:codebase.general.indexBuildFailed")
			break
	}

	const lastUpdated = statusInfo.processTs
		? format(new Date(statusInfo.processTs * 1000), "yyyy-MM-dd HH:mm:ss")
		: "-"

	return {
		fileCount: statusInfo.totalFiles,
		lastUpdated,
		progress,
		status: statusInfo.status,
		errorMessage,
		failedFiles: (statusInfo.failedFiles || []).filter((file) => file !== ""),
	}
}

export const ZgsmCodebaseSettings = ({ setCachedStateField }: ZgsmCodebaseSettingsProps) => {
	const { t } = useAppTranslation()
	const { zgsmCodebaseIndexEnabled, apiConfiguration } = useExtensionState()
	// Polling related states
	const pollingIntervalId = useRef<NodeJS.Timeout | null>(null)
	const isPollingActive = useRef<boolean>(false)

	// Check if in pending enable state - only when API provider is not zgsm
	const isPendingEnable = useMemo(() => apiConfiguration?.apiProvider !== "zgsm", [apiConfiguration?.apiProvider])

	// Use useMemo to avoid unnecessary state updates
	const shouldDisableAll = useMemo(
		() => isPendingEnable || !zgsmCodebaseIndexEnabled,
		[isPendingEnable, zgsmCodebaseIndexEnabled],
	)

	const [semanticIndex, setSemanticIndex] = useState<IndexStatus>({
		fileCount: "-",
		lastUpdated: "-",
		progress: 0,
		status: "pending",
	})

	const [codeIndex, setCodeIndex] = useState<IndexStatus>({
		fileCount: "-",
		lastUpdated: "-",
		progress: 0,
		status: "pending",
	})

	// Stop polling
	const stopPolling = useCallback(() => {
		if (pollingIntervalId.current) {
			clearInterval(pollingIntervalId.current)
			pollingIntervalId.current = null
		}
		isPollingActive.current = false
	}, [])

	// Start polling - get status once immediately, then every 5 seconds
	const startPolling = useCallback(() => {
		// If already polling, return directly
		if (isPollingActive.current) {
			return
		}

		// Stop previous polling first
		if (pollingIntervalId.current) {
			clearInterval(pollingIntervalId.current)
			pollingIntervalId.current = null
		}

		// Mark polling status as active
		isPollingActive.current = true

		// Get status every 5 seconds
		pollingIntervalId.current = setInterval(() => {
			vscode.postMessage({
				type: "zgsmPollCodebaseIndexStatus",
			})
		}, 5000)
	}, [])

	// Check if polling should be stopped (both indexes are completed)
	const shouldStopPolling = useCallback((embedding?: IndexStatusInfo, codegraph?: IndexStatusInfo) => {
		return (
			embedding &&
			codegraph &&
			(embedding.status === "success" || embedding.status === "failed") &&
			(codegraph.status === "success" || codegraph.status === "failed")
		)
	}, [])

	// Handle messages from extension
	useEffect(() => {
		// 1. Get build status once when page is opened
		if (zgsmCodebaseIndexEnabled && !isPendingEnable) {
			// Get status immediately
			vscode.postMessage({
				type: "zgsmPollCodebaseIndexStatus",
			})
		}

		return () => {
			// window.removeEventListener("message", handleMessage)
			// 4. Stop polling when page is closed
			stopPolling()
		}
	}, [
		zgsmCodebaseIndexEnabled,
		isPendingEnable,
		startPolling,
		stopPolling,
		shouldStopPolling,
		t,
		setCachedStateField,
	])

	const handleCodebaseIndexToggle = useCallback((e: any) => {
		// e.preventDefault may not exist in tests
		if (e && e.preventDefault) {
			e.preventDefault()
		}
		if (e && e.stopPropagation) {
			e.stopPropagation()
		}

		// If switching from on to off state, confirmation is needed
		if (!e.target._checked) {
			vscode.postMessage({ type: "showZgsmCodebaseDisableConfirmDialog" })
			return
		}

		// Send message to extension
		vscode.postMessage({ type: "zgsmCodebaseIndexEnabled", bool: e.target._checked })
	}, [])

	const handleRebuildSemanticIndex = useCallback(() => {
		setSemanticIndex((prev) => ({ ...prev, status: "running", progress: 0 }))

		// Send rebuild message to extension
		vscode.postMessage({
			type: "zgsmRebuildCodebaseIndex",
			values: {
				type: "embedding",
			},
		})

		// 7. Manual click rebuild, get build status once, then get build status every 5 seconds
		startPolling()
	}, [startPolling])

	const handleRebuildCodeIndex = useCallback(() => {
		setCodeIndex((prev) => ({ ...prev, status: "running", progress: 0 }))

		// Send rebuild message to extension
		vscode.postMessage({
			type: "zgsmRebuildCodebaseIndex",
			values: {
				type: "codegraph",
			},
		})

		// 7. Manual click rebuild, get build status once, then get build status every 5 seconds
		startPolling()
	}, [startPolling])

	const handleEditIgnoreFile = useCallback(() => {
		vscode.postMessage({
			type: "openFile",
			text: "./.coignore",
			values: { create: true, content: "" },
		})
	}, [])

	const handleOpenFailedFile = useCallback((filePath: string) => {
		vscode.postMessage({
			type: "openFile",
			text: filePath,
			values: {},
		})
	}, [])

	const renderIndexSection = useCallback(
		(
			title: string,
			description: string,
			indexStatus: IndexStatus,
			onRebuild: () => void,
			disabled: boolean = false,
			isPendingEnableSection: boolean = false,
		) => {
			return (
				<div
					className={`flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
					<div className="flex items-center gap-4 font-bold">
						<FileText className="w-4 h-4" />
						<div>{title}</div>
					</div>
					<div className="text-vscode-descriptionForeground text-sm mb-3">{description}</div>
					{isPendingEnableSection ? (
						<div className="text-vscode-descriptionForeground text-sm italic py-4">
							{t("settings:codebase.semanticIndex.enableToShowDetails")}
						</div>
					) : (
						<>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<div className="text-vscode-descriptionForeground text-sm">
										{t("settings:codebase.semanticIndex.fileCount")}
									</div>
									<div className="font-medium">{indexStatus.fileCount}</div>
								</div>
								<div>
									<div className="text-vscode-descriptionForeground text-sm">
										{t("settings:codebase.semanticIndex.lastUpdatedTime")}
									</div>
									<div className="font-medium">{indexStatus.lastUpdated}</div>
								</div>
							</div>

							<div className="mt-2">
								<div className="flex justify-between text-sm mb-1">
									<span>{t("settings:codebase.semanticIndex.buildProgress")}</span>
									<span>{indexStatus.progress.toFixed(1)}%</span>
								</div>
								<Progress
									value={indexStatus.progress}
									className="h-2"
									progressBackgroundClass="bg-vscode-button-background"
								/>
							</div>
						</>
					)}

					<div className="flex items-center justify-between mt-3">
						<div className="flex items-center gap-2">
							{isPendingEnableSection ? (
								<div className="flex items-center gap-2">
									<div className="w-3 h-3 bg-gray-400 rounded-full"></div>
									<span>{t("settings:codebase.semanticIndex.pendingEnable")}</span>
								</div>
							) : (
								<>
									{indexStatus.status === "running" && (
										<div className="flex items-center gap-2">
											<div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
											<span>{t("settings:codebase.semanticIndex.syncing")}</span>
										</div>
									)}
									{indexStatus.status === "pending" && (
										<div className="flex items-center gap-2">
											<div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse"></div>
											<span>{t("settings:codebase.semanticIndex.pendingSync")}</span>
										</div>
									)}
									{indexStatus.status === "success" && (
										<div className="flex items-center gap-2">
											<div className="w-3 h-3 bg-green-500 rounded-full"></div>
											<span>{t("settings:codebase.semanticIndex.syncSuccess")}</span>
										</div>
									)}
									{indexStatus.status === "failed" && (
										<div className="flex items-center gap-2">
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger>
														<div className="flex items-center gap-2">
															<div className="w-3 h-3 bg-red-500 rounded-full"></div>
															<span>
																{t("settings:codebase.semanticIndex.syncFailed")}
															</span>
															<Badge variant="destructive" className="text-xs">
																{indexStatus.failedFiles?.length || 0}
															</Badge>
														</div>
													</TooltipTrigger>
													<TooltipContent>
														<p>
															{indexStatus.errorMessage ||
																t("settings:codebase.semanticIndex.syncFailedFiles")}
														</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>

											<Popover>
												<PopoverTrigger asChild>
													<Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
														<AlertCircle className="w-3 h-3 mr-1" />
														{t("settings:codebase.semanticIndex.viewDetails")}
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-80 max-h-60 overflow-y-auto">
													<div className="space-y-3">
														<div className="flex items-center gap-2">
															<AlertCircle className="w-4 h-4 text-red-500" />
															<h4 className="font-medium">
																{t(
																	"settings:codebase.semanticIndex.syncFailedFilesTitle",
																)}
															</h4>
														</div>

														{indexStatus.errorMessage && (
															<p className="text-sm text-vscode-errorForeground">
																{indexStatus.errorMessage}
															</p>
														)}

														{indexStatus.failedFiles &&
														indexStatus.failedFiles.length > 0 ? (
															<div className="space-y-2">
																<div className="flex justify-between items-center">
																	<p className="text-sm font-medium">
																		{t(
																			"settings:codebase.semanticIndex.failedFileList",
																		)}
																	</p>
																	<Button
																		variant="ghost"
																		size="sm"
																		className="h-6 px-2 text-xs"
																		onClick={async () => {
																			try {
																				const fileText =
																					indexStatus.failedFiles?.join(
																						"\n",
																					) || ""
																				await navigator.clipboard.writeText(
																					fileText,
																				)
																			} catch (error) {
																				console.error(
																					"Failed to copy to clipboard:",
																					error,
																				)
																			}
																		}}
																		disabled={disabled}>
																		<Copy className="w-3 h-3 mr-1" />
																		{t("settings:codebase.semanticIndex.copy")}
																	</Button>
																</div>
																<div className="max-h-40 overflow-y-auto border border-vscode-input-border rounded p-2 bg-vscode-textBlockQuote-background">
																	<ul className="text-xs space-y-1">
																		{indexStatus.failedFiles.map((file, index) => (
																			<li
																				key={`${file}-${index}`}
																				className={`text-vscode-errorForeground font-mono p-1 rounded transition-colors duration-150 ${disabled ? "" : "hover:bg-vscode-list-hoverBackground cursor-pointer hover:text-vscode-foreground hover:underline"}`}
																				onClick={() =>
																					!disabled &&
																					handleOpenFailedFile(file)
																				}>
																				{file}
																			</li>
																		))}
																	</ul>
																</div>
															</div>
														) : (
															<p className="text-sm text-vscode-descriptionForeground">
																{t("settings:codebase.semanticIndex.noFailedFiles")}
															</p>
														)}
													</div>
												</PopoverContent>
											</Popover>
										</div>
									)}
								</>
							)}
						</div>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<div>
										<Button
											onClick={onRebuild}
											variant="outline"
											size="sm"
											className="flex items-center gap-1"
											disabled={indexStatus.status === "running" || isPendingEnableSection}>
											<RefreshCw
												className={`w-3 h-3 ${indexStatus.status === "running" && !isPendingEnableSection ? "animate-spin" : ""}`}
											/>
											{t("settings:codebase.semanticIndex.rebuild")}
										</Button>
									</div>
								</TooltipTrigger>
								{isPendingEnableSection && (
									<TooltipContent>
										<p>
											{isPendingEnable
												? t("settings:codebase.general.onlyCostrictProviderSupport")
												: t("settings:codebase.semanticIndex.codebaseIndexDisabled")}
										</p>
									</TooltipContent>
								)}
							</Tooltip>
						</TooltipProvider>
					</div>
				</div>
			)
		},
		[handleOpenFailedFile, isPendingEnable, t],
	)

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message = event.data

			if (message.type === "codebaseIndexStatusResponse" && message.payload?.status) {
				const { embedding, codegraph } = message.payload.status
				startPolling()
				if (embedding) {
					setSemanticIndex(mapIndexStatusInfoToIndexStatus(embedding, t))
				}
				if (codegraph) {
					setCodeIndex(mapIndexStatusInfoToIndexStatus(codegraph, t))
				}

				// If build status is success/failed, stop polling
				if (shouldStopPolling(embedding, codegraph)) {
					stopPolling()
				}
			} else if (message.type === "zgsmCodebaseIndexEnabled" && setCachedStateField) {
				setCachedStateField("zgsmCodebaseIndexEnabled", message.payload)
			}
		},
		[setCachedStateField, shouldStopPolling, startPolling, stopPolling, t],
	)

	useEvent("message", handleMessage)

	return (
		<div>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex items-center gap-2">
									<VSCodeCheckbox
										defaultChecked={zgsmCodebaseIndexEnabled}
										onClick={handleCodebaseIndexToggle}
										disabled={isPendingEnable}
									/>
									<div>{t("settings:codebase.general.codebaseIndexBuild")}</div>
								</div>
							</TooltipTrigger>
							{isPendingEnable && (
								<TooltipContent>
									<p>{t("settings:codebase.general.onlyCostrictProviderSupport")}</p>
								</TooltipContent>
							)}
						</Tooltip>
					</TooltipProvider>
				</div>
			</SectionHeader>

			<Section>
				<div className={`space-y-6 ${!zgsmCodebaseIndexEnabled ? "opacity-50" : ""}`}>
					{renderIndexSection(
						t("settings:codebase.semanticIndex.title"),
						t("settings:codebase.semanticIndex.description"),
						semanticIndex,
						handleRebuildSemanticIndex,
						!zgsmCodebaseIndexEnabled,
						shouldDisableAll,
					)}

					{renderIndexSection(
						t("settings:codebase.codeIndex.title"),
						t("settings:codebase.codeIndex.description"),
						codeIndex,
						handleRebuildCodeIndex,
						!zgsmCodebaseIndexEnabled,
						shouldDisableAll,
					)}

					<div className={`flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background`}>
						<div className="flex items-center gap-4 font-bold">
							<FileText className="w-4 h-4" />
							<div>{t("settings:codebase.ignoreFileSettings.title")}</div>
						</div>
						<div className="text-vscode-descriptionForeground text-sm mb-3">
							{t("settings:codebase.ignoreFileSettings.description")}
						</div>
						<Button onClick={handleEditIgnoreFile} variant="outline" size="sm" className="w-fit">
							{t("settings:codebase.ignoreFileSettings.edit")}
						</Button>
					</div>
				</div>
			</Section>
		</div>
	)
}
