import type { ClineProvider } from "../../../webview/ClineProvider"
import type { InlineCompletionHost } from "./InlineCompletionHost"

/**
 * Adapts the heavyweight ClineProvider to the narrow {@link InlineCompletionHost}
 * contract that the autocomplete subsystem depends on.
 */
export class ClineInlineCompletionHost implements InlineCompletionHost {
	constructor(private readonly provider: ClineProvider) {}

	log(message: string): void {
		this.provider.log(message)
	}

	async getApiProvider(): Promise<string | undefined> {
		const { apiConfiguration } = await this.provider.getState()
		return apiConfiguration.apiProvider
	}
}
