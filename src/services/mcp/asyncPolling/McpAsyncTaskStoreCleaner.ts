// src/services/mcp/asyncPolling/McpAsyncTaskStoreCleaner.ts
import type { McpAsyncTaskRecord } from "@roo-code/types"

const DAY_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS = 7 * DAY_MS
const MAX_PER_WORKSPACE = 100

export type McpAsyncTaskStoreCleanerDeps = {
	list: () => Promise<McpAsyncTaskRecord[]>
	delete: (id: string) => Promise<void>
	now?: () => number
}

export class McpAsyncTaskStoreCleaner {
	private now: () => number
	constructor(private readonly deps: McpAsyncTaskStoreCleanerDeps) {
		this.now = deps.now ?? Date.now
	}

	async run(): Promise<void> {
		const records = await this.deps.list()
		const t = this.now()

		const toDelete = new Set<string>()

		for (const r of records) {
			// Rule: completed/failed AND fetched older than 24h → drop
			if (r.terminalStatus && r.resultFetchedAt !== undefined && t - r.resultFetchedAt > DAY_MS) {
				toDelete.add(r.id)
				continue
			}
			// Rule: not yet terminal, older than 7 days → drop
			if (!r.terminalStatus && t - r.updatedAt > SEVEN_DAYS) {
				toDelete.add(r.id)
			}
		}

		const remaining = records.filter((r) => !toDelete.has(r.id))
		if (remaining.length > MAX_PER_WORKSPACE) {
			const overflow = remaining.length - MAX_PER_WORKSPACE
			// Prefer dropping fetched terminal records first, oldest first
			const sortedFetched = [...remaining]
				.filter((r) => r.terminalStatus && r.resultFetchedAt !== undefined)
				.sort((a, b) => (a.resultFetchedAt ?? 0) - (b.resultFetchedAt ?? 0))
			const sortedOther = [...remaining]
				.filter((r) => !(r.terminalStatus && r.resultFetchedAt !== undefined))
				.sort((a, b) => a.updatedAt - b.updatedAt)

			const queue = [...sortedFetched, ...sortedOther]
			for (let i = 0; i < overflow; i++) toDelete.add(queue[i].id)
		}

		for (const id of toDelete) {
			await this.deps.delete(id)
		}
	}
}
