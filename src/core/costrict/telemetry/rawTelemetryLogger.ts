import { createLogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"

export function createRawTelemetryLogger(scope: string) {
	const logger = createLogger(Package.outputChannel)

	return {
		debug(message: string) {
			logger.debug(`[${scope}] ${message}`)
		},
		info(message: string) {
			logger.info(`[${scope}] ${message}`)
		},
		warn(message: string) {
			logger.warn?.(`[${scope}] ${message}`)
		},
		error(message: string) {
			logger.error(`[${scope}] ${message}`)
		},
	}
}
