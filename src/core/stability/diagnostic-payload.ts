/**
 * v2 diagnostic payload sharding (port of the JetBrains DiagnosticPayload).
 * Splits already-redacted bytes into reassemblable diagnostic.payload drafts:
 * ≤4KiB content per shard (headroom keeps the wire line under 32KiB), UTF-8
 * when the bytes decode cleanly and Base64 otherwise, SHA-256 and the original
 * length always describe the INPUT bytes (pre-truncation). Oversize inputs are
 * clipped head+tail to the budget with truncated=true.
 */
import { createHash } from "crypto"
import type { Draft } from "./fact"

export interface PayloadResult {
	drafts: Draft[]
	bytes: number
	hash: string
	truncated: boolean
}

export const MAX_PAYLOAD_BYTES = 1024 * 1024

/** Headroom for the fact envelope, JSON escaping and mutable indexes. */
const MAX_CONTENT_BYTES = 4 * 1024

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

const clip = (bytes: Uint8Array, budget: number): Uint8Array => {
	const out = new Uint8Array(budget)
	const head = Math.ceil(budget / 2)
	const tail = budget - head
	out.set(bytes.subarray(0, head), 0)
	out.set(bytes.subarray(bytes.length - tail), head)
	return out
}

/** Strict UTF-8 decode; returns undefined on any malformed sequence. */
const utf8 = (bytes: Uint8Array): string | undefined => {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
	} catch {
		return undefined
	}
}

/** Split by code points so a multi-byte character never straddles a shard. */
const chunks = (text: string, encoding: "utf8" | "base64"): string[] => {
	if (text.length === 0) return []
	if (encoding === "base64") {
		const out: string[] = []
		for (let i = 0; i < text.length; i += MAX_CONTENT_BYTES) out.push(text.slice(i, i + MAX_CONTENT_BYTES))
		return out
	}
	const out: string[] = []
	let part = ""
	let size = 0
	for (const char of text) {
		const next = Buffer.byteLength(char, "utf8")
		if (size + next > MAX_CONTENT_BYTES && part.length > 0) {
			out.push(part)
			part = ""
			size = 0
		}
		part += char
		size += next
	}
	if (part.length > 0) out.push(part)
	return out
}

export const DiagnosticPayload = {
	/** Shard redacted bytes for one incident payload kind; budget ≤ 1MiB. */
	parts(incident: string, kind: string, bytes: Uint8Array, budget: number = MAX_PAYLOAD_BYTES): PayloadResult {
		if (!Number.isInteger(budget) || budget < 1 || budget > MAX_PAYLOAD_BYTES) {
			throw new Error(`payload budget must be within 1..${MAX_PAYLOAD_BYTES}`)
		}
		const hash = sha(bytes)
		const truncated = bytes.length > budget
		const data = truncated ? clip(bytes, budget) : bytes
		const text = utf8(data)
		const encoding: "utf8" | "base64" = text === undefined ? "base64" : "utf8"
		const content = text ?? Buffer.from(data).toString("base64")
		const pieces = chunks(content, encoding)
		const drafts = pieces.map<Draft>((piece, index) => ({
			name: "diagnostic.payload",
			kind: "diagnostic",
			channel: "diagnostic",
			context: { incident_id: incident },
			purposes: ["logs"],
			schemaVersion: "2.0",
			data: {
				incident_id: incident,
				payload_kind: kind,
				chunk_index: index,
				chunk_count: pieces.length,
				encoding,
				content: piece,
				original_bytes: bytes.length,
				sha256: hash,
				truncated,
			},
		}))
		return { drafts, bytes: bytes.length, hash, truncated }
	},
}
