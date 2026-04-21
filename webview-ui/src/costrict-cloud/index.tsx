import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "../index.css"
import "../../node_modules/@vscode/codicons/dist/codicon.css"

import { TooltipProvider } from "../components/ui/tooltip"
import { STANDARD_TOOLTIP_DELAY } from "../components/ui/standard-tooltip"
import CloudRoot from "./CloudRoot"

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<TooltipProvider delayDuration={STANDARD_TOOLTIP_DELAY}>
			<CloudRoot />
		</TooltipProvider>
	</StrictMode>,
)
