/**
 * Wrappers for task.ask() and task.say() that log errors instead of silently swallowing them.
 * This ensures IPC communication failures are visible for debugging while maintaining
 * the fire-and-forget behavior (errors don't propagate to the caller).
 */

export async function safeAsk(task: any, ...args: any[]): Promise<void> {
	try {
		await task.ask(...args)
	} catch (error) {
		console.error(`[TaskCommunication] task.ask(${args[0]}) failed:`, error)
	}
}

export async function safeSay(task: any, ...args: any[]): Promise<void> {
	try {
		await task.say(...args)
	} catch (error) {
		console.error(`[TaskCommunication] task.say(${args[0]}) failed:`, error)
	}
}
