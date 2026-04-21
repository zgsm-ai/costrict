import { CloudAssistantThread } from "./assistant-ui/CloudAssistantThread"
import type { CostrictCloudMessageItem } from "./messageAdapter"

type CostrictCloudMessageListProps = {
	messages: CostrictCloudMessageItem[]
}

/**
 * 当前 Cloud 消息列表已退化为一个轻量入口壳层：
 * - 统一通过 assistant-ui 适配层进行消息分发
 * - 旧的内联渲染实现已迁移到 `assistant-ui/renderers/`
 * - 后续若切换到 assistant-ui primitives/runtime，可继续保持该入口不变
 */
export function CostrictCloudMessageList({ messages }: CostrictCloudMessageListProps) {
	return (
		<CloudAssistantThread
			messages={messages}
			emptyState={
				<div className="rounded-2xl border border-dashed border-vscode-panel-border p-4 text-sm text-vscode-descriptionForeground">
					暂无消息，请先读取 messages 或发送 prompt。
				</div>
			}
		/>
	)
}
