import React from "react"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@src/components/ui"

interface ZgsmCodebaseDisableConfirmDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
}

export const ZgsmCodebaseDisableConfirmDialog: React.FC<ZgsmCodebaseDisableConfirmDialogProps> = ({
	open,
	onOpenChange,
	onConfirm,
}) => {
	const { t } = useAppTranslation()

	const handleCancel = () => {
		onOpenChange(false)
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("settings:codebase.confirmDialog.title")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("settings:codebase.confirmDialog.description")}
						<ul className="list-disc list-inside mt-2 space-y-1">
							<li>{t("settings:codebase.confirmDialog.impact1")}</li>
							<li>{t("settings:codebase.confirmDialog.impact2")}</li>
							<li>{t("settings:codebase.confirmDialog.impact3")}</li>
							<li>{t("settings:codebase.confirmDialog.impact4")}</li>
						</ul>
						<br />
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={handleCancel}>
						{t("settings:codebase.confirmDialog.cancel")}
					</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						{t("settings:codebase.confirmDialog.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}