import { ZgsmCodeBaseSyncService } from "./client"

export const initZgsmCodeBase = async (zgsmBaseUrl: string, zgsmApiKey: string) => {
	const zgsmCodeBaseSync = await ZgsmCodeBaseSyncService.getInstance()

	try {
		zgsmCodeBaseSync.setServerEndpoint(zgsmBaseUrl)
		zgsmCodeBaseSync.setToken(zgsmApiKey)
		await zgsmCodeBaseSync.start()
	} catch (error) {
		console.log(`[initZgsmCodeBase] ${error.message}`)
	} finally {
		zgsmCodeBaseSync.clientDaemonPoll()
		zgsmCodeBaseSync.clientUpdatePoll()
	}
}
