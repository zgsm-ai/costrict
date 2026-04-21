import { Package } from "../../shared/package"

export const DEFAULT_HEADERS = {
	"HTTP-Referer": "https://github.com/RooVetGit/Roo-Cline",
	"X-Title": "Roo Code",
	"User-Agent": `RooCode/3.52.1`,
	"X-Costrict-Version": `${Package.version}`,
} as const
