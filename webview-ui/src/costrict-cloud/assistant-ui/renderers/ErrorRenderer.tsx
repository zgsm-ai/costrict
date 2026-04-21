import { AlertCircle } from "lucide-react"

type ErrorRendererProps = {
	message: string
}

export function ErrorRenderer({ message }: ErrorRendererProps) {
	return (
		<div className="rounded-xl border border-vscode-errorForeground/30 bg-vscode-inputValidation-errorBackground/20 p-3">
			<div className="mb-2 flex items-center gap-2 text-sm font-medium text-vscode-errorForeground">
				<AlertCircle className="size-4" />
				<span>错误</span>
			</div>
			<div className="text-sm text-vscode-editor-foreground whitespace-pre-wrap break-words">{message}</div>
		</div>
	)
}

export default ErrorRenderer
