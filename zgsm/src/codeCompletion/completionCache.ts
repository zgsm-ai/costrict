/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import { getRandomId } from "../common/util"
import { CompletionPoint, calcKey } from "./completionPoint"

/**
 * Completion point cache
 */
export class CompletionCache {
	private static points = [] as CompletionPoint[] // Completion point list
	private static keys = new Map<string, CompletionPoint>() // Lookup by key
	private static ids = new Map<string, CompletionPoint>() // Lookup by ID
	private static latest: CompletionPoint | undefined = undefined // The latest completion point
	private static latestId = 0 // Incremental ID number
	/**
	 * The next completion request ID
	 */
	private static nextId() {
		return `${this.latestId++}-${getRandomId(16)}`
	}
	/**
	 * Look up the completion point by position
	 */
	static lookup(fpath: string, line: number, column: number): CompletionPoint | undefined {
		const key = calcKey(fpath, line, column)
		return this.keys.get(key)
	}
	/**
	 * Cache the completion point
	 */
	static cache(cp: CompletionPoint): CompletionPoint {
		const copy = new CompletionPoint(
			this.nextId(),
			cp.doc,
			cp.pos,
			cp.getPrompt(),
			cp.triggerMode,
			cp.createTime,
			cp.getAcception(),
		)
		copy.parentId = cp.parentId
		this.points.push(copy)
		this.ids.set(copy.id, copy)
		this.keys.set(copy.getKey(), copy)
		this.latest = copy
		return copy
	}
	/**
	 * Get the latest completion point
	 */
	static getLatest(): CompletionPoint | undefined {
		return this.latest
	}
	/**
	 * Get all completion points
	 */
	static all(): CompletionPoint[] {
		return this.points
	}
	/**
	 * Clear cnt completion points starting from 0, and do not clear the last one
	 */
	static erase(cnt: number) {
		if (cnt >= this.points.length) {
			throw new RangeError("The last completion point cannot be deleted")
		}
		for (let n = 0; n < cnt; n++) {
			const cp = this.points[n]
			this.keys.delete(cp.getKey())
			this.ids.delete(cp.id)
		}
		this.points = this.points.slice(cnt)
	}
}
