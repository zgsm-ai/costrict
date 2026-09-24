import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { durableScopeId } from "../scope-store"

let home: string
const storeOf = (initial?: string) => {
	const data = new Map<string, string>()
	if (initial) data.set("costrict.stability.scopeId", initial)
	return { get: (k: string) => data.get(k), set: (k: string, v: string) => data.set(k, v), data }
}

beforeEach(async () => {
	home = await fs.mkdtemp(path.join(os.tmpdir(), "scope-store-"))
})

afterEach(async () => {
	await fs.rm(home, { recursive: true, force: true })
	vi.restoreAllMocks()
})

const file = () => path.join(home, "scope-id")

describe("durable scope-id store", () => {
	it("creates the scope atomically and reads the same value afterwards", async () => {
		const store = storeOf()
		const first = await durableScopeId(home, store)
		expect(first).toMatch(/^sc-[0-9a-f]{12}$/)
		const stat = await fs.stat(file())
		expect(stat.mode & 0o777).toBe(0o600)
		const second = await durableScopeId(home, store)
		expect(second).toBe(first)
		// Mirror to the secondary backup.
		expect(store.data.get("costrict.stability.scopeId")).toBe(first)
		// No temp leftovers.
		expect((await fs.readdir(home)).filter((e) => e.includes(".tmp"))).toEqual([])
	})

	it("migrates a valid globalState seed so existing installations keep their file", async () => {
		const store = storeOf("sc-b2a586cbec72")
		const scope = await durableScopeId(home, store)
		expect(scope).toBe("sc-b2a586cbec72")
		expect(await fs.readFile(file(), "utf8")).toBe(scope)
	})

	it("ignores an invalid globalState seed", async () => {
		const store = storeOf("not-a-scope")
		const scope = await durableScopeId(home, store)
		expect(scope).toMatch(/^sc-[0-9a-f]{12}$/)
	})

	it("repairs a legacy `scope-` file: old value fails validation, fresh sc- id replaces it", async () => {
		// 2026-09-24 prefix alignment: installations from before the protocol
		// filename alignment carry `scope-<12hex>` in the file AND in the
		// globalState backup. Both fail the new pattern, so a fresh sc- id is
		// generated, the file is repaired and the backup re-mirrored — the
		// next outbox file simply starts under the canonical name.
		await fs.writeFile(file(), "scope-b2a586cbec72", "utf8")
		const store = storeOf("scope-b2a586cbec72")
		const logs: string[] = []
		const scope = await durableScopeId(home, store, (m) => logs.push(m))
		expect(scope).toMatch(/^sc-[0-9a-f]{12}$/)
		expect(scope).not.toBe("scope-b2a586cbec72")
		expect(logs.length).toBe(1)
		expect(logs[0]).toContain("unreadable")
		expect(await fs.readFile(file(), "utf8")).toBe(scope)
		expect(store.data.get("costrict.stability.scopeId")).toBe(scope)
	})

	it("falls back to the globalState seed when the file is corrupt, then repairs it", async () => {
		const store = storeOf("sc-aaaaaaaaaaaa")
		await fs.writeFile(file(), "garbage", "utf8")
		const logs: string[] = []
		const scope = await durableScopeId(home, store, (m) => logs.push(m))
		expect(scope).toBe("sc-aaaaaaaaaaaa") // seed preserved — no silent fork
		expect(logs.length).toBe(1)
		expect(logs[0]).toContain("unreadable")
		expect(await fs.readFile(file(), "utf8")).toBe(scope) // repaired
	})

	it("rejects a symlink scope file loudly and falls back to the seed", async () => {
		const store = storeOf("sc-bbbbbbbbbbbb")
		const target = path.join(home, "evil")
		await fs.writeFile(target, "sc-cccccccccccc", "utf8")
		await fs.symlink(target, file())
		const scope = await durableScopeId(home, store)
		expect(scope).toBe("sc-bbbbbbbbbbbb")
	})

	it("keeps one scope across sequential service instances (file continuity)", async () => {
		const store = storeOf()
		const first = await durableScopeId(home, store)
		const second = await durableScopeId(home, store)
		expect(second).toBe(first)
	})
})
