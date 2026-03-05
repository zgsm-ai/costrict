export { PROJECT_WIKI_VERSION, getSubtaskDir, getHomeDir, getGlobalCommandsDir } from "@roo-code/types"

export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.stack || error.message
	}
	return String(error)
}
