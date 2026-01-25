import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

import { ReviewHistoryEntry } from "../../../shared/codeReview"
import { createLogger, ILogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"

export class HistoryManager {
	private entries: ReviewHistoryEntry[] = []
	private storageDir: string
	private historyFilePath: string
	private logger: ILogger

	constructor() {
		this.logger = createLogger(Package.outputChannel)
		this.storageDir = path.join(os.homedir(), ".costrict", "review")
		this.historyFilePath = path.join(this.storageDir, "history.jsonl")
		this.ensureStorageDir().catch((error) => {
			this.logger.error(`[HistoryManager] Failed to create storage directory: ${error}`)
		})
	}

	private async ensureStorageDir(): Promise<void> {
		try {
			await fs.mkdir(this.storageDir, { recursive: true })
		} catch (error) {
			this.logger.error(`[HistoryManager] Failed to ensure storage directory: ${error}`)
			throw error
		}
	}

	public async addEntry(reviewTaskId: string, title: string, conclusion?: string): Promise<void> {
		const entry: ReviewHistoryEntry = {
			review_task_id: reviewTaskId,
			title,
			timestamp: new Date().toISOString(),
			conclusion,
		}
		this.entries.push(entry)

		try {
			await fs.appendFile(this.historyFilePath, JSON.stringify(entry) + "\n", "utf-8")
			this.logger.info(`[HistoryManager] Added and persisted entry for task ${reviewTaskId}`)
		} catch (error) {
			this.logger.error(`[HistoryManager] Failed to write entry to file: ${error}`)
		}
	}

	public async loadAll(): Promise<ReviewHistoryEntry[]> {
		try {
			const fileContent = await fs.readFile(this.historyFilePath, "utf-8")
			const lines = fileContent.trim().split("\n")
			const loadedEntries: ReviewHistoryEntry[] = []

			for (const line of lines) {
				if (!line.trim()) continue

				try {
					const entry = JSON.parse(line) as ReviewHistoryEntry

					if (entry.review_task_id && entry.title && entry.timestamp) {
						loadedEntries.push(entry)
						this.entries.push(entry)
					} else {
						this.logger.warn(`[HistoryManager] Skipping invalid entry: ${line}`)
					}
				} catch (parseError) {
					this.logger.warn(`[HistoryManager] Failed to parse line: ${parseError}`)
				}
			}

			this.logger.info(`[HistoryManager] Loaded ${loadedEntries.length} history entries`)
			return loadedEntries
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				this.logger.info("[HistoryManager] History file not found, returning empty array")
				return []
			}
			this.logger.error(`[HistoryManager] Failed to load history: ${error}`)
			return []
		}
	}

	public async deleteEntry(reviewTaskId: string): Promise<void> {
		this.entries = this.entries.filter((entry) => entry.review_task_id !== reviewTaskId)

		try {
			const fileContent = await fs.readFile(this.historyFilePath, "utf-8")
			const lines = fileContent.trim().split("\n")
			const filteredLines = lines.filter((line) => {
				if (!line.trim()) return true
				try {
					const entry = JSON.parse(line) as ReviewHistoryEntry
					return entry.review_task_id !== reviewTaskId
				} catch {
					return true
				}
			})

			await fs.writeFile(this.historyFilePath, filteredLines.join("\n") + "\n", "utf-8")
			this.logger.info(`[HistoryManager] Deleted entry for task ${reviewTaskId}`)
		} catch (error) {
			this.logger.error(`[HistoryManager] Failed to delete entry from file: ${error}`)
			throw error
		}
	}

	public async dispose(): Promise<void> {
		this.entries = []
		this.logger.info("[HistoryManager] Disposed and cleared in-memory entries")
	}
}
