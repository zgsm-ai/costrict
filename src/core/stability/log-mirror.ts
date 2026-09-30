/**
 * Heuristic log-line classification for the v2 log mirror (JB's KiloLog
 * mirror equivalent for our unstructured output channel). Conservative on
 * purpose: misses are acceptable, false alarms are not — only clearly
 * error-shaped lines mirror, and the collector's own output never feeds back.
 */
export const isStabilityOwnLine = (line: string): boolean =>
	line.startsWith("[stability]") || line.includes("[stability]")

export const isErrorShapedLine = (line: string): boolean =>
	/\[(error|stderr)\]/i.test(line) || /\bError:/i.test(line) || /Failed to /i.test(line)
