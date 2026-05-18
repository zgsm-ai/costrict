// src/services/mcp/asyncPolling/jsonPathLite.ts

/**
 * Supported JSONPath subset:
 *   $              → root
 *   $.field        → object property
 *   $.a.b          → nested property
 *   $.a[0].b       → array index inside a path
 *
 * Not supported: wildcards (*), recursive descent (..), filters, expressions.
 */

type Segment = { kind: "field"; name: string } | { kind: "index"; index: number }

const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*/
const INDEX_RE = /^\[(\d+)\]/

export function isValidJsonPath(path: string): boolean {
	try {
		parsePath(path)
		return true
	} catch {
		return false
	}
}

export function extractByJsonPath(root: unknown, path: string): unknown {
	const segments = parsePath(path)
	let cur: unknown = root
	for (const seg of segments) {
		if (cur === null || cur === undefined) return undefined
		if (seg.kind === "field") {
			if (typeof cur !== "object" || Array.isArray(cur)) return undefined
			cur = (cur as Record<string, unknown>)[seg.name]
		} else {
			if (!Array.isArray(cur)) return undefined
			cur = cur[seg.index]
		}
	}
	return cur
}

function parsePath(path: string): Segment[] {
	if (typeof path !== "string" || path.length === 0) {
		throw new Error("jsonPathLite: path must be a non-empty string")
	}
	if (path[0] !== "$") {
		throw new Error(`jsonPathLite: path must start with '$' (got: ${path})`)
	}
	// Reject wildcard / recursive descent up front for friendlier errors.
	if (path.includes("..") || path.includes("*")) {
		throw new Error(`jsonPathLite: unsupported syntax in path: ${path}`)
	}

	const segments: Segment[] = []
	let i = 1 // already consumed '$'
	while (i < path.length) {
		const ch = path[i]
		if (ch === ".") {
			i++
			const rest = path.slice(i)
			const m = rest.match(FIELD_RE)
			if (!m) throw new Error(`jsonPathLite: expected field name after '.' at position ${i} in '${path}'`)
			segments.push({ kind: "field", name: m[0] })
			i += m[0].length
		} else if (ch === "[") {
			const rest = path.slice(i)
			const m = rest.match(INDEX_RE)
			if (!m) throw new Error(`jsonPathLite: expected [<digits>] at position ${i} in '${path}'`)
			segments.push({ kind: "index", index: Number(m[1]) })
			i += m[0].length
		} else {
			throw new Error(`jsonPathLite: unexpected character '${ch}' at position ${i} in '${path}'`)
		}
	}
	return segments
}
