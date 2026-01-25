import React from "react"
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogCancel,
	AlertDialogAction,
	AlertDialogHeader,
	AlertDialogFooter,
} from "@src/components/ui"
import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"

interface DiffActionDialogProps {
	isOpen: boolean
	filePath: string
	rightDocUri: string
	sessionId?: string
	onClose: () => void
	onAccept: (rightDocUri: string) => void
	onReject: (rightDocUri: string) => void
	onAlwaysAccept: (rightDocUri: string, sessionId: string) => void
}

export const DiffActionDialog: React.FC<DiffActionDialogProps> = ({
	isOpen,
	filePath,
	rightDocUri,
	sessionId,
	onClose,
	onAccept,
	onReject,
	onAlwaysAccept,
}) => {
	const { t } = useTranslation()

	const handleAccept = () => {
		onAccept(rightDocUri)
		onClose()
	}

	const handleReject = () => {
		onReject(rightDocUri)
		onClose()
	}

	const handleAlwaysAccept = () => {
		if (sessionId) {
			onAlwaysAccept(rightDocUri, sessionId)
			onClose()
		}
	}
	// "geminiCliDiffChangesDialog": {
	// 	"title": "Gemini Cli 未保存的更改",
	// 	"description": "是否保存更改并继续？",
	// 	"cancelButton": "拒绝",
	// 	"discardButton": "保存",
	// 	"diffPath": "文件路径"
	// } onClose
	return (
		<AlertDialog open={isOpen} onOpenChange={onClose}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<AlertTriangle className="w-5 h-5 text-yellow-500" />
						{/* {t("settings:unsavedChangesDialog.title")} */}
						{t("chat:geminiCliDiffChangesDialog.title")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("chat:geminiCliDiffChangesDialog.diffPath")}: {filePath}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => handleReject()}>
						{t("chat:geminiCliDiffChangesDialog.cancelButton")}
					</AlertDialogCancel>
					{sessionId && (
						<AlertDialogAction
							onClick={() => handleAlwaysAccept()}
							className="bg-blue-600 hover:bg-blue-700">
							{t("chat:geminiCliDiffChangesDialog.alwaysAcceptButton")}
						</AlertDialogAction>
					)}
					<AlertDialogAction onClick={() => handleAccept()}>
						{t("chat:geminiCliDiffChangesDialog.confirmButton")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
