import { useMemo, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import CloudApp from "./CloudApp"

const isDevBuild = () => {
	try {
		return Boolean(import.meta.env.DEV)
	} catch {
		return false
	}
}

export default function CloudRoot() {
	const isDev = useMemo(() => isDevBuild(), [])
	const queryClient = useMemo(() => new QueryClient(), [])
	const [debugMode, setDebugMode] = useState(false)

	return (
		<QueryClientProvider client={queryClient}>
			<div className="flex h-screen min-h-0 flex-col overflow-hidden bg-vscode-editor-background">
				{isDev && (
					<div className="shrink-0 flex items-center justify-end gap-2 border-b border-vscode-panel-border bg-vscode-editor-background/95 px-3 py-2 backdrop-blur">
						<button
							type="button"
							onClick={() => setDebugMode((current) => !current)}
							className="rounded-md border border-vscode-panel-border px-3 py-1 text-xs text-vscode-descriptionForeground hover:bg-vscode-toolbar-hoverBackground hover:text-vscode-foreground">
							{debugMode ? "切换到 Cloud 正式页" : "切换到 Cloud 调试页"}
						</button>
					</div>
				)}
				<div className="min-h-0 flex-1 overflow-hidden">
					<CloudApp debugMode={isDev && debugMode} />
				</div>
			</div>
		</QueryClientProvider>
	)
}
