/**
 * Error classification for v2 diagnostics (JS adaptation of the JetBrains
 * error-classifier): a stable `code` token for the exception shape, an
 * error_class vocab shared with the v1 fault counters, HTTP-flavored
 * attributes and JSON decode shape extraction (json_path / expected_type /
 * actual_type) for protocol and parsing failures.
 */
export interface ErrorInfo {
	code: string
	category: string
	attributes: Record<string, string>
}

const networkShape = (message: string): boolean =>
	/network|fetch|connect|timeout|socket|econn|enotfound|etimedout|aborted/i.test(message)

/** error_class vocab (dictionary ERROR_CLASSES) driven by the JS error shape. */
export const categoryOf = (error: unknown): string => {
	if (error instanceof TypeError) return "type_error"
	if (error instanceof RangeError) return "range_error"
	if (error instanceof SyntaxError) return "syntax_error"
	if (error instanceof ReferenceError) return "reference_error"
	if (error instanceof Error && error.name === "AbortError") return "abort_error"
	if (error instanceof Error && networkShape(error.message)) return "network_error"
	return "other"
}

/** Stable code token: builtin name for JS errors, name property otherwise. */
export const codeOf = (error: unknown): string => {
	if (error instanceof Error) return error.name || "Error"
	if (typeof error === "string") return "string"
	return error?.constructor && typeof error.constructor.name === "string" ? error.constructor.name : "unknown"
}

export const ErrorClassifier = {
	classify(error: unknown): ErrorInfo {
		return { code: codeOf(error), category: categoryOf(error), attributes: {} }
	},

	/** HTTP failure flavor: status-driven cause and route-free attributes. */
	observe(error: unknown, status: number, route?: string, method?: string): ErrorInfo {
		const category =
			status >= 500
				? "network_error"
				: status === 429
					? "network_error"
					: status >= 400
						? "other"
						: categoryOf(error)
		const attributes: Record<string, string> = { http_status: String(status) }
		if (route) attributes.route = route
		if (method) attributes.method = method
		return { code: status >= 400 ? `http_${status}` : codeOf(error), category, attributes }
	},

	/**
	 * JSON decode shape: on failure returns the parse position/path context
	 * and the expected vs actual type for structural mismatches. Returns
	 * undefined when the payload parses cleanly.
	 */
	decode(payload: string, expected?: string): ErrorInfo | undefined {
		let parsed: unknown
		try {
			parsed = JSON.parse(payload)
		} catch (err) {
			const position = err instanceof SyntaxError ? /position (\d+)/i.exec(err.message)?.[1] : undefined
			return {
				code: "json_parse",
				category: err instanceof SyntaxError ? "syntax_error" : categoryOf(err),
				attributes: {
					json_path: position ? `$@${position}` : "$",
					actual_type:
						typeof payload === "string" && payload.trimStart().startsWith("{") ? "object" : "other",
					...(expected ? { expected_type: expected } : {}),
				},
			}
		}
		if (expected && typeof parsed !== expected) {
			return {
				code: "json_shape",
				category: "type_error",
				attributes: { json_path: "$", expected_type: expected, actual_type: typeof parsed },
			}
		}
		return undefined
	},
}
