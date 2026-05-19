declare module "which" {
	export interface WhichOptions {
		all?: false
		nothrow?: boolean
		path?: string
		pathExt?: string
		delimiter?: string
	}

	export interface WhichAllOptions extends Omit<WhichOptions, "all"> {
		all: true
	}

	interface Which {
		(cmd: string, options: WhichAllOptions): Promise<string[]>
		(cmd: string, options: WhichOptions & { nothrow: true }): Promise<string | null>
		(cmd: string, options?: WhichOptions): Promise<string>
		sync(cmd: string, options: WhichAllOptions): string[]
		sync(cmd: string, options: WhichOptions & { nothrow: true }): string | null
		sync(cmd: string, options?: WhichOptions): string
	}

	const which: Which
	export default which
}
