import { useMemo, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

import { CheckpointMenu } from "./CheckpointMenu"
import { checkpointSchema } from "./schema"
import { GitCommitVertical } from "lucide-react"

type CheckpointSavedProps = {
	ts: number
	commitHash: string
	currentHash?: string
	checkpoint?: Record<string, unknown>
	isLast?: boolean
	onJumpToPreviousCheckpoint?: () => void
}

export const CheckpointSaved = ({
	checkpoint,
	currentHash,
	onJumpToPreviousCheckpoint,
	isLast,
	...props
}: CheckpointSavedProps) => {
	const { t } = useTranslation()
	const isCurrent = currentHash === props.commitHash
	const closeTimer = useRef<number | null>(null)

	useEffect(() => {
		return () => {
			if (closeTimer.current) {
				window.clearTimeout(closeTimer.current)
				closeTimer.current = null
			}
		}
	}, [])

	const metadata = useMemo(() => {
		if (!checkpoint) {
			return undefined
		}

		const result = checkpointSchema.safeParse(checkpoint)

		if (!result.success) {
			return undefined
		}

		return result.data
	}, [checkpoint])

	if (!metadata) {
		return null
	}

	return (
		<div className="flex items-center justify-between gap-2 pt-2 pb-3">
			<div className="flex items-center gap-2 text-blue-400 whitespace-nowrap">
				<GitCommitVertical className="w-4" />
				<span className="font-semibold">{t("chat:checkpoint.regular")}</span>
				{isCurrent && <span className="text-muted">({t("chat:checkpoint.current")})</span>}
			</div>
			<span
				className={cn("block w-full h-[2px] mt-[2px] text-xs", isLast && "animate-pulse")}
				style={{
					backgroundImage:
						"linear-gradient(90deg, rgba(0, 188, 255, .65), rgba(0, 188, 255, .65) 80%, rgba(0, 188, 255, 0) 99%)",
				}}></span>

			{/* Keep menu visible while hovering, popover is open, or briefly after close to prevent jump */}
			<div data-testid="checkpoint-menu-container" className={cn("h-4 -mt-2", "block")}>
				<CheckpointMenu
					ts={props.ts}
					commitHash={props.commitHash}
					checkpoint={metadata}
					onJumpToPreviousCheckpoint={onJumpToPreviousCheckpoint}
				/>
			</div>
		</div>
	)
}
