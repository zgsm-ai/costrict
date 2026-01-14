import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import BattleModeStatus from "../BattleModeStatus"

// Mock react-i18next
vi.mock("react-i18next", () => ({
	useTranslation: () => {
		const translations: Record<string, string> = {
			"battleMode.status.active": "已激活",
			"battleMode.status.paused": "已暂停",
			"battleMode.status.inactive": "未激活",
			"battleMode.errors.count": "错误计数",
			"battleMode.errors.recovery": "恢复操作",
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

describe("BattleModeStatus", () => {
	it("正确渲染活跃状态", () => {
		render(
			<TooltipProvider>
				<BattleModeStatus isActive={true} isPaused={false} errorCount={2} recoveryActions={1} />
			</TooltipProvider>,
		)

		// 检查状态标签
		expect(screen.getByText("已激活")).toBeInTheDocument()

		// 检查错误计数标签（使用模糊匹配，因为文本被分成多个元素）
		expect(screen.getByText((content) => content.includes("错误计数"))).toBeInTheDocument()

		// 检查错误计数值
		const errorCountElements = screen.getAllByText("2")
		expect(errorCountElements.length).toBeGreaterThan(0)
		// 找到错误计数值（排除恢复操作数）
		const errorCountValue = errorCountElements.find((el) => el.className.includes("text-red-400"))
		expect(errorCountValue).toBeInTheDocument()

		// 检查恢复操作标签
		expect(screen.getByText((content) => content.includes("恢复操作"))).toBeInTheDocument()
		// 检查恢复操作数
		const recoveryElements = screen.getAllByText("1")
		expect(recoveryElements.length).toBeGreaterThan(0)
	})

	it("正确渲染暂停状态", () => {
		render(
			<TooltipProvider>
				<BattleModeStatus isActive={true} isPaused={true} errorCount={3} recoveryActions={2} />
			</TooltipProvider>,
		)

		expect(screen.getByText("已暂停")).toBeInTheDocument()
		const countElements = screen.getAllByText("3")
		expect(countElements.length).toBeGreaterThan(0)
	})

	it("正确渲染非活跃状态", () => {
		render(
			<TooltipProvider>
				<BattleModeStatus isActive={false} isPaused={false} errorCount={0} recoveryActions={0} />
			</TooltipProvider>,
		)

		expect(screen.getByText("未激活")).toBeInTheDocument()
		const countElements = screen.getAllByText("0")
		expect(countElements.length).toBeGreaterThan(0)
	})

	it("当错误计数为0时使用正确的颜色", () => {
		render(
			<TooltipProvider>
				<BattleModeStatus isActive={true} isPaused={false} errorCount={0} recoveryActions={0} />
			</TooltipProvider>,
		)

		// 检查所有"0"元素，确认没有红色样式
		const errorCountElements = screen.queryAllByText("0")
		const redErrorElement = errorCountElements.find((el) => el.className && el.className.includes("text-red-400"))
		expect(redErrorElement).toBeUndefined()
	})

	it("正确应用自定义类名", () => {
		const { container } = render(
			<TooltipProvider>
				<BattleModeStatus
					isActive={true}
					isPaused={false}
					errorCount={1}
					recoveryActions={1}
					className="custom-class"
				/>
			</TooltipProvider>,
		)

		const statusContainer = container.firstChild as HTMLElement
		expect(statusContainer.className).toContain("custom-class")
	})

	it("正确渲染高错误计数", () => {
		render(
			<TooltipProvider>
				<BattleModeStatus isActive={true} isPaused={false} errorCount={10} recoveryActions={5} />
			</TooltipProvider>,
		)

		const count10Elements = screen.queryAllByText("10")
		expect(count10Elements.length).toBeGreaterThan(0)

		const count5Elements = screen.queryAllByText("5")
		expect(count5Elements.length).toBeGreaterThan(0)
	})

	it("正确渲染零错误计数和恢复操作", () => {
		render(
			<TooltipProvider>
				<BattleModeStatus isActive={false} isPaused={false} errorCount={0} recoveryActions={0} />
			</TooltipProvider>,
		)

		const countElements = screen.queryAllByText("0")
		// 应该有多个 0（错误计数和恢复操作数）
		expect(countElements.length).toBeGreaterThanOrEqual(2)
	})

	it("包含所有必要的图标", () => {
		const { container } = render(
			<TooltipProvider>
				<BattleModeStatus isActive={true} isPaused={false} errorCount={1} recoveryActions={1} />
			</TooltipProvider>,
		)

		// 检查SVG图标是否存在
		const svgs = container.querySelectorAll("svg")
		expect(svgs.length).toBeGreaterThan(0)
	})
})
