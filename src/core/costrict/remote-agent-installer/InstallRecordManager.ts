import * as fs from "fs/promises"
import * as path from "path"
import { createLogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"
import { safeWriteJson } from "../../../utils/safeWriteJson"
import { getGlobalCostrictDirectory } from "../../../services/roo-config/index"
import { getCheckIntervalMs } from "./utils"
import type { LocalInstallRecord } from "./types"

const logger = createLogger(Package.outputChannel)
const LOG_PREFIX = "[remote-agent-installer:record]"

const CURRENT_SCHEMA_VERSION = 1

const defaultRecord: LocalInstallRecord = {
	schemaVersion: CURRENT_SCHEMA_VERSION,
	installedVersion: "0.0.0",
	lastCheckedAt: 0,
	installState: "none",
	manifest: {
		agents: [],
		commands: [],
		skills: [],
		rules: [],
		mcp: [],
	},
}

export class InstallRecordManager {
	private recordPath: string

	constructor(recordPath?: string) {
		this.recordPath = recordPath || path.join(getGlobalCostrictDirectory(), "remote-agent-package.json")
	}

	async read(): Promise<LocalInstallRecord> {
		try {
			const data = await fs.readFile(this.recordPath, "utf-8")
			const parsed = JSON.parse(data) as Partial<LocalInstallRecord>

			if (!parsed.schemaVersion || parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) {
				logger.warn(`${LOG_PREFIX} Schema version mismatch or missing, resetting to default record`)
				return { ...defaultRecord }
			}

			return {
				schemaVersion: parsed.schemaVersion,
				installedVersion: parsed.installedVersion || defaultRecord.installedVersion,
				lastCheckedAt: parsed.lastCheckedAt ?? defaultRecord.lastCheckedAt,
				installState: parsed.installState || defaultRecord.installState,
				manifest: {
					agents: parsed.manifest?.agents || [],
					commands: parsed.manifest?.commands || [],
					skills: parsed.manifest?.skills || [],
					rules: parsed.manifest?.rules || [],
					mcp: parsed.manifest?.mcp || [],
				},
			}
		} catch (error: any) {
			if (error.code === "ENOENT") {
				return { ...defaultRecord }
			}
			logger.warn(`${LOG_PREFIX} Failed to read install record, using default: ${error.message}`)
			return { ...defaultRecord }
		}
	}

	async write(record: LocalInstallRecord): Promise<void> {
		try {
			await safeWriteJson(this.recordPath, record)
		} catch (error: any) {
			logger.error(`${LOG_PREFIX} Failed to write install record: ${error.message}`)
			throw error
		}
	}

	shouldCheck(record: LocalInstallRecord): boolean {
		if (!record.lastCheckedAt) {
			return true
		}
		return Date.now() - record.lastCheckedAt >= getCheckIntervalMs()
	}
}
