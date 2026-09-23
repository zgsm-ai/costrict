/**
 * Owned-resource counting (design §4, M24). Three closed kinds — webview /
 * subscription / child_process — counting extension-OWNED handles, never
 * process memory. acquire() returns an idempotent token; counts never go
 * negative; a single high value is not a leak (30s gauge snapshots carry the
 * trend).
 */
export type ResourceKind = "webview" | "subscription" | "child_process"

const KINDS: readonly ResourceKind[] = ["webview", "subscription", "child_process"]

export interface ResourceToken {
	close(): void
}

export class Resources {
	private readonly counts: Record<ResourceKind, number> = { webview: 0, subscription: 0, child_process: 0 }
	private readonly closed = new WeakSet<object>()

	acquire(kind: ResourceKind): ResourceToken {
		this.counts[kind]++
		const token = {
			close: () => {
				if (this.closed.has(token)) return
				this.closed.add(token)
				this.counts[kind] = Math.max(0, this.counts[kind] - 1)
			},
		}
		return token
	}

	snapshot(): Record<ResourceKind, number> {
		return { ...this.counts }
	}

	/** Fixed order, metrics-only sample drafts. */
	drafts(): { name: "resource.snapshot"; kind: "sample"; channel: "critical"; data: Record<string, unknown> }[] {
		return KINDS.map((kind) => ({
			name: "resource.snapshot" as const,
			kind: "sample" as const,
			channel: "critical" as const,
			data: { resource: kind, count: this.counts[kind] },
		}))
	}
}
