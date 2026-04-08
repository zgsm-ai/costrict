import {
	createLogger as createBaseLogger,
	deactivate as deactivateBaseLogger,
	type LoggerOptions,
} from "@roo-code/logger"
import { Package } from "../shared/package"

export * from "@roo-code/logger"

export function createLogger(name: string = Package.outputChannel, options: LoggerOptions = {}) {
	return createBaseLogger(name, options)
}

export const deactivate = deactivateBaseLogger
