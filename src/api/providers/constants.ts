import { Package } from "../../shared/package"

export const DEFAULT_HEADERS = {
	"HTTP-Referer": "https://github.com/zgsm-ai/costrict",
	"X-Title": "Costrict",
	"X-Costrict-Version": `${Package.version}`,
} as const
