import SetiFileIcon from "../common/SetiFileIcon"
import { vscode } from "@/utils/vscode"

interface FileStatusItemProps {
	path: string
	status: string
	oldPath?: string
}

/**
 * Component to display a single file with its Git status
 */
const FileStatusItem = ({ path, status, oldPath }: FileStatusItemProps) => {
	// Determine status color based on Git status
	const getStatusColor = (status: string): string => {
		const normalizedStatus = status.trim()

		// Added files (green)
		if (normalizedStatus === "A" || normalizedStatus.includes("A")) {
			return "text-green-500"
		}

		// Modified files (yellow/orange)
		if (normalizedStatus === "M" || normalizedStatus.includes("M")) {
			return "text-yellow-500"
		}

		// Deleted files (red)
		if (normalizedStatus === "D" || normalizedStatus.includes("D")) {
			return "text-red-500"
		}

		// Renamed files (blue)
		if (normalizedStatus === "R" || normalizedStatus.includes("R")) {
			return "text-blue-500"
		}

		// Untracked files (gray) - normalized to U from ??
		if (normalizedStatus === "U" || normalizedStatus === "??" || normalizedStatus.includes("?")) {
			return "text-gray-400"
		}

		// Default color
		return "text-vscode-foreground"
	}

	const handleClick = () => {
		vscode.postMessage({
			type: "showFileDiff",
			values: {
				filePath: path,
				oldFilePath: oldPath,
				// Keep original porcelain XY status (e.g. " M", "AM") for backend logic.
				status,
			},
		})
	}

	return (
		<div
			className="flex items-center justify-between px-3 py-1.5 hover:bg-vscode-list-hoverBackground text-[13px] cursor-pointer"
			onClick={handleClick}>
			<div className="flex items-center gap-2 flex-1 min-w-0">
				<SetiFileIcon fileName={path} />
				<span className="truncate text-vscode-foreground">{path}</span>
			</div>
			<span className={`ml-2 font-mono text-lg font-semibold ${getStatusColor(status)} shrink-0`}>
				{status.trim()}
			</span>
		</div>
	)
}

export default FileStatusItem
