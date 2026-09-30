/**
 * Dual clock (design §3): wall = UTC ms for timestamps/expiry judgment,
 * mono for durations/deadlines. Never subtract monotonic clocks across
 * machines; never use wall for durations.
 */
export interface Clock {
	wall(): number
	mono(): number
}

export const systemClock = (): Clock => ({
	wall: () => Date.now(),
	mono: () => performance.now(),
})

/** Fixed clock for tests. */
export const fixedClock = (atWall: number, atMono = 0): Clock & { tick: (dw: number, dm?: number) => void } => {
	let wall = atWall
	let mono = atMono
	return {
		wall: () => wall,
		mono: () => mono,
		tick: (dw: number, dm = dw) => {
			wall += dw
			mono += dm
		},
	}
}
