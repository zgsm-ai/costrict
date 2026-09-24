/**
 * In-process log mirror (port of the JetBrains DiagnosticBridge, JS
 * adaptation). Business log calls at WARN/ERROR are mirrored — never blocked —
 * into the diagnostics pipeline: a bounded queue (256 pending, overflow drops
 * silently and lets the rate limiter account for repetition), an async
 * setImmediate drain so the logging call site never pays the filter cost, and
 * a reentrancy guard that drops anything logged from inside the drain itself
 * (the collector's own output can never feed back). Install is stack-based;
 * uninstall is idempotent and drains.
 */
import type { DiagnosticInput } from "./diagnostics"

const MAX_PENDING = 256

type Sink = (input: DiagnosticInput) => void

export class DiagnosticBridge {
	private readonly queue: DiagnosticInput[] = []
	private readonly stack: Sink[] = []
	private scheduled = false
	private draining = false
	dropped = 0

	/** True when a log call originates inside the drain (the collector itself). */
	get reentrant(): boolean {
		return this.draining
	}

	install(sink: Sink): void {
		this.stack.push(sink)
	}

	uninstall(): void {
		this.stack.pop()
	}

	get active(): boolean {
		return this.stack.length > 0
	}

	/** Mirror one log record; never blocks, never throws. */
	offer(input: DiagnosticInput): void {
		if (this.stack.length === 0 || this.draining) return // collector output never feeds back
		if (this.queue.length >= MAX_PENDING) {
			this.dropped++
			return
		}
		this.queue.push(input)
		this.schedule()
	}

	/** Flush pending records through the current sink (bounded, async). */
	private schedule(): void {
		if (this.scheduled) return
		this.scheduled = true
		setImmediate(() => {
			this.scheduled = false
			this.drain()
		})
	}

	private drain(): void {
		if (this.stack.length === 0) {
			this.queue.length = 0
			return
		}
		this.draining = true
		try {
			while (this.queue.length > 0) {
				const input = this.queue.shift()
				if (input === undefined) break
				try {
					for (const sink of this.stack) sink(input)
				} catch {
					// a sink failure must never propagate to the log call site
				}
			}
		} finally {
			this.draining = false
		}
	}
}
