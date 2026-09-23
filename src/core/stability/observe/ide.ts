/**
 * IDE operation observation (design §8, M23) + global fault hooks (M14).
 * Only plugin-provided capabilities are registered — open_file/open_diff/
 * execute_command/switch_git_branch/switch_workspace — and only where really
 * executed; unobservable capabilities are never faked as zero rates. Global
 * faults: process-level uncaughtException/unhandledRejection and webview
 * onerror forwards land in Faults as error.uncaught; normal cancellations
 * and AbortError are not faults.
 */
import type { StabilityService } from "../service"

export type IdeOperation = "open_file" | "open_diff" | "execute_command" | "switch_git_branch" | "switch_workspace"

/** Time one IDE capability execution. */
export const observeIdeOperation = <T>(
	service: StabilityService,
	operation: IdeOperation,
	run: () => Promise<T>,
): Promise<T> => {
	const op = service.begin("ide.operation", 30_000, { operation })
	return run().then(
		(value) => {
			op?.end("success")
			return value
		},
		(err: unknown) => {
			op?.end(err instanceof Error && err.name === "AbortError" ? "cancelled" : "failure", {
				error_code: err instanceof Error ? err.name.toLowerCase() : "other",
			})
			throw err
		},
	)
}

/** Install process-level fault hooks; returns a disposer. */
export const observeGlobalFaults = (service: StabilityService): (() => void) => {
	const uncaught = (err: unknown) => service.faults?.report(err, "host", false)
	const rejection = (err: unknown) => service.faults?.report(err, "host", false)
	process.on("uncaughtException", uncaught)
	process.on("unhandledRejection", rejection)
	return () => {
		process.off("uncaughtException", uncaught)
		process.off("unhandledRejection", rejection)
	}
}
