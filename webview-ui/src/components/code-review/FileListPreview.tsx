import { useAppTranslation } from "@/i18n/TranslationContext"
import FileStatusItem from "./FileStatusItem"

interface FileChangeItem {
	path: string
	status: string
	oldPath?: string
}

interface FileListPreviewProps {
	files: FileChangeItem[]
	isLoading: boolean
}

/**
 * Component to display a list of files with their Git statuses
 */
const FileListPreview = ({ files, isLoading }: FileListPreviewProps) => {
	const { t } = useAppTranslation()

	if (isLoading) {
		return (
			<div className="bg-vscode-sideBar-background border border-vscode-panel-border rounded-md overflow-hidden mb-4">
				<div className="flex items-center justify-center py-8 text-vscode-descriptionForeground">
					<div className="flex items-center gap-2">
						<i className="codicon codicon-loading codicon-modifier-spin"></i>
						<span className="text-sm">Loading...</span>
					</div>
				</div>
			</div>
		)
	}

	if (files.length === 0) {
		return (
			<div className="bg-vscode-sideBar-background border border-vscode-panel-border rounded-md overflow-hidden mb-4">
				<div className="flex items-center justify-center py-8 text-vscode-descriptionForeground">
					<div className="text-center">
						<i className="codicon codicon-info text-2xl mb-2"></i>
						<p className="text-sm">{t("codereview:welcomePage.noFiles")}</p>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="bg-vscode-sideBar-background border border-vscode-panel-border rounded-md overflow-hidden mb-4">
			<div className="max-h-[400px] overflow-y-auto">
				{files.map((file, index) => (
					<FileStatusItem
						key={`${file.path}-${index}`}
						path={file.path}
						status={file.status}
						oldPath={file.oldPath}
					/>
				))}
			</div>
		</div>
	)
}

export default FileListPreview
