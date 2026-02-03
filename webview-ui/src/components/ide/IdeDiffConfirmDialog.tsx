import { memo } from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface IdeDiffConfirmDialogProps {
	isOpen: boolean
	filePath: string
	fileName: string
	queueLength?: number // 新增:队列中还有多少个待处理
	onAccept: () => void
	onReject: () => void
	onAlwaysAllow: () => void
}

const IdeDiffConfirmDialog = memo(
	({ isOpen, filePath, fileName, queueLength = 0, onAccept, onReject, onAlwaysAllow }: IdeDiffConfirmDialogProps) => {
		return (
			<AlertDialog open={isOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							确认文件修改
							{queueLength > 0 && (
								<span className="text-sm text-vscode-descriptionForeground ml-2 font-normal">
									(还有 {queueLength} 个文件等待确认)
								</span>
							)}
						</AlertDialogTitle>
						<AlertDialogDescription>
							Gemini CLI 请求修改文件:
							<br />
							<code className="text-sm bg-vscode-input-background px-2 py-1 rounded mt-2 inline-block">
								{fileName}
							</code>
							<br />
							<span className="text-xs text-vscode-descriptionForeground mt-2 block">
								路径: {filePath}
							</span>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={onReject}>拒绝</AlertDialogCancel>
						<AlertDialogAction
							onClick={onAlwaysAllow}
							className="bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground">
							总是允许
						</AlertDialogAction>
						<AlertDialogAction onClick={onAccept}>接受</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		)
	},
)

IdeDiffConfirmDialog.displayName = "IdeDiffConfirmDialog"

export default IdeDiffConfirmDialog
