import { describe, test, expect, beforeEach, vi } from "vitest"
import { AutoCleanupService } from "../autoCleanup"
import type { AutoCleanupSettings, CleanupStrategy, HistoryItem } from "@roo-code/types"

describe("AutoCleanupService", () => {
	let globalStoragePath: string
	let autoCleanup: AutoCleanupService

	beforeEach(() => {
		globalStoragePath = "/tmp/test-cleanup"
		autoCleanup = new AutoCleanupService(globalStoragePath)
	})

	describe("formatBytes", () => {
		test("应该正确格式化字节", () => {
			expect(AutoCleanupService.formatBytes(0)).toBe("0 B")
			expect(AutoCleanupService.formatBytes(1024)).toBe("1 KB")
			expect(AutoCleanupService.formatBytes(1048576)).toBe("1 MB")
			expect(AutoCleanupService.formatBytes(1073741824)).toBe("1 GB")
		})

		test("应该正确格式化非整数字节", () => {
			expect(AutoCleanupService.formatBytes(1536)).toBe("1.5 KB")
			expect(AutoCleanupService.formatBytes(1572864)).toBe("1.5 MB")
		})
	})

	describe("performCleanup", () => {
		test("禁用时不应该执行清理", async () => {
			const settings: AutoCleanupSettings = {
				enabled: false,
				strategy: "based_on_time" as CleanupStrategy,
				retentionDays: 7,
				maxHistoryCount: 50,
				excludeActive: true,
				cleanupOnStartup: true,
			}

			const taskHistory: HistoryItem[] = [
				{
					id: "task1",
					number: 1,
					task: "Test task 1",
					ts: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10天前
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
					size: 1000000,
					status: "completed",
				},
			]

			const result = await autoCleanup.performCleanup(taskHistory, settings)

			expect(result.tasksRemoved).toBe(0)
			expect(result.spaceFreed).toBe(0)
		})

		test("基于时间清理应该删除旧任务", async () => {
			const settings: AutoCleanupSettings = {
				enabled: true,
				strategy: "based_on_time" as CleanupStrategy,
				retentionDays: 7,
			}

			const now = Date.now()
			const taskHistory: HistoryItem[] = [
				{
					id: "task1",
					number: 1,
					task: "Old task",
					ts: now - 10 * 24 * 60 * 60 * 1000, // 10天前
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
					size: 1000000,
					status: "completed",
				},
				{
					id: "task2",
					number: 2,
					task: "Recent task",
					ts: now - 3 * 24 * 60 * 60 * 1000, // 3天前
					tokensIn: 150,
					tokensOut: 300,
					totalCost: 0.02,
					size: 2000000,
					status: "completed",
				},
			]

			const result = await autoCleanup.performCleanup(taskHistory, settings)

			expect(result.tasksRemoved).toBe(1)
			expect(result.spaceFreed).toBe(1000000)
			expect(result.removedTaskIds).toContain("task1")
			expect(result.removedTaskIds).not.toContain("task2")
		})

		test("基于时间清理应该保护当前活跃任务", async () => {
			const settings: AutoCleanupSettings = {
				enabled: true,
				strategy: "based_on_time" as CleanupStrategy,
				retentionDays: 7,
				excludeActive: true,
			}

			const now = Date.now()
			const taskHistory: HistoryItem[] = [
				{
					id: "active-task",
					number: 1,
					task: "Active task",
					ts: now - 10 * 24 * 60 * 60 * 1000, // 10天前
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
					size: 1000000,
					status: "delegated",
				},
				{
					id: "old-task",
					number: 2,
					task: "Old task",
					ts: now - 10 * 24 * 60 * 60 * 1000, // 10天前
					tokensIn: 150,
					tokensOut: 300,
					totalCost: 0.02,
					size: 2000000,
					status: "completed",
				},
			]

			const result = await autoCleanup.performCleanup(taskHistory, settings, "active-task")

			expect(result.tasksRemoved).toBe(1)
			expect(result.removedTaskIds).not.toContain("active-task")
			expect(result.removedTaskIds).toContain("old-task")
		})

		test("基于数量清理应该保留指定数量的最新任务", async () => {
			const settings: AutoCleanupSettings = {
				enabled: true,
				strategy: "based_on_count" as CleanupStrategy,
				maxHistoryCount: 2,
			}

			const now = Date.now()
			const taskHistory: HistoryItem[] = [
				{
					id: "task1",
					number: 1,
					task: "Oldest task",
					ts: now - 10 * 24 * 60 * 60 * 1000,
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
					size: 1000000,
					status: "completed",
				},
				{
					id: "task2",
					number: 2,
					task: "Middle task",
					ts: now - 5 * 24 * 60 * 60 * 1000,
					tokensIn: 150,
					tokensOut: 300,
					totalCost: 0.02,
					size: 2000000,
					status: "completed",
				},
				{
					id: "task3",
					number: 3,
					task: "Newest task",
					ts: now - 1 * 24 * 60 * 60 * 1000,
					tokensIn: 200,
					tokensOut: 400,
					totalCost: 0.03,
					size: 3000000,
					status: "completed",
				},
			]

			const result = await autoCleanup.performCleanup(taskHistory, settings)

			expect(result.tasksRemoved).toBe(1)
			expect(result.removedTaskIds).toContain("task1")
			expect(result.removedTaskIds).not.toContain("task2")
			expect(result.removedTaskIds).not.toContain("task3")
		})

		test("基于数量清理应该保护当前活跃任务", async () => {
			const settings: AutoCleanupSettings = {
				enabled: true,
				strategy: "based_on_count" as CleanupStrategy,
				maxHistoryCount: 2,
				excludeActive: true,
			}

			const now = Date.now()
			const taskHistory: HistoryItem[] = [
				{
					id: "active-task",
					number: 1,
					task: "Active task",
					ts: now - 10 * 24 * 60 * 60 * 1000,
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
					size: 1000000,
					status: "delegated",
				},
				{
					id: "task1",
					number: 2,
					task: "Task 1",
					ts: now - 5 * 24 * 60 * 60 * 1000,
					tokensIn: 150,
					tokensOut: 300,
					totalCost: 0.02,
					size: 2000000,
					status: "completed",
				},
				{
					id: "task2",
					number: 3,
					task: "Task 2",
					ts: now - 3 * 24 * 60 * 60 * 1000,
					tokensIn: 200,
					tokensOut: 400,
					totalCost: 0.03,
					size: 3000000,
					status: "completed",
				},
				{
					id: "task3",
					number: 4,
					task: "Task 3",
					ts: now - 1 * 24 * 60 * 60 * 1000,
					tokensIn: 250,
					tokensOut: 500,
					totalCost: 0.04,
					size: 4000000,
					status: "completed",
				},
			]

			const result = await autoCleanup.performCleanup(taskHistory, settings, "active-task")

			// maxHistoryCount=2，保留活跃任务 + 最新的1个其他任务 = 总共2个任务
			// 删除 task1 和 task2，保留 active-task 和 task3
			expect(result.tasksRemoved).toBe(2)
			expect(result.removedTaskIds).not.toContain("active-task")
			expect(result.removedTaskIds).not.toContain("task3")
			expect(result.removedTaskIds).toContain("task1")
			expect(result.removedTaskIds).toContain("task2")
		})
	})
})
