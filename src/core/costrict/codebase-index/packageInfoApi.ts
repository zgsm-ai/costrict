import { getClientId } from "../../../utils/getClientId"
import { CostrictAuthApi, CostrictAuthConfig } from "../auth"
import { PackageInfoResponse, VersionInfo } from "./types"

/**
 * Package information API class
 * Used to get client file verification information
 */
export class PackageInfoApi {
	/**
	 * Get package information for specified version
	 * @param version Version string in format "major.minor.micro", e.g. "1.0.731"
	 * @returns Promise<PackageInfoResponse> Returns package information response
	 * @throws Throws error when API call fails
	 */
	async getPackageInfo(versionInfo: VersionInfo): Promise<PackageInfoResponse> {
		const { costrictBaseUrl } = await CostrictAuthApi.getInstance().getApiConfiguration()
		const baseUrl = costrictBaseUrl || CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()
		const url = `${baseUrl}/costrict${versionInfo.infoUrl}`

		try {
			const response = await fetch(url, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"zgsm-request-id": getClientId(),
				},
			})

			if (!response.ok) {
				const errorData = await response.text()
				throw new Error(`Failed to get package information (${url}): ${errorData}`)
			}

			const data: PackageInfoResponse = await response.json()
			return data
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error occurred while getting package information: ${error.message}`)
			} else {
				throw new Error("Unknown error occurred while getting package information")
			}
		}
	}
}
