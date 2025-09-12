import * as fs from "fs/promises"
import { PathLike } from "fs"

// Make a path take a unix-like form.  Useful for making path comparisons.
export function toPosix(filePath: PathLike | fs.FileHandle) {
	return filePath.toString().toPosix()
}

// 修复版本的toPosix函数，避免调用不存在的toPosix方法
export function toPosixFixed(filePath: PathLike | fs.FileHandle): string {
	return filePath.toString().replace(/\\/g, "/")
}
