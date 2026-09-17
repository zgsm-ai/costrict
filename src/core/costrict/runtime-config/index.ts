import fs from "fs"
import os from "os"
import path from "path"

import { jwtDecode } from "jwt-decode"

import { CostrictAuthApi } from "../auth/authApi"
import { CostrictAuthConfig } from "../auth/authConfig"
import { getClientId } from "../../../utils/getClientId"
import { createLogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"
import { pickFresher } from "./pickFresher"

export { pickFresher }
export type { CostrictTokenPair } from "./pickFresher"

const logger = createLogger(Package.outputChannel)

export const readCostrictAccessToken = () => {
	const homeDir = os.homedir()

	if (!homeDir) {
		throw new Error("Unable to determine user home directory path")
	}

	const tokenDir = path.join(homeDir, ".costrict", "share")
	if (!fs.existsSync(tokenDir)) {
		return null
	}

	const tokenFilePath = path.join(tokenDir, "auth.json")
	if (!fs.existsSync(tokenFilePath)) {
		return null
	}

	return JSON.parse(fs.readFileSync(tokenFilePath, "utf8"))
}

export const writeCostrictRuntimeAuth = async (accessToken: string, refreshToken: string) => {
	// Guard: don't clobber a fresher token that an external process
	// (the CLI or another window) has written to auth.json.
	// After a window reload SecretStorage may hold a stale value; without this
	// guard every reload would roll back the external refresh. The comparison
	// covers both refresh and access tokens, so an access-only rotation on disk
	// is protected too.
	try {
		const existing = readCostrictAccessToken()
		if (existing?.refresh_token) {
			const incoming = { access_token: accessToken, refresh_token: refreshToken }
			const onDisk = {
				access_token: existing.access_token ?? "",
				refresh_token: existing.refresh_token,
			}
			// `pickFresher` returns the on-disk reference only when it is strictly
			// fresher; on a tie it returns `incoming`, so equal values still write.
			if (pickFresher(incoming, onDisk) === onDisk) {
				logger.info(
					"[runtime-config] skipping auth.json write: on-disk token is fresher than the incoming value",
				)
				return
			}
		}
	} catch (error) {
		logger.info(`[runtime-config] auth.json pre-write check skipped: ${error}`)
	}

	const homeDir = os.homedir()

	if (!homeDir) {
		throw new Error("Unable to determine user home directory path")
	}

	const tokenDir = path.join(homeDir, ".costrict", "share")
	if (!fs.existsSync(tokenDir)) {
		fs.mkdirSync(tokenDir, { recursive: true })
	}

	const tokenFilePath = path.join(tokenDir, "auth.json")
	const jwt = jwtDecode(accessToken) as any
	const { costrictBaseUrl } = await CostrictAuthApi.getInstance().getApiConfiguration()
	const baseUrl = costrictBaseUrl || CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()

	const config = {
		id: jwt.id,
		name: jwt.displayName,
		access_token: accessToken,
		refresh_token: refreshToken,
		machine_id: getClientId(),
		base_url: baseUrl,
	}

	fs.writeFileSync(tokenFilePath, JSON.stringify(config, null, 2), "utf8")
}
