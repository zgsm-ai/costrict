import { costrictDefaultModelId } from "@roo-code/types"

/**
 * Decide whether a stale costrict model selection must be corrected after the model
 * list was refreshed, and if so, which model id to switch to.
 *
 * Rule (see docs/adr/0001-model-selection-correction.md):
 * - Skip when the old list is empty — we don't yet know the legitimate server set.
 * - Only correct a "server model": one that WAS in the old list. This protects a
 *   user-typed "custom model" whose id is intentionally absent from the server list.
 * - Only correct when that server model has disappeared from the new list.
 * - Fall back to "Auto" (costrictDefaultModelId) when present in the new list,
 *   otherwise the first model in the new list (guarantees an in-list, valid selection).
 *
 * @returns the model id to switch to, or null when no correction should happen.
 */
export function getCorrectedCostrictModelId(
	oldModelIds: string[],
	newModelIds: string[],
	selectedModelId: string | undefined,
): string | null {
	if (!selectedModelId) {
		return null
	}
	if (oldModelIds.length === 0) {
		return null
	}
	if (!oldModelIds.includes(selectedModelId)) {
		return null
	}
	if (newModelIds.includes(selectedModelId)) {
		return null
	}
	if (newModelIds.length === 0) {
		return null
	}
	return newModelIds.includes(costrictDefaultModelId) ? costrictDefaultModelId : newModelIds[0]
}
