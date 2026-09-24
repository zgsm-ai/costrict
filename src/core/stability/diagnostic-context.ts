/**
 * Ambient diagnostic context (JS adaptation of the JetBrains
 * DiagnosticContextElement): AsyncLocalStorage carries context/attributes/
 * payload suppliers across awaits inside one logical operation. Explicit
 * arguments to Diagnostics.report always win over ambient values; ambient
 * context never crosses process boundaries (webview contexts arrive via the
 * bridge's explicit context instead).
 */
import { AsyncLocalStorage } from "async_hooks"
import type { FactContext } from "./fact"

export interface AmbientDiagnostic {
	context?: FactContext
	attributes?: Record<string, string>
	payloads?: Record<string, () => string>
}

const storage = new AsyncLocalStorage<AmbientDiagnostic>()

/** Run `fn` with an ambient diagnostic context merged over any outer one. */
export const withDiagnosticContext = <T>(ambient: AmbientDiagnostic, fn: () => T): T => {
	const outer = storage.getStore()
	return storage.run(
		{
			context: { ...(outer?.context ?? {}), ...(ambient.context ?? {}) },
			attributes: { ...(outer?.attributes ?? {}), ...(ambient.attributes ?? {}) },
			payloads: { ...(outer?.payloads ?? {}), ...(ambient.payloads ?? {}) },
		},
		fn,
	) as T
}

/** Ambient snapshot for the current async context (test/inspection use). */
export const currentDiagnosticContext = (): AmbientDiagnostic => storage.getStore() ?? {}
