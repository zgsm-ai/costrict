import * as vscode from "vscode"

export enum InstallType {
	First = "first",
	Upgrade = "upgrade",
	Reinstall = "reinstall",
	Unchanged = "unchanged",
}

const LAST_VERSION_KEY = "lastVersion"
const INSTALLED_AT_KEY = "installedAt"

export class PluginLifecycleManager {
	constructor(private context: vscode.ExtensionContext) {}

	get currentVersion(): string | undefined {
		return this.context.extension?.packageJSON.version
	}

	get lastVersion(): string | undefined {
		return this.context.globalState.get<string>(LAST_VERSION_KEY)
	}

	get lastInitializedAt(): number | undefined {
		return this.context.globalState.get<number>(INSTALLED_AT_KEY)
	}

	get extensionInstallTimestamp(): number | undefined {
		const extensionPath = this.context.extensionPath
		if (extensionPath) {
			try {
				const stat = require("fs").statSync(extensionPath)
				return stat.ctimeMs
			} catch (err) {
				console.error("Failed to get plugin installation time:", err)
			}
		}
		return undefined
	}

	async resetState(): Promise<void> {
		for (const key of this.context.globalState.keys()) {
			await this.context.globalState.update(key, undefined)
		}
	}

	/** Determines plugin installation type based on version number and installation time */
	async getInstallType(): Promise<InstallType> {
		const lastVersion = this.lastVersion
		const currentVersion = this.currentVersion
		const storedAt = this.lastInitializedAt
		const installedFromFS = this.extensionInstallTimestamp

		// If no version history exists, it's a first install
		if (!lastVersion) {
			await this.context.globalState.update(INSTALLED_AT_KEY, Date.now())
			await this.context.globalState.update(LAST_VERSION_KEY, currentVersion)
			return InstallType.First
		}

		// Version changed, it's an upgrade
		if (lastVersion !== currentVersion) {
			await this.context.globalState.update(LAST_VERSION_KEY, currentVersion)
			// Also update installation time during upgrade to ensure it's current
			if (installedFromFS !== undefined) {
				await this.context.globalState.update(INSTALLED_AT_KEY, installedFromFS)
			} else {
				await this.context.globalState.update(INSTALLED_AT_KEY, Date.now())
			}
			return InstallType.Upgrade
		}

		// If installation time is more than 1 second newer than recorded time, it's a reinstall
		if (installedFromFS !== undefined && (storedAt === undefined || installedFromFS > storedAt + 1000)) {
			await this.context.globalState.update(INSTALLED_AT_KEY, installedFromFS)
			await this.context.globalState.update(LAST_VERSION_KEY, currentVersion)
			return InstallType.Reinstall
		}

		// Otherwise no change detected
		return InstallType.Unchanged
	}
}
