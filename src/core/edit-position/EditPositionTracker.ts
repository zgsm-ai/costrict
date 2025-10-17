export interface EditPosition {
	filePath: string
	startLine: number
	endLine: number
	startColumn?: number // Optional: starting column position
	endColumn?: number // Optional: ending column position
	editType: "modify" | "insert" | "replace" | "create"
}

export class EditPositionTracker {
	private positions: Map<string, EditPosition[]> = new Map()

	/**
	 * Track edit position
	 * @param filePath File path
	 * @param position Edit position information
	 */
	trackPosition(filePath: string, position: EditPosition): void {
		if (!this.positions.has(filePath)) {
			this.positions.set(filePath, [])
		}
		this.positions.get(filePath)!.push(position)
	}

	/**
	 * Get primary edit position (first edit position)
	 * @param filePath File path
	 * @returns Primary edit position, returns null if none exists
	 */
	getPrimaryPosition(filePath: string): EditPosition | null {
		const positions = this.positions.get(filePath)
		if (!positions || positions.length === 0) {
			return null
		}
		// Return the first edit position
		return positions[0]
	}

	/**
	 * Clear edit position information for specified file
	 * @param filePath File path
	 */
	clearPositions(filePath: string): void {
		this.positions.delete(filePath)
	}

	/**
	 * Clear all edit position information
	 */
	clearAllPositions(): void {
		this.positions.clear()
	}
}
