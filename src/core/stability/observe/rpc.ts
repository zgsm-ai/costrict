/**
 * RPC observation (design §8, M19) — wraps the host-side proxyFetch relay.
 * One operation per request (retries are separate attempts by construction);
 * api_group derives from the request path via the pathRewriter rule table;
 * success/failure durations are metrics-only; the collector's own control
 * traffic never flows through here. The webview's direct fetches (not
 * relayed) are a documented coverage gap — shown as such, never guessed.
 */
import type { StabilityService } from "../service"

const GROUPS: [RegExp, string][] = [
	[/^\/api\/v1\/(conversations|session)/, "session"],
	[/^\/api\/v1\/(permissions|permission)/, "permission"],
	[/^\/api\/v1\/(questions|question)/, "question"],
	[/^\/api\/v1\/(events|event)/, "event"],
	[/^\/api\/v1\/(agents|agent)/, "agent"],
	[/^\/api\/v1\/(models|provider|providers)/, "provider"],
	[/^\/api\/v1\/(runtime\/files|file)/, "file"],
]

export const apiGroupOf = (path: string): string => {
	const normalized = path.startsWith("/api/v1") ? path : `/api/v1${path.startsWith("/") ? path : `/${path}`}`
	for (const [pattern, group] of GROUPS) if (pattern.test(normalized)) return group
	return "other"
}

/** Time one proxied request; fire-and-forget settlement, never blocks the relay. */
export const observeRpc = <T>(service: StabilityService, path: string, run: () => Promise<T>): Promise<T> => {
	const op = service.begin("rpc", 30_000, { api_group: apiGroupOf(path) })
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
