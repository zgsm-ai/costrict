// src/services/mcp/asyncPolling/McpAsyncTaskStore.ts
import * as fs from "fs/promises"
import * as path from "path"
import { createHash, randomUUID } from "node:crypto"
import type { McpAsyncTaskRecord } from "@roo-code/types"
import { McpAsyncTaskRecordSchema } from "@roo-code/types"
import { safeWriteJson } from "../../../utils/safeWriteJson"

const MAX_RAW_SUMMARY = 2048

export type McpAsyncTaskStoreOptions = {
	rootDir: string
	workspacePath?: string
	now?: () => number
	genId?: () => string
}

export type CreateInput = {
	serverName: string
	source?: "global" | "project"
	originalToolName: string
	taskId: string
	statusTool?: string
	executionId?: string
}

export type UpdateInput = Partial<Pick<McpAsyncTaskRecord, "lastStatus" | "lastMessage" | "rawSummary" | "executionId">>

export class McpAsyncTaskStore {
	private readonly filePath: string
	private readonly now: () => number
	private readonly genId: () => string

	constructor(private readonly opts: McpAsyncTaskStoreOptions) {
		this.now = opts.now ?? Date.now
		this.genId = opts.genId ?? (() => `rec_${randomUUID()}`)
		this.filePath = path.join(opts.rootDir, this.fileName(opts.workspacePath))
	}

	async list(): Promise<McpAsyncTaskRecord[]> {
		return this.load()
	}

	async create(input: CreateInput): Promise<McpAsyncTaskRecord> {
		const records = await this.load()
		const t = this.now()
		const rec: McpAsyncTaskRecord = McpAsyncTaskRecordSchema.parse({
			id: this.genId(),
			workspacePath: this.opts.workspacePath,
			executionId: input.executionId,
			serverName: input.serverName,
			source: input.source,
			originalToolName: input.originalToolName,
			taskId: input.taskId,
			statusTool: input.statusTool,
			createdAt: t,
			updatedAt: t,
		})
		records.push(rec)
		await this.persist(records)
		return rec
	}

	async update(id: string, patch: UpdateInput): Promise<McpAsyncTaskRecord> {
		const records = await this.load()
		const idx = records.findIndex((r) => r.id === id)
		if (idx === -1) throw new Error(`McpAsyncTaskStore.update: id ${id} not found`)
		const next: McpAsyncTaskRecord = {
			...records[idx],
			...patch,
			rawSummary: patch.rawSummary ? patch.rawSummary.slice(0, MAX_RAW_SUMMARY) : records[idx].rawSummary,
			lastCheckedAt: this.now(),
			updatedAt: this.now(),
		}
		records[idx] = next
		await this.persist(records)
		return next
	}

	async complete(id: string, terminalStatus: "completed" | "failed" | "unknown"): Promise<McpAsyncTaskRecord> {
		const records = await this.load()
		const idx = records.findIndex((r) => r.id === id)
		if (idx === -1) throw new Error(`McpAsyncTaskStore.complete: id ${id} not found`)
		records[idx] = {
			...records[idx],
			terminalStatus,
			updatedAt: this.now(),
		}
		await this.persist(records)
		return records[idx]
	}

	async delete(id: string): Promise<void> {
		const records = await this.load()
		const next = records.filter((r) => r.id !== id)
		await this.persist(next)
	}

	private async load(): Promise<McpAsyncTaskRecord[]> {
		try {
			const raw = await fs.readFile(this.filePath, "utf-8")
			const json = JSON.parse(raw) as unknown
			if (!Array.isArray(json)) return []
			const out: McpAsyncTaskRecord[] = []
			for (const item of json) {
				const parsed = McpAsyncTaskRecordSchema.safeParse(item)
				if (parsed.success) out.push(parsed.data)
			}
			return out
		} catch (err: unknown) {
			// ENOENT or malformed JSON → empty store
			return []
		}
	}

	private async persist(records: McpAsyncTaskRecord[]): Promise<void> {
		await fs.mkdir(path.dirname(this.filePath), { recursive: true })
		await safeWriteJson(this.filePath, records)
	}

	private fileName(workspacePath: string | undefined): string {
		if (!workspacePath) return "asyncTasks-global.json"
		const hash = createHash("sha1").update(workspacePath).digest("hex").slice(0, 12)
		return `asyncTasks-${hash}.json`
	}
}
