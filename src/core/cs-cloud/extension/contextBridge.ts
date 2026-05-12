import * as vscode from "vscode"
import type { AssistantUIContextMessage, SendContextResult } from "./types"

interface CloudProvider {
	postContextMessage(message: AssistantUIContextMessage): Thenable<boolean> | undefined
}

let activeProvider: CloudProvider | undefined
let cloudUiGeneration = 0
let cloudUiReady = false
let isCloudUnavailable = false
const pendingQueue: AssistantUIContextMessage[] = []

/**
 * 由 AssistantUISidebarProvider 在 resolveWebviewView() 中调用，
 * 通知 bridge 当前活跃 provider。
 * provider 变更时自动重置 ready 状态和递增 generation。
 * 不清空 pendingQueue — 新消息可能已在 focus 等待期间入队；
 * onCloudUiReady 的 generation 校验足以过滤旧 webview 的 late ready。
 * @returns 当前 generation，调用方需传入 onCloudUiReady。
 */
export function setActiveCloudProvider(provider: CloudProvider | undefined): number {
	if (activeProvider !== provider) {
		cloudUiReady = false
		isCloudUnavailable = false
		cloudUiGeneration++
	}
	activeProvider = provider
	if (!provider) {
		cloudUiReady = false
		isCloudUnavailable = true
		pendingQueue.length = 0
	}
	return cloudUiGeneration
}

/**
 * Cloud UI 加载完成后调用（iframe 模式由 wrapper 转发 ASSISTANT_UI_READY，
 * static 模式由 Cloud UI hook 直接通知）。
 * @param generation 必须传入 setActiveCloudProvider 返回的 generation，用于校验是否匹配。
 */
export function onCloudUiReady(generation: number) {
	if (generation !== cloudUiGeneration) {
		// 旧 webview 的 late ready，忽略
		return
	}
	isCloudUnavailable = false
	cloudUiReady = true
	const toFlush = pendingQueue.splice(0)
	for (const msg of toFlush) {
		doSendContextMessage(msg)
	}
}

/**
 * Cloud UI 不可用时调用（disabled / error 状态），
 * 设置 unavailable 标记让后续 sendContextToCloud 直接返回 "unavailable"，
 * 避免消息永远堆积在 queue 中。
 */
export function setCloudUnavailable(reason: string) {
	console.warn(`[contextBridge] Cloud UI unavailable: ${reason}. Dropping ${pendingQueue.length} queued messages.`)
	isCloudUnavailable = true
	cloudUiReady = false
	pendingQueue.length = 0
}

/**
 * 发送 context 到 Cloud UI。
 * - "sent": 已立即发出
 * - "queued": Cloud UI 未 ready，已入队等待（ready 后自动 flush）
 * - "unavailable": 无活跃 provider 或 Cloud UI 已标记不可用，消息丢弃
 */
export function sendContextToCloud(message: AssistantUIContextMessage): SendContextResult {
	if (isCloudUnavailable || !activeProvider) {
		console.warn("[contextBridge] Cloud provider unavailable or not active, dropping context message")
		return "unavailable"
	}
	if (!cloudUiReady) {
		pendingQueue.push(message)
		return "queued"
	}
	doSendContextMessage(message)
	return "sent"
}

function doSendContextMessage(message: AssistantUIContextMessage) {
	const result = activeProvider!.postContextMessage(message)
	if (result) {
		result.then(
			(delivered) => {
				if (!delivered) {
					console.warn("[contextBridge] postMessage returned false, webview may not be ready")
				}
			},
			(err) => {
				console.error("[contextBridge] postMessage failed:", err)
			},
		)
	}
}

/**
 * 先聚焦 Cloud sidebar，再发送 context。
 * 应作为 Cloud 模式下 add-to-context 命令的统一入口。
 * 使用轮询等待 activeProvider 注册（首次聚焦 Cloud sidebar 时可能需要异步启动）。
 * 超时后不 queue——返回 "unavailable" 由调用方决定是否重试。
 */
export async function sendContextToCloudWithFocus(message: AssistantUIContextMessage): Promise<SendContextResult> {
	await vscode.commands.executeCommand("costrict.AssistantUISidebarProvider.focus")
	// 轮询等待 activeProvider 注册，超时 2s
	const deadline = Date.now() + 2000
	while (!activeProvider && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
	if (isCloudUnavailable || !activeProvider) {
		console.warn("[contextBridge] Cloud provider unavailable after focus, dropping message")
		return "unavailable"
	}
	return sendContextToCloud(message)
}
