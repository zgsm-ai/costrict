/**
 * Sequential Thinking Tool
 * 结构化思考工具，支持分步骤思考、修订和分支
 */

import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"

import { BaseTool, ToolCallbacks } from "./BaseTool"

/**
 * 思考步骤数据结构
 */
interface ThoughtData {
	thought: string
	thoughtNumber: number
	totalThoughts: number
	nextThoughtNeeded: boolean
	isRevision?: boolean
	revisesThought?: number
	branchFromThought?: number
	branchId?: string
	needsMoreThoughts?: boolean
}

/**
 * 思考会话状态，存储在 Task 对象中
 */
interface ThinkingSession {
	thoughtHistory: ThoughtData[]
	branches: Map<string, ThoughtData[]>
}

/**
 * Sequential Thinking Tool 参数
 */
interface SequentialThinkingParams {
	thought: string
	nextThoughtNeeded: boolean
	thoughtNumber: number
	totalThoughts: number
	isRevision?: boolean
	revisesThought?: number
	branchFromThought?: number
	branchId?: string
	needsMoreThoughts?: boolean
}

/**
 * 获取或创建会话的思考状态
 */
function getOrCreateSession(task: Task): ThinkingSession {
	if (!task.sequentialThinkingSession) {
		task.sequentialThinkingSession = {
			thoughtHistory: [],
			branches: new Map<string, ThoughtData[]>(),
		}
	}
	return task.sequentialThinkingSession
}

/**
 * 格式化思考步骤
 */
function formatThought(thoughtData: ThoughtData): string {
	let prefix = ""
	let context = ""

	if (thoughtData.isRevision && thoughtData.branchFromThought) {
		prefix = "🔄 Revision"
		context = ` (revising thought ${thoughtData.revisesThought}) (from thought ${thoughtData.branchFromThought}, ID: ${thoughtData.branchId})`
	} else if (thoughtData.isRevision) {
		prefix = "🔄 Revision"
		context = ` (revising thought ${thoughtData.revisesThought})`
	} else if (thoughtData.branchFromThought) {
		prefix = "🌿 Branch"
		context = ` (from thought ${thoughtData.branchFromThought}, ID: ${thoughtData.branchId})`
	} else {
		prefix = "💭 Thought"
		context = ""
	}

	const header = `${prefix} ${thoughtData.thoughtNumber}/${thoughtData.totalThoughts}${context}`

	return `${header}\n\n${thoughtData.thought}`
}

/**
 * 格式化思考历史
 */
function formatHistory(history: ThoughtData[]): string {
	if (history.length === 0) {
		return "No thoughts recorded yet."
	}

	const lines: string[] = ["## Thinking History\n"]

	for (const thought of history) {
		lines.push(formatThought(thought))
		lines.push("") // 空行分隔
	}

	return lines.join("\n")
}

/**
 * 验证参数
 */
function validateParams(params: SequentialThinkingParams, history: ThoughtData[]): string | null {
	const { thoughtNumber, totalThoughts, isRevision, revisesThought, branchFromThought, branchId } = params

	// 验证思考编号
	if (thoughtNumber < 1) {
		return "thoughtNumber must be at least 1"
	}

	if (totalThoughts < thoughtNumber) {
		return "totalThoughts must be >= thoughtNumber"
	}

	// 验证修订
	if (isRevision) {
		if (!revisesThought) {
			return "revisesThought is required when isRevision is true"
		}
		if (revisesThought < 1 || revisesThought > history.length) {
			return `revisesThought must be between 1 and ${history.length}`
		}
	}

	// 验证分支
	// if (branchFromThought) {
	// 	if (!branchId) {
	// 		return "branchId is required when branchFromThought is specified"
	// 	}
	// 	if (branchFromThought < 1 || branchFromThought > history.length) {
	// 		return `branchFromThought must be between 1 and ${history.length}`
	// 	}
	// }

	return null
}

/**
 * 扩展 Task 类型以支持 Sequential Thinking 状态
 */
declare module "../task/Task" {
	interface Task {
		sequentialThinkingSession?: ThinkingSession
	}
}

export class SequentialThinkingTool extends BaseTool<"sequential_thinking"> {
	readonly name = "sequential_thinking" as const

	async execute(params: SequentialThinkingParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks

		try {
			// 获取或创建会话状态
			const session = getOrCreateSession(task)

			// 验证参数
			const validationError = validateParams(params, session.thoughtHistory)
			if (validationError) {
				task.consecutiveMistakeCount++
				task.recordToolError("sequential_thinking")
				task.didToolFailInCurrentTurn = true
				await task.say("error", validationError)
				pushToolResult(`Error: ${validationError}`)
				return
			}

			// 验证必要参数
			if (!params.thought) {
				task.consecutiveMistakeCount++
				task.recordToolError("sequential_thinking")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("sequential_thinking", "thought"))
				return
			}

			// 创建思考数据
			const thoughtData: ThoughtData = {
				thought: params.thought,
				thoughtNumber: params.thoughtNumber,
				totalThoughts: params.totalThoughts,
				nextThoughtNeeded: params.nextThoughtNeeded,
				isRevision: params.isRevision,
				revisesThought: params.revisesThought,
				branchFromThought: params.branchFromThought,
				branchId: params.branchId,
				needsMoreThoughts: params.needsMoreThoughts,
			}

			// 处理分支
			if (params.branchFromThought && params.branchId) {
				if (!session.branches.has(params.branchId)) {
					// 创建新分支：复制到分支点的历史
					const branchHistory = session.thoughtHistory.slice(0, params.branchFromThought)
					session.branches.set(params.branchId, branchHistory)
				}
				// 添加到分支历史
				session.branches.get(params.branchId)!.push(thoughtData)
			} else {
				// 添加到主历史
				session.thoughtHistory.push(thoughtData)
			}

			// 格式化输出
			const formattedThought = formatThought(thoughtData)
			const status = params.nextThoughtNeeded ? "继续思考..." : "思考完成"

			task.consecutiveMistakeCount = 0

			// 显示到 UI
			await task.say("text", formattedThought)

			// 输出到 AI (tool result)
			pushToolResult(`${formattedThought}\n\n---\n状态: ${status}`)

			// 重置部分状态
			this.resetPartialState()
		} catch (error) {
			await handleError("sequential thinking", error as Error)
			this.resetPartialState()
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"sequential_thinking">): Promise<void> {
		const nativeThought = block.nativeArgs?.thought
		const thought: string | undefined = nativeThought ?? block.params.thought
		const thoughtNumberStr = block.nativeArgs?.thoughtNumber?.toString() ?? block.params.thoughtNumber
		const totalThoughtsStr = block.nativeArgs?.totalThoughts?.toString() ?? block.params.totalThoughts

		const thoughtNumber = thoughtNumberStr !== undefined ? parseInt(thoughtNumberStr) : undefined
		const totalThoughts = totalThoughtsStr !== undefined ? parseInt(totalThoughtsStr) : undefined

		if (thought && thoughtNumber !== undefined && totalThoughts !== undefined) {
			// During partial streaming, show a preview of the thought
			const preview = `💭 Thought ${thoughtNumber}/${totalThoughts}\n\n${thought}`
			await task.say("text", preview).catch(() => {})
		}
	}
}

export const sequentialThinkingTool = new SequentialThinkingTool()
