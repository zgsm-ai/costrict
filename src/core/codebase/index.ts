import { ZgsmCodeBaseService } from "./client"

export const initZgsmCodeBase = async (zgsmBaseUrl: string, zgsmApiKey: string) => {
	const zgsmCodeBase = await ZgsmCodeBaseService.getInstance()

	try {
		zgsmCodeBase.setServerEndpoint(zgsmBaseUrl)
		zgsmCodeBase.setToken(zgsmApiKey)

		const { updated, version } = await zgsmCodeBase.updateCheck()

		if (!updated) {
			await zgsmCodeBase.download(version)
		}

		await zgsmCodeBase.startSync(version)
	} catch (error) {
		console.log(`[initZgsmCodeBase] ${error.message}`)
	} finally {
		zgsmCodeBase.updateCLientPoll()
	}
}
