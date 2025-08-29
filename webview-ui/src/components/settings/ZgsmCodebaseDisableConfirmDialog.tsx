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
					<AlertDialogDescription>{t("settings:codebase.confirmDialog.description")}</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="text-sm">
					<div>{t("settings:codebase.confirmDialog.impact1")}</div>
					<div>{t("settings:codebase.confirmDialog.impact2")}</div>
					<div>{t("settings:codebase.confirmDialog.impact3")}</div>
					<div>{t("settings:codebase.confirmDialog.impact4")}</div>
				</div>
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
