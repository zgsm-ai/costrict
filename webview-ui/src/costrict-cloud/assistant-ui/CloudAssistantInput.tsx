type CloudAssistantInputProps = {
	value: string
	onValueChange: (value: string) => void
	onSend: () => void
	disabled?: boolean
	isStreaming?: boolean
	placeholder?: string
}

/**
 * Phase 1 占位组件：
 * 当前仅保留最小输入协议定义，真正的输入区接入放在 Phase 3。
 */
export function CloudAssistantInput(_props: CloudAssistantInputProps) {
	return null
}

export default CloudAssistantInput
