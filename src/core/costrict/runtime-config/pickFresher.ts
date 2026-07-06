import { jwtDecode } from "jwt-decode"

export interface CostrictTokenPair {
	access_token: string
	refresh_token: string
}

interface DecodedJwt {
	iat: number
	exp: number
}

interface TokenScore {
	refresh: DecodedJwt
	access: DecodedJwt
}

const ZERO: DecodedJwt = { iat: 0, exp: 0 }

const decode = (token: string | undefined): DecodedJwt => {
	if (!token) {
		return ZERO
	}
	try {
		const jwt = jwtDecode(token) as any
		return { iat: Number(jwt.iat) || 0, exp: Number(jwt.exp) || 0 }
	} catch {
		return ZERO
	}
}

/**
 * Score a token pair. The refresh_token is the primary freshness signal; the
 * access_token is decoded too so that an access-only rotation (refresh_token
 * unchanged, access_token refreshed) can still be detected as a tiebreaker.
 *
 * Returns null only when the pair is missing or its refresh_token cannot be
 * decoded — such a pair is treated as the oldest.
 */
const scoreToken = (pair: CostrictTokenPair | null): TokenScore | null => {
	if (!pair?.refresh_token) {
		return null
	}
	try {
		const rJwt = jwtDecode(pair.refresh_token) as any
		return {
			refresh: { iat: Number(rJwt.iat) || 0, exp: Number(rJwt.exp) || 0 },
			access: decode(pair.access_token),
		}
	} catch {
		return null
	}
}

/**
 * Compare two scores. Refresh_token fields dominate; access_token fields only
 * break ties, so an access-only rotation is detected without overriding a
 * genuinely fresher refresh_token. Returns <0 when `a` is older, >0 when newer,
 * 0 when equal.
 */
const compareScore = (a: TokenScore, b: TokenScore): number => {
	if (a.refresh.iat !== b.refresh.iat) return a.refresh.iat - b.refresh.iat
	if (a.refresh.exp !== b.refresh.exp) return a.refresh.exp - b.refresh.exp
	if (a.access.iat !== b.access.iat) return a.access.iat - b.access.iat
	if (a.access.exp !== b.access.exp) return a.access.exp - b.access.exp
	return 0
}

/**
 * Pick the fresher of two costrict token pairs.
 *
 * Used to reconcile `~/.costrict/share/auth.json` (which may be written by an
 * external process — the completion-agent runtime, the CLI, or another window)
 * against the value held in VSCode SecretStorage. After a window reload the
 * SecretStorage value can be stale; this lets the startup flow adopt the
 * on-disk token instead of clobbering it.
 *
 * Comparison order:
 *   1. refresh_token `iat` — monotonic across refreshes, the primary signal.
 *   2. refresh_token `exp` — tiebreaker on equal `iat`.
 *   3. access_token `iat` — detects an access-only rotation.
 *   4. access_token `exp` — final tiebreaker.
 *
 * Returns whichever input is fresher. When the two are equal, `a` is returned
 * for determinism. A null / undecodable input always loses to a valid one; if
 * both are null, null is returned.
 */
export const pickFresher = (a: CostrictTokenPair | null, b: CostrictTokenPair | null): CostrictTokenPair | null => {
	const sa = scoreToken(a)
	const sb = scoreToken(b)

	// Neither side can be scored: we have no basis to switch, so prefer the
	// first argument (current value) and avoid flipping to an unknown token.
	// Returns null only when both inputs themselves are null.
	if (!sa && !sb) {
		return a ?? b
	}
	if (!sa) {
		return b
	}
	if (!sb) {
		return a
	}
	return compareScore(sa, sb) >= 0 ? a : b
}
