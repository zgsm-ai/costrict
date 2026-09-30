/**
 * Credential redaction for v2 high-fidelity diagnostic details (port of the
 * JetBrains DiagnosticRedactor, fail-closed). Order matters: multi-line
 * private keys and full header values go first, then structured key/value
 * scanning — so secrets cannot survive at shard boundaries or behind JSON
 * escape quotes. Callers MUST reject the detail draft when redaction itself
 * throws; a redaction failure never fails open.
 *
 * `field()` redacts a known sensitive attribute wholesale (the whole value is
 * a credential) instead of running free-text scans over it.
 */
export interface Redacted {
	text: string
	changed: boolean
}

const PEM = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/gi
const HEADER = /(^[ \t]*)(Proxy-Authorization|Authorization|Set-Cookie|Cookie)([ \t]*:[ \t]*)[^\r\n]*/gim
const URL = /((?:https?|ssh):\/\/)([^\s/@:]+):([^\s/@]+)@/gi
const QUERY = /([?&](?:access_token|refresh_token|api_key|api_token|token|password|client_secret)=)[^&#\s]+/gi
const KEY =
	/(?<![A-Za-z0-9_-])(["']?((?:access[ _-]?token|refresh[ _-]?token|api[ _-]?(?:key|token)|token|password|client[ _-]?secret|proxy[ _-]?authorization|authorization|set[ _-]?cookie|cookie|OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AZURE_CLIENT_SECRET|GOOGLE_APPLICATION_CREDENTIALS|GH_TOKEN|GITHUB_TOKEN|KILO_SERVER_PASSWORD))["']?[ \t]*[:=][ \t]*)/gi
const JWT = /(?<![A-Za-z0-9_-])([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)(?![A-Za-z0-9_-])/g

const type = (key: string): string => {
	const lower = key.toLowerCase()
	if (lower.includes("password")) return "password"
	if (lower.includes("client")) return "client-secret"
	if (lower.includes("secret") || key.startsWith("AWS_") || key.startsWith("AZURE_") || key.startsWith("GOOGLE_"))
		return "cloud-credential"
	if (lower.includes("access")) return "access-token"
	if (lower.includes("refresh")) return "refresh-token"
	if (lower.includes("authorization") || lower.includes("cookie")) return lower.replace(/[ _]/g, "-")
	return "api-token"
}

/** End of a credential value: quoted strings keep escape parity; bare values stop at structural punctuation. */
const end = (text: string, start: number, key: string): number => {
	if (key.toLowerCase().includes("authorization")) {
		let i = start
		while (i < text.length && !"\r\n\t ,".includes(text[i])) i++
		if (text.slice(start, i).toLowerCase() === "digest") {
			while (i < text.length && !"\r\n".includes(text[i])) i++
			return i
		}
		while (i < text.length && /\s/.test(text[i])) i++
		while (i < text.length && !"\r\n\t ,".includes(text[i])) i++
		return i
	}
	if (start === text.length) return start
	const quote = text[start]
	if (quote === '"' || quote === "'") {
		let i = start + 1
		while (i < text.length) {
			if (text[i] === "\\") {
				i += 2
				continue
			}
			if (text[i] === quote) return i + 1
			i += 1
		}
		return text.length
	}
	let i = start
	while (i < text.length && !",;}&\r\n\t ".includes(text[i])) i += 1
	while (i > start && /\s/.test(text[i - 1])) i -= 1
	return i
}

const headers = (text: string): string =>
	text.replace(
		HEADER,
		(_m, indent: string, name: string, sep: string) => `${indent}${name}${sep}<redacted:${name.toLowerCase()}>`,
	)

const url = (text: string): string =>
	text.replace(URL, (_m, scheme: string, host: string) => `${scheme}${host}:<redacted:url-credential>@`)

const values = (text: string): string => {
	let out = ""
	let index = 0
	KEY.lastIndex = 0
	for (;;) {
		const match = KEY.exec(text)
		if (match === null) {
			out += text.slice(index)
			break
		}
		if (match.index < index) {
			// zero-length/overlapping match guard (global regex state)
			KEY.lastIndex = match.index + 1
			continue
		}
		out += text.slice(index, match.index + match[0].length)
		const start = match.index + match[0].length
		const stop = end(text, start, match[2])
		if (start === stop) {
			index = stop
			continue
		}
		out += `<redacted:${type(match[2])}>`
		index = stop
	}
	return out
}

/** JOSE check: header part must be valid base64url JSON carrying a non-blank alg. */
const jose = (part: string): boolean => {
	try {
		const bytes = Buffer.from(part, "base64url")
		const parsed = JSON.parse(bytes.toString("utf8")) as { alg?: unknown }
		return typeof parsed.alg === "string" && parsed.alg.length > 0
	} catch {
		// Invalid base64 or a JSON header just means "not a JWT"; cancellation
		// and fatal errors still propagate to Diagnostics.
		return false
	}
}

export const DiagnosticRedactor = {
	clean(text: string): Redacted {
		const out = jwt(values(url(headers(text.replace(PEM, "<redacted:private-key>")))))
		return { text: out, changed: out !== text }
	},
	/** Known sensitive attribute: the whole value belongs to a credential. */
	field(name: string, value: string): Redacted {
		KEY.lastIndex = 0
		const match = KEY.exec(`${name}=`)
		KEY.lastIndex = 0
		if (match === null || match.index !== 0) return this.clean(value)
		return { text: `<redacted:${type(match[2])}>`, changed: true }
	},
}

const jwt = (text: string): string => text.replace(JWT, (m, header: string) => (jose(header) ? "<redacted:jwt>" : m))
