import { CostrictRawStoreClient } from "@roo-code/telemetry"
import type { RawStoreCommitPayload } from "@roo-code/telemetry"

import type { Repository, Commit } from "../code-review/git"
import type { ClineProvider } from "../../webview/ClineProvider"
import { sanitizeGitUrl, convertGitUrlToHttps } from "../../../utils/git"
import { getClientId } from "../../../utils/getClientId"
import { CostrictAuthService } from "../auth"
import { buildRawDiffPayload, countPatchDiffLines } from "./rawPayloadUtils"
import { createRawTelemetryLogger } from "./rawTelemetryLogger"

const MAX_COMMIT_DIFF_LENGTH = 50_000
const MAX_COMMIT_COMMENT_LENGTH = 150

export class RawCommitReporter {
	private readonly logger = createRawTelemetryLogger("RawCommitReporter")

	constructor(private readonly client: CostrictRawStoreClient) {}

	public async reportCommit(repo: Repository, commit: Commit, provider: ClineProvider): Promise<void> {
		try {
			if (process.env.DISABLE_USER_INDICATOR === "1") {
				throw new Error("Telemetry is disabled")
			}
			const [telemetryProperties, remoteConfigs, commitDiff] = await Promise.all([
				provider.getTelemetryProperties(),
				repo.getConfigs(),
				this.getCommitDiff(repo, commit.hash),
			])

			const authUser = CostrictAuthService.getInstance()?.getUserInfo()
			const repoUrl = telemetryProperties.repositoryUrl ?? this.getRemoteUrl(remoteConfigs)
			const branch = repo.state.HEAD?.name ?? telemetryProperties.defaultBranch

			const payload: RawStoreCommitPayload = {
				commit_id: commit.hash,
				commit_time: (commit.commitDate ?? commit.authorDate)?.toISOString(),
				repo_addr: repoUrl,
				repo_branch: branch,
				git_user_name: commit.authorName ?? (await this.getConfigValue(repo, "user.name")),
				git_user_email: commit.authorEmail ?? (await this.getConfigValue(repo, "user.email")),
				user_id: authUser?.id,
				user_name: authUser?.name,
				client_id: getClientId(),
				work_path: provider.cwd.toPosix(),
				comment: truncateCommitComment(commit.message),
				...(commitDiff.text ? { diff: commitDiff.text, diff_lines: commitDiff.lines } : {}),
			}

			await this.client.reportCommit(payload)
			this.logger.info(
				`commit reported hash=${commit.hash} branch=${branch ?? "unknown"} repo=${repoUrl ?? "unknown"} diffLines=${commitDiff.lines ?? 0}`,
			)
		} catch (error) {
			console.error("[RawCommitReporter] Failed to report commit:", error)
		}
	}

	private async getCommitDiff(repo: Repository, commitHash: string): Promise<{ text?: string; lines?: number }> {
		try {
			const parent = `${commitHash}^`
			const changes = await repo.diffBetween(parent, commitHash)
			if (!changes.length) {
				return {}
			}

			const diffEntries = await Promise.all(
				changes.map(async (change) => {
					const relativePath = repo.rootUri
						? change.uri.fsPath.replace(`${repo.rootUri.fsPath}/`, "")
						: change.uri.fsPath
					const diffText = await repo.diffBetween(parent, commitHash, relativePath).catch(() => "")
					return {
						label: relativePath,
						before: this.extractBeforeText(diffText),
						after: this.extractAfterText(diffText),
						patch: diffText,
					}
				}),
			)

			const payload = buildRawDiffPayload(
				diffEntries.map((entry) => ({
					label: entry.label,
					before: entry.before,
					after: entry.after,
				})),
				MAX_COMMIT_DIFF_LENGTH,
			)

			if (!payload.text) {
				return {}
			}

			return {
				text: payload.text,
				lines: diffEntries.reduce((sum, entry) => sum + countPatchDiffLines(entry.patch), 0),
			}
		} catch {
			return {}
		}
	}

	private extractBeforeText(diffText: string): string {
		const lines: string[] = []
		for (const line of diffText.split("\n")) {
			if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
				continue
			}
			if (line.startsWith("+")) {
				continue
			}
			lines.push(line.startsWith("-") || line.startsWith(" ") ? line.slice(1) : line)
		}
		return `${lines.join("\n")}\n`
	}

	private extractAfterText(diffText: string): string {
		const lines: string[] = []
		for (const line of diffText.split("\n")) {
			if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
				continue
			}
			if (line.startsWith("-")) {
				continue
			}
			lines.push(line.startsWith("+") || line.startsWith(" ") ? line.slice(1) : line)
		}
		return `${lines.join("\n")}\n`
	}

	private async getConfigValue(repo: Repository, key: string): Promise<string | undefined> {
		try {
			const value = await repo.getConfig(key)
			return value || undefined
		} catch {
			return undefined
		}
	}

	private getRemoteUrl(configs: { key: string; value: string }[]): string | undefined {
		const remoteUrl = configs.find(
			(config) => config.key.startsWith("remote.") && config.key.endsWith(".url"),
		)?.value
		if (!remoteUrl) {
			return undefined
		}
		return convertGitUrlToHttps(sanitizeGitUrl(remoteUrl))
	}
}

function truncateCommitComment(comment: string | undefined): string | undefined {
	if (!comment) {
		return undefined
	}
	return comment.length > MAX_COMMIT_COMMENT_LENGTH ? comment.slice(0, MAX_COMMIT_COMMENT_LENGTH) : comment
}
