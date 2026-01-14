import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import BattleModeConfigPanel from "../BattleModeConfigPanel"

// Mock react-i18next
vi.mock("react-i18next", () => ({
	useTranslation: () => {
		const translations: Record<string, string> = {
			"battleMode.title": "战斗模式配置",
			"battleMode.description": "战斗模式提供智能错误恢复机制",
			"battleMode.config.enabled": "启用战斗模式",
			"battleMode.config.enabled.description": "当遇到连续错误时自动启用错误恢复机制",
			"battleMode.config.errorThreshold": "错误触发阈值",
			"battleMode.config.errorThreshold.description": "连续错误次数达到此值时触发恢复机制",
			"battleMode.config.errorThreshold.label": "错误触发阈值",
			"battleMode.config.errorThresholdDescription": "连续错误次数达到此值时触发恢复机制",
			"battleMode.config.contextThreshold": "上下文清理阈值",
			"battleMode.config.contextThreshold.description": "错误次数达到此值时清理对话上下文",
			"battleMode.config.contextThreshold.label": "上下文清理阈值",
			"battleMode.config.contextThresholdDescription": "错误次数达到此值时清理对话上下文",
			"battleMode.config.modelThreshold": "模型切换阈值",
			"battleMode.config.modelThreshold.description": "错误次数达到此值时切换到备用模型",
			"battleMode.config.modelThreshold.label": "模型切换阈值",
			"battleMode.config.modelThresholdDescription": "错误次数达到此值时切换到备用模型",
			"battleMode.config.backupModel": "备用模型",
			"battleMode.config.backupModel.label": "备用模型",
			"battleMode.config.backupModel.placeholder": "选择备用模型",
			"battleMode.config.save": "保存配置",
			"battleMode.config.cancel": "取消",
			"battleMode.config.resetCounters": "重置计数器",
			"common.none": "无",
		}
		return {
			t: (key: string) => translations[key] || key,
			i18n: {
				language: "zh-CN",
				changeLanguage: vi.fn(),
			},
		}
	},
}))

describe("BattleModeConfigPanel", () => {
	const mockOnSave = vi.fn()
	const mockOnResetCounters = vi.fn()
	const defaultConfig = {
		enabled: true,
		errorThreshold: 3,
		contextThreshold: 5,
		modelThreshold: 7,
		backupModel: "gpt-4o-mini",
	}
	const availableModels = ["gpt-4o-mini", "gpt-4o", "claude-3-haiku"]

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("正确渲染配置面板", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		expect(screen.getByText("战斗模式配置")).toBeInTheDocument()
		expect(screen.getByText((content) => content.includes("启用战斗模式"))).toBeInTheDocument()
		expect(screen.getByText((content) => content.includes("错误触发阈值"))).toBeInTheDocument()
		expect(screen.getByText((content) => content.includes("上下文清理阈值"))).toBeInTheDocument()
		expect(screen.getByText((content) => content.includes("模型切换阈值"))).toBeInTheDocument()
		expect(screen.getByText((content) => content.includes("备用模型"))).toBeInTheDocument()
	})

	it("正确显示初始值", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const errorThresholdInput = screen.getByDisplayValue("3")
		expect(errorThresholdInput).toBeInTheDocument()

		const contextThresholdInput = screen.getByDisplayValue("5")
		expect(contextThresholdInput).toBeInTheDocument()

		const modelThresholdInput = screen.getByDisplayValue("7")
		expect(modelThresholdInput).toBeInTheDocument()
	})

	it("可以切换启用状态", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		// 查找 toggle button，通过 className 来识别
		const toggleButtons = screen.getAllByRole("button")
		const toggleButton = toggleButtons.find((btn) => btn.className && btn.className.includes("rounded-full"))
		expect(toggleButton).toBeInTheDocument()
		fireEvent.click(toggleButton!)
	})

	it("可以更新错误阈值", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const errorThresholdInput = screen.getByDisplayValue("3")
		fireEvent.change(errorThresholdInput, { target: { value: "5" } })
		expect(errorThresholdInput).toHaveValue(5)
	})

	it("可以更新上下文阈值", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const contextThresholdInput = screen.getByDisplayValue("5")
		fireEvent.change(contextThresholdInput, { target: { value: "8" } })
		expect(contextThresholdInput).toHaveValue(8)
	})

	it("可以更新模型阈值", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const modelThresholdInput = screen.getByDisplayValue("7")
		fireEvent.change(modelThresholdInput, { target: { value: "10" } })
		expect(modelThresholdInput).toHaveValue(10)
	})

	it("可以选择备用模型", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const select = screen.getByRole("combobox")
		expect(select).toBeInTheDocument()
	})

	it("点击保存按钮时调用onSave回调", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const errorThresholdInput = screen.getByDisplayValue("3")
		fireEvent.change(errorThresholdInput, { target: { value: "5" } })

		const saveButton = screen.getByText("保存配置")
		fireEvent.click(saveButton)

		expect(mockOnSave).toHaveBeenCalledWith(
			expect.objectContaining({
				errorThreshold: 5,
			}),
		)
	})

	it("点击重置计数器按钮时调用onResetCounters回调", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const resetButton = screen.getByText("重置计数器")
		fireEvent.click(resetButton)

		expect(mockOnResetCounters).toHaveBeenCalledTimes(1)
	})

	it("当没有更改时保存按钮禁用", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const saveButton = screen.getByText("保存配置")
		expect(saveButton).toBeDisabled()
	})

	it("点击取消按钮时恢复原始配置", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const errorThresholdInput = screen.getByDisplayValue("3")
		fireEvent.change(errorThresholdInput, { target: { value: "10" } })

		const cancelButton = screen.getByText("取消")
		fireEvent.click(cancelButton)

		expect(errorThresholdInput).toHaveValue(3)
	})

	it("正确显示重置按钮", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		expect(screen.getByText("重置计数器")).toBeInTheDocument()
	})

	it("正确应用自定义类名", () => {
		const { container } = render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
					className="custom-class"
				/>
			</TooltipProvider>,
		)

		const panel = container.firstChild as HTMLElement
		expect(panel.className).toContain("custom-class")
	})

	it("处理无备用模型的情况", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={{ ...defaultConfig, backupModel: undefined }}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const select = screen.getByRole("combobox")
		expect(select).toBeInTheDocument()
	})

	it("处理禁用的配置", () => {
		render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={{ ...defaultConfig, enabled: false }}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		// 查找 toggle button，通过 className 来识别
		const toggleButtons = screen.getAllByRole("button")
		const toggleButton = toggleButtons.find((btn) => btn.className && btn.className.includes("rounded-full"))
		expect(toggleButton!.className.includes("bg-text-secondary/30")).toBe(true)
	})

	it("包含所有必要的图标", () => {
		const { container } = render(
			<TooltipProvider>
				<BattleModeConfigPanel
					config={defaultConfig}
					availableModels={availableModels}
					onSave={mockOnSave}
					onResetCounters={mockOnResetCounters}
				/>
			</TooltipProvider>,
		)

		const svgs = container.querySelectorAll("svg")
		expect(svgs.length).toBeGreaterThan(0)
	})
})
