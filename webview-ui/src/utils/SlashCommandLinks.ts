// webview-ui/src/utils/SlashCommandLinks.ts
/**
 * Utility for building slash command documentation links.
 *
 * @param topic - Specific documentation topic, e.g. "overview", or leave empty
 * @returns Full URL to the slash command documentation
 */

export function buildSlashCommandLink(topic: string = ""): string {
    const baseUrl = "https://docs.costrict.ai/product-features/slash-command"
    if (!topic) return baseUrl
    // Ensure topic does not start with a slash
    const cleanTopic = topic.replace(/^\//, "")
    return `${baseUrl}/${cleanTopic}`
}

