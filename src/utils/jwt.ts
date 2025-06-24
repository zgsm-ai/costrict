export function parseJwt(token: string) {
	const parts = token.split(".")
	if (parts.length !== 3) {
		throw new Error("Invalid JWT")
	}
	const payload = parts[1]
	const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/")) // base64url → base64 → decode
	return JSON.parse(decoded)
}
