import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

interface FileStats {
	size: number
	created: Date
	modified: Date
	permissions: string
}

export class FileProcessor {
	private basePath: string

	constructor(basePath: string) {
		this.basePath = basePath
	}

	async getFileStats(filename: string): Promise<FileStats> {
		const command = `stat -f "%z %SB %Sm %Lp" "${filename}"`
		const { stdout } = await execAsync(command, { cwd: this.basePath })

		const [size, created, modified, permissions] = stdout.trim().split(" ")

		return {
			size: parseInt(size, 10),
			created: new Date(created),
			modified: new Date(modified),
			permissions,
		}
	}

	async validateFile(filename: string): Promise<boolean> {
		try {
			await this.getFileStats(filename)
			return true
		} catch {
			return false
		}
	}
}
