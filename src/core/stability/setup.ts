/**
 * Integration glue (design §8) — assembles the stability stack for the cloud
 * ui mode branch of extension activation and exposes a single controller the
 * sidebar provider and command handlers hook into. Probes feed the service;
 * the controller tracks owned webview resources and availability inputs
 * (panel visibility + window focus); stop() records plugin.shutdown from the
 * real platform lifecycle (deactivate).
 */
import * as vscode from "vscode"
import { isErrorShapedLine, isStabilityOwnLine } from "./log-mirror"
import { StabilityService } from "./service"
import { ConnectionObservation } from "./observe/connection"
import { PanelObservation } from "./observe/panel"
import { Availability } from "./observe/availability"
import { observeGlobalFaults, observeIdeOperation } from "./observe/ide"
import { observeRpc } from "./observe/rpc"
import { receiveStabilityDiagnostics, receiveStabilityFacts, type StabilityFactsMessage } from "./webview-bridge"
import type { IdStore } from "./ids"

export interface StabilityContextLike {
	subscriptions: { push(disposable: vscode.Disposable): unknown }
	globalState: vscode.Memento
	extensionPath: string
	extensionMode?: vscode.ExtensionMode
}

const globalStateStore = (memento: vscode.Memento): IdStore => ({
	get: (key) => memento.get<string | undefined>(key),
	set: (key, value) => void memento.update(key, value),
})

const SLICE_MS = 30_000

export class StabilityController {
	readonly service: StabilityService
	readonly connection: ConnectionObservation
	readonly panel: PanelObservation
	readonly availability: Availability

	/** Mirror a WARN/ERROR record into the v2 diagnostics pipeline (bounded, async). */
	mirror(input: Parameters<StabilityService["mirror"]>[0]): void {
		this.service.mirror(input)
	}

	/**
	 * Heuristic log-line mirror (JB's KiloLog-mirror equivalent for our
	 * unstructured output channel): error-shaped lines become diagnostics;
	 * the collector's own lines never feed back (log-mirror.ts classifier).
	 */
	mirrorLogLine(line: string): void {
		if (isStabilityOwnLine(line) || !isErrorShapedLine(line)) return
		this.service.mirror({
			severity: "error",
			component: "extension",
			message: line.slice(0, 2048),
		})
	}
	private readonly disposers: (() => void)[] = []
	private visible = false
	private focused = true

	constructor(context: StabilityContextLike, log: (line: string) => void, version: string) {
		this.service = new StabilityService({
			store: globalStateStore(context.globalState),
			pluginVersion: version,
			ideBuild: vscode.version,
			dev: context.extensionMode === vscode.ExtensionMode.Development,
			test: context.extensionMode === vscode.ExtensionMode.Test,
			log: (message) => log(`[stability] ${message}`),
		})
		this.connection = new ConnectionObservation(this.service)
		this.panel = new PanelObservation(this.service)
		this.availability = new Availability(this.service)
		// Availability state follows connection transitions, not just the 30s tick.
		this.connection.onTransition = () => this.tickAvailability()

		this.disposers.push(observeGlobalFaults(this.service))
		this.disposers.push(
			this.watch(
				vscode.window.onDidChangeWindowState,
				(state) => {
					this.focused = state.focused
					// Focus loss is a TRUSTED close boundary — record the open
					// interval (update(false,…) closes it); pause() discards and is
					// reserved for genuinely untrusted close times (suspend).
					this.tickAvailability()
				},
				context,
			),
		)
		// M13 invariant: 30s slicing needs a periodic tick — visibility/focus
		// CHANGE events alone never slice a steady visible session.
		const slice = setInterval(() => this.tickAvailability(), SLICE_MS)
		slice.unref?.()
		this.disposers.push(() => clearInterval(slice))
		this.service.start()
	}

	private watch<T>(event: vscode.Event<T>, listener: (value: T) => void, context: StabilityContextLike): () => void {
		const disposable = event(listener)
		context.subscriptions.push(disposable)
		return () => disposable.dispose()
	}

	/** webview view visibility changed (per active panel). */
	viewStateChanged(visible: boolean): void {
		this.visible = visible
		if (visible) {
			const token = this.service.owned.acquire("webview")
			this.disposers.push(() => token.close())
			this.panel.conditionMet("view")
		}
		this.tickAvailability()
	}

	/** Availability state derives from the connection observer, never guessed. */
	private tickAvailability(): void {
		const connection = this.connection.getState()
		const state =
			connection === "connected"
				? "ready"
				: this.connection.hasEverConnected() || connection === "connecting"
					? "connecting"
					: "error"
		this.availability.update(this.visible, this.focused, state, Date.now(), performance.now())
	}

	/** Route one inbound webview message; returns true when consumed. */
	handleWebviewMessage(message: unknown): boolean {
		if (typeof message !== "object" || message === null) return false
		const typed = message as { type?: unknown }
		if (typed.type === "stabilityFacts") {
			receiveStabilityFacts(this.service, message as StabilityFactsMessage, (draft) => {
				// webview.state doubles as M03 condition input — never an extra denominator.
				if (draft.name === "webview.state") {
					const component = String(draft.data.component ?? "")
					const state = String(draft.data.state ?? "")
					this.panel.webviewState(component, state)
				}
			})
			return true
		}
		if (typed.type === "stabilityDiagnostics") {
			receiveStabilityDiagnostics(this.service, message)
			return true
		}
		return false
	}

	rpc<T>(path: string, run: () => Promise<T>): Promise<T> {
		return observeRpc(this.service, path, run)
	}

	ide<T>(
		operation: "open_file" | "open_diff" | "execute_command" | "switch_git_branch" | "switch_workspace",
		run: () => Promise<T>,
	): Promise<T> {
		return observeIdeOperation(this.service, operation, run)
	}

	/** Deterministic write barrier — drains one batch now (tests/acceptance). */
	async drain(): Promise<void> {
		await this.service.drain()
	}

	async stop(kind: "app_close" | "unload"): Promise<void> {
		for (const dispose of this.disposers.splice(0)) dispose()
		this.connection.close()
		this.panel.close()
		await this.service.stop(kind)
	}
}

let controller: StabilityController | undefined

/** Start the stability stack once per extension host (cloud ui mode only). */
export const startStability = (
	context: StabilityContextLike,
	log: (line: string) => void,
	version: string,
): StabilityController => {
	if (controller) return controller
	controller = new StabilityController(context, log, version)
	return controller
}

export const stabilityController = (): StabilityController | undefined => controller
