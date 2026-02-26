import { useEffect, useState } from "react"

export type RandomLoadingMessageLanguage = "en" | "zh-CN"

export const EDITING_PHRASES: Record<RandomLoadingMessageLanguage, string[]> = {
	en: [
		"🎨 Painting the code...",
		"✏️ Scribbling some magic...",
		"🔧 Tightening the bolts...",
		"🛠️ Hamming the code together...",
		"💻 Speaking computer...",
		"🔀 Rearranging the building blocks...",
		"📝 Drafting the masterpiece...",
		"🧩 Piecing it together...",
		"🔨 Forging the solution...",
		"🏗️ Constructing the architecture...",
		"🔧 Turning the gears...",
		"🎯 Hitting the target...",
		"✨ Sprinkling some stardust...",
		"🌟 Illuminating the code...",
		"🧪 Experimenting with the formula...",
		"📐 Measuring twice, cutting once...",
		"🪚 Sanding the rough edges...",
		"🔍 Finding the perfect spot...",
		"⚙️ Aligning the mechanisms...",
		"💫 Adding the finishing touches...",
		"🔧 Wrenching out the bugs...",
		"🧵 Stitching the pieces together...",
		"🎭 Rearranging the stage...",
		"🚀 Propelling the code forward...",
		"🔨 Smashing obstacles...",
		"🧱 Building the foundation...",
		"🎨 Brushing up the details...",
		"🔌 Connecting the dots...",
		"⚡ Energizing the logic...",
		"🧹 Cleaning up the mess...",
	],
	"zh-CN": [
		"💻 编写代码中...",
		"📝 修改文件中...",
		"🔧 调整配置中...",
		"🛠️ 优化代码中...",
		"📊 分析结构中...",
		"🔀 重构模块中...",
		"📋 更新内容中...",
		"🧩 集成功能中...",
		"🔨 实现方案中...",
		"🏗️ 构建架构中...",
		"⚙️ 配置系统中...",
		"🎯 定位问题中...",
		"✨ 优化性能中...",
		"🌟 完善功能中...",
		"🧪 验证逻辑中...",
		"📐 规范代码中...",
		"🪚 精简逻辑中...",
		"🔍 检查代码中...",
		"⚙️ 调整参数中...",
		"💫 改进细节中...",
		"🔧 修复问题中...",
		"🧵 整合流程中...",
		"📦 优化资源中...",
		"🚀 应用更新中...",
		"🔨 处理任务中...",
		"🧱 搭建基础中...",
		"📐 调整格式中...",
		"🔌 对接接口中...",
		"⚡ 提升效率中...",
		"🧹 整理代码中...",
	],
}

export const WITTY_LOADING_PHRASES: Record<RandomLoadingMessageLanguage, string[]> = {
	en: [
		"🎯 whack-a-mole...",
		"🎨 Painting the serifs back on...",
		"📐 Reticulating splines...",
		"🐹 Warming up the AI hamsters...",
		"🐚 Asking the magic conch shell...",
		"✨ Polishing the algorithms...",
		"⏸️ Don't rush perfection (or my code)...",
		"⚛️ Counting electrons...",
		"🎭 Shuffling punchlines...",
		"🧠 Untangling neural nets...",
		"🐛 Just a sec, I'm debugging reality...",
		"💎 Compiling brilliance...",
		"⏳ Loading wait.exe...",
		"☕️ Converting coffee into code...",
		"🔍 Looking for a misplaced semicolon...",
		"⚙️ Greasin' the cogs of the machine...",
		"🚗 Calibrating the flux capacitor...",
		"🌌 Engaging the improbability drive...",
		"⚔️ Channeling the Force...",
		"😌 Don't panic...",
		"💨 Blowing on the cartridge...",
		"🧚 Summoning code fairies...",
		"🐛 Wrestling with bugs...",
		"🌰 Feeding the hamsters...",
		"📥 Downloading common sense...",
		"🎱 Shaking the magic 8-ball...",
		"⚡️ Charging the laser...",
		"🌀 Opening neural pathways...",
		"🙏 Summoning the code gods...",
		"🔎 Searching for lost semicolons...",
		"🎸 Tuning the algorithms...",
		"🧮 Crunching the numbers...",
		"🧬 Splicing some DNA...",
		"🌊 Riding the syntax wave...",
		"🎩 Pulling rabbits out of the code...",
		"🧩 Solving the puzzle...",
		"🔮 Consulting the crystal ball...",
		"🎲 Rolling the digital dice...",
		"🎪 Setting up the circus...",
		"🪐 Exploring the code universe...",
		"🔥 Igniting the spark of creativity...",
		"🎨 Mixing the perfect code colors...",
	],
	"zh-CN": [
		"🎯 精准定位中...",
		"📐 规范处理中...",
		"⚙️ 系统运算中...",
		"🔍 深度分析中...",
		"✨ 优化算法中...",
		"⏳ 请稍候，处理中...",
		"⚛️ 计算资源中...",
		"🧠 智能分析中...",
		"🐛 检测问题中...",
		"💎 精炼代码中...",
		"⏳ 加载组件中...",
		"☕️ 编译程序中...",
		"🔍 检索数据中...",
		"⚙️ 调整参数中...",
		"🔧 校准系统中...",
		"📊 加载模块中...",
		"🔄 同步数据中...",
		"😌 请耐心等待...",
		"💻 执行任务中...",
		"🧪 测试逻辑中...",
		"🐛 排查异常中...",
		"📦 打包资源中...",
		"📥 获取信息中...",
		"🔐 验证流程中...",
		"⚡️ 加速处理中...",
		"🌀 初始化中...",
		"🔎 扫描代码中...",
		"🎵 协调模块中...",
		"🧮 运算数据中...",
		"🔬 分析结构中...",
		"📈 评估方案中...",
		"🧩 整合逻辑中...",
		"📋 审查代码中...",
		"🎲 模拟场景中...",
		"🔧 配置环境中...",
		"🪐 探索方案中...",
		"🔥 执行流程中...",
		"📊 评估质量中...",
	],
}

export const RandomLoadingMessage = ({
	language,
	interval = 5000,
	type = "general",
	staticDisplay = false,
}: {
	language?: RandomLoadingMessageLanguage
	interval?: number
	staticDisplay?: boolean | string
	type?: "general" | "editing"
}) => {
	const phrases = type === "editing" ? EDITING_PHRASES : WITTY_LOADING_PHRASES
	const messages = phrases[language || "en"] ?? phrases["en"]
	const [text, setText] = useState(messages[Math.floor(Math.random() * messages.length)])

	useEffect(() => {
		if (staticDisplay) return
		const timerId = setInterval(() => {
			setText(messages[Math.floor(Math.random() * messages.length)])
		}, interval)
		return () => {
			clearInterval(timerId)
		}
	}, [interval, messages, staticDisplay])

	return typeof staticDisplay === "string" ? staticDisplay : text
}
