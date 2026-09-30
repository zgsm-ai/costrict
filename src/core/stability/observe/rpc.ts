/**
 * RPC observation (design §8, M19) — wraps the host-side proxyFetch relay.
 * One operation per request (retries are separate attempts by construction);
 * api_group derives from the request path via the pathRewriter rule table;
 * failure settlement covers BOTH thrown errors and settled non-2xx HTTP
 * responses (an upstream 4xx/5xx never throws in the relay — without the
 * status check it settles as success and the only symptom is silence);
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

/** proxyFetch relays absolute URLs; classify on the pathname, never the origin. */
const pathnameOf = (path: string): string => {
	if (!/^https?:\/\//.test(path)) return path
	try {
		return new URL(path).pathname
	} catch {
		return path
	}
}

export const apiGroupOf = (path: string): string => {
	const pathname = pathnameOf(path)
	const normalized = pathname.startsWith("/api/v1")
		? pathname
		: `/api/v1${pathname.startsWith("/") ? pathname : `/${pathname}`}`
	for (const [pattern, group] of GROUPS) if (pattern.test(normalized)) return group
	return "other"
}

/** Time one proxied request; fire-and-forget settlement, never blocks the relay. */
export const observeRpc = <T>(service: StabilityService, path: string, run: () => Promise<T>): Promise<T> => {
	const group = apiGroupOf(path)
	const route = pathnameOf(path)
	const op = service.begin("rpc", 30_000, { api_group: group })
	return run().then(
		(value) => {
			const response = value instanceof Response ? value : undefined
			if (response && !response.ok) {
				const status = response.status
				op?.end("failure", { error_code: `http_${status}` })
				// v2: non-2xx settles without throwing — mirror it or the
				// failure is invisible from the plugin side (zero-token
				// sessions, "[object Object]" SDK errors over silent 401/404).
				service.mirror({
					severity: status >= 500 ? "error" : "warn",
					component: "rpc",
					message: `rpc ${group} failed: HTTP ${status}${response.statusText ? ` ${response.statusText}` : ""}`,
					context: op ? { operation_id: op.id } : undefined,
					attributes: { route, code: `http_${status}` },
				})
				return value
			}
			op?.end("success")
			return value
		},
		(err: unknown) => {
			op?.end(err instanceof Error && err.name === "AbortError" ? "cancelled" : "failure", {
				error_code: err instanceof Error ? err.name.toLowerCase() : "other",
			})
			// v2: mirror failures into the diagnostics bridge — the outbox
			// alone must explain WHAT threw, with payload and correlation.
			service.mirror({
				severity: "error",
				component: "rpc",
				message: `rpc ${group} failed: ${err instanceof Error ? err.message : String(err)}`,
				error: err instanceof Error ? err : undefined,
				context: op ? { operation_id: op.id } : undefined,
				attributes: { route, code: err instanceof Error ? err.name.toLowerCase() : "other" },
			})
			throw err
		},
	)
}
