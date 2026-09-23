/**
 * Panel observation (design §8, M01/M02/M03/M08). webview.setup covers
 * resolve→html→ready (M01); panel.load covers content assembly (M02);
 * plugin.readiness waits for five conditions — view visible, app ready,
 * workspace resolved, event stream subscribed, input available — where the
 * webview-side conditions arrive as webview.state transitions over the
 * bridge (M03's condition inputs double as diagnostics, never as extra
 * denominators). credentials.ready probes token availability (M08): the
 * plugin has no login of its own — waiting for cs-cloud credentials is
 * observed, authentication itself is not.
 */
import type { StabilityService } from "../service"
import type { Operation } from "../operation"

export type ReadinessCondition = "view" | "app" | "workspace" | "stream" | "input"

const ALL: readonly ReadinessCondition[] = ["view", "app", "workspace", "stream", "input"]

export class PanelObservation {
	private readonly service: StabilityService
	private setup: Operation | undefined
	private load: Operation | undefined
	private readiness: Operation | undefined
	private readonly conditions = new Set<ReadinessCondition>()
	private htmlProgressRecorded = false

	constructor(service: StabilityService) {
		this.service = service
	}

	/** M01: view resolution began. */
	setupBegin(): void {
		this.setup = this.service.begin("webview.setup", 30_000, { stage: "resolve" })
		this.htmlProgressRecorded = false
	}

	/** Idempotent per setup lifecycle — both loadContent success and the READY
	 * handshake reach this point; the duplicate carries no information. */
	setupHtmlInjected(): void {
		if (this.htmlProgressRecorded) return
		this.htmlProgressRecorded = true
		this.setup?.progress("html")
	}

	setupReady(): void {
		if (!this.setup || this.setup.isSettled) return
		this.setup.progress("ready")
		this.setup.end("success", { stage: "ready" })
	}

	setupFailed(errorCode: string): void {
		this.setup?.end("failure", { error_code: errorCode, cause: "plugin" })
	}

	/** M02: content load began (initial / recovery after error page). */
	loadBegin(trigger: "initial" | "recovery" | "reload"): void {
		this.load = this.service.begin("panel.load", 30_000, { trigger })
	}

	loadEnd(result: "success" | "failure", reason?: string): void {
		this.load?.end(result, result === "failure" && reason ? { reason } : {})
		this.load = undefined
	}

	/** M03: readiness begins at first activation; 60s deadline. */
	readinessBegin(): void {
		if (this.readiness) return
		this.readiness = this.service.begin("plugin.readiness", 60_000)
	}

	/** Host-side condition flips; webview conditions arrive via webviewState. */
	conditionMet(condition: ReadinessCondition): void {
		this.conditions.add(condition)
		this.readiness?.progress(condition)
		if (this.conditions.size >= ALL.length) {
			this.readiness?.end("success", { reason: "none" })
			this.readiness = undefined
		}
	}

	readinessBlocked(reason: "credentials_missing" | "other"): void {
		this.readiness?.end("blocked", { reason })
		this.readiness = undefined
	}

	/** Bridge input from webview.state facts — returns true when it fed a condition. */
	webviewState(component: string, state: string): boolean {
		switch (`${component}:${state}`) {
			case "app:ready":
				this.conditionMet("app")
				return true
			case "stream:open":
				this.conditionMet("stream")
				return true
			case "input:enabled":
				this.conditionMet("input")
				return true
			default:
				return false
		}
	}

	/** M08: probe credentials availability once at panel load. */
	async probeCredentials(read: () => Promise<string | undefined>): Promise<void> {
		const op = this.service.begin("credentials.ready", 30_000, { stage: "probe" })
		try {
			const token = await read()
			op?.end(token ? "success" : "blocked", token ? {} : { stage: "wait" })
			if (!token) this.readinessBlocked("credentials_missing")
		} catch (err) {
			op?.end("failure", { error_code: err instanceof Error ? err.name.toLowerCase() : "other", stage: "probe" })
		}
	}

	close(): void {
		this.setup?.end("cancelled")
		this.load?.end("cancelled")
		this.readiness?.end("cancelled")
		this.setup = undefined
		this.load = undefined
		this.readiness = undefined
	}
}
