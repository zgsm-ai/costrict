import * as vscode from "vscode"
import { inspect } from "util"

/**
 * 日志级别（数值越小表示优先级越低）
 */
export enum LogLevel {
	Debug = 0,
	Info = 1,
	Warn = 2,
	Error = 3,
	Off = 4,
}

export interface LoggerOptions {
	/** 最小输出级别（默认 Debug）*/
	level?: LogLevel
	/** 是否启用日志（默认 true）*/
	enabled?: boolean
	/** 自定义时间戳函数（默认 ISO8601 字符串）*/
	timeFn?: () => string
	/** 若外部已创建 OutputChannel，可注入复用 */
	channel?: vscode.OutputChannel
}

/**
 * 可注入 / 可替换的日志接口，方便单测 mock
 */
export interface ILogger {
	debug(message: unknown, ...args: unknown[]): void
	info(message: unknown, ...args: unknown[]): void
	warn(message: unknown, ...args: unknown[]): void
	error(message: unknown, ...args: unknown[]): void
	dispose(): void
}

/**
 * 全局缓存，确保同名 Logger 复用同一个实例，防止多次创建导致状态分裂。
 */
const loggerRegistry = new Map<string, ChannelLogger>()

/**
 * 工厂函数：获取（或创建）VS Code Logger 实例。
 * 同名 logger 总是返回同一实例。
 */
export function createLogger(name: string, options: LoggerOptions = {}): ILogger {
	const cached = loggerRegistry.get(name)
	if (cached) return cached

	const logger = new ChannelLogger(name, options)
	loggerRegistry.set(name, logger)
	return logger
}

/**
 * 统一销毁所有注册的 logger 实例
 * 通常在扩展 deactivate 时调用
 */
export function deactivate(): void {
	for (const logger of loggerRegistry.values()) {
		logger.dispose()
	}
	loggerRegistry.clear()
}

/* ----------------------- VS Code 实现 ----------------------- */

class ChannelLogger implements ILogger {
	private static readonly MAX_BUFFER_SIZE = 1000
	private readonly channel: vscode.OutputChannel
	private readonly buffer: string[] = []
	private flushHandle: NodeJS.Immediate | null = null
	private readonly level: LogLevel
	private readonly enabled: boolean
	private readonly timeFn: () => string

	constructor(
		private readonly name: string,
		opts: LoggerOptions,
	) {
		// 复用外部注入的 OutputChannel；若未提供则自行创建
		this.channel = opts.channel ?? vscode.window.createOutputChannel(name)
		this.level = opts.level ?? LogLevel.Debug
		this.enabled = opts.enabled ?? true
		this.timeFn = opts.timeFn ?? (() => new Date().toLocaleString())
	}

	// ---------- ILogger 实现 ----------

	debug(msg: unknown, ...args: unknown[]): void {
		this.log(LogLevel.Debug, "DEBUG", msg, ...args)
	}
	info(msg: unknown, ...args: unknown[]): void {
		this.log(LogLevel.Info, "INFO", msg, ...args)
	}
	warn(msg: unknown, ...args: unknown[]): void {
		this.log(LogLevel.Warn, "WARN", msg, ...args)
	}
	error(msg: unknown, ...args: unknown[]): void {
		this.log(LogLevel.Error, "ERROR", msg, ...args)
	}

	dispose(): void {
		this.flush() // 确保剩余日志写完
		this.channel.dispose()
		if (this.flushHandle) {
			clearImmediate(this.flushHandle)
		}

		// 从缓存移除，防止内存泄漏
		loggerRegistry.delete(this.name)
	}

	// ---------- 内部辅助 ----------

	private log(level: LogLevel, tag: string, msg: unknown, ...args: unknown[]): void {
		if (!this.enabled || level < this.level) return

		// 缓冲区大小检查
		if (this.buffer.length >= ChannelLogger.MAX_BUFFER_SIZE) {
			this.flush() // 强制刷新
		}

		const line = `${this.timeFn()} [${tag}] ` + [msg, ...args].map(this.safeToString).join(" ")

		this.buffer.push(line)
		this.scheduleFlush()
	}

	/**
	 * 使用 setImmediate 在事件循环空闲时批量 flush，减少 UI 开销
	 */
	private scheduleFlush(): void {
		if (this.flushHandle) return
		this.flushHandle = setImmediate(() => {
			this.flush()
			this.flushHandle = null
		})
	}

	private flush(): void {
		if (this.buffer.length === 0) return
		for (const line of this.buffer) {
			this.channel.appendLine(line)
		}
		this.buffer.length = 0
	}

	private safeToString(value: unknown): string {
		if (typeof value === "string") return value
		try {
			// 使用 util.inspect 提供更友好的对象展示
			return inspect(value, {
				colors: false,
				depth: 3,
				maxArrayLength: 10,
				maxStringLength: 200,
				breakLength: Infinity,
				compact: true,
			})
		} catch (_) {
			return String(value)
		}
	}
}
