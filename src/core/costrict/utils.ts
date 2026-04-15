import fs from "fs"
import os from "os"
import path from "path"
import { jwtDecode } from "jwt-decode"
import { CostrictAuthApi, CostrictAuthConfig } from "./auth"
import { getClientId } from "../../utils/getClientId"

export const getWellKnownConfig = () => {
	try {
		const wellKnownPath = path.join(os.homedir(), ".costrict", "share", ".well-known.json")

		if (!fs.existsSync(wellKnownPath)) {
			return {
				services: [],
			}
		}

		return JSON.parse(fs.readFileSync(wellKnownPath, "utf-8"))
	} catch (error) {
		return {
			services: [],
		}
	}
}

export const writeCostrictAccessToken = async (accessToken: string, refreshToken: string) => {
	const homeDir = os.homedir()

	if (!homeDir) {
		throw new Error("Unable to determine user home directory path")
	}

	const tokenDir = path.join(homeDir, ".costrict", "share")

	// Ensure directory exists
	if (!fs.existsSync(tokenDir)) {
		fs.mkdirSync(tokenDir, { recursive: true })
	}
	const tokenFilePath = path.join(tokenDir, "auth.json")
	// Write token file
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
