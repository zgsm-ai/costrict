export type { WebviewMessage, WebViewMessagePayload } from "@roo-code/types"

//costrict: add a dedicated structured response channel for multiple choice form submissions
export type ClineAskResponse =
	| "yesButtonClicked"
	| "noButtonClicked"
	| "messageResponse"
	| "objectResponse"
	| "multipleChoiceResponse"
