declare module "adm-zip" {
	export default class AdmZip {
		constructor(filePath?: string)
		addFile(entryName: string, content: Buffer, comment?: string, attr?: number): void
		addLocalFile(localPath: string, zipPath?: string): void
		addLocalFolder(localPath: string, zipPath?: string): void
		getEntries(): Array<{
			entryName: string
		}>
		extractAllTo(targetPath: string, overwrite?: boolean): void
		writeZip(targetFileName?: string, callback?: (error: Error | null) => void): void
	}
}
