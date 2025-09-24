/**
 * CospecMetadataManager 测试文件
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'

// Mock all dependencies to prevent actual file operations
vi.mock('proper-lockfile', () => ({
	lock: vi.fn().mockResolvedValue(() => Promise.resolve()),
	unlock: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('stream-json/Disassembler', () => ({
	default: {
		disassembler: vi.fn().mockReturnValue({
			pipe: vi.fn().mockReturnThis(),
			on: vi.fn().mockReturnThis(),
			write: vi.fn(),
			end: vi.fn()
		})
	}
}))

vi.mock('stream-json/Stringer', () => ({
	default: {
		stringer: vi.fn().mockReturnValue({
			pipe: vi.fn().mockReturnThis(),
			on: vi.fn().mockReturnThis(),
			write: vi.fn(),
			end: vi.fn()
		})
	}
}))

// Mock fs sync operations
vi.mock('fs', () => ({
	createWriteStream: vi.fn().mockReturnValue({
		write: vi.fn(),
		end: vi.fn(),
		on: vi.fn().mockReturnThis()
	})
}))

// Mock fs/promises
vi.mock('fs/promises')

// Mock safeWriteJson completely to avoid any file operations
const mockSafeWriteJson = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../utils/safeWriteJson', () => ({
	safeWriteJson: mockSafeWriteJson
}))

// Now import after mocking
import { CospecMetadataManager, CospecMetadata } from '../CospecMetadataManager'

describe('CospecMetadataManager', () => {
	const mockDirectoryPath = '/mock/cospec/directory'
	const mockFilePath = '/mock/cospec/directory/requirements.md'
	const mockMetadata: CospecMetadata = {
		design: {
			lastTaskId: 'test-task-123',
			lastCheckpointId: 'checkpoint-abc'
		},
		requirements: {
			lastTaskId: 'test-task-456',
			lastCheckpointId: 'checkpoint-def'
		},
		tasks: {
			lastTaskId: 'test-task-789',
			lastCheckpointId: 'checkpoint-ghi'
		}
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('readMetadata', () => {
		it('应该成功读取元数据文件', async () => {
			const mockContent = JSON.stringify(mockMetadata)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			const result = await CospecMetadataManager.readMetadata(mockDirectoryPath)

			expect(result).toEqual(mockMetadata)
			expect(fs.readFile).toHaveBeenCalledWith(
				path.join(mockDirectoryPath, '.cometa.json'),
				'utf8'
			)
		})
	})

	describe('isCospecFile', () => {
		it('应该正确识别 .cospec 文件', () => {
			const testCases = [
				{ path: '/project/.cospec/requirements.md', expected: true },
				{ path: '/project/.cospec/subdir/design.md', expected: true },
				{ path: 'C:\\project\\.cospec\\tasks.md', expected: true },
				{ path: '/project/src/main.ts', expected: false },
				{ path: '/project/docs/readme.md', expected: false }
			]

			testCases.forEach(({ path, expected }) => {
				expect(CospecMetadataManager.isCospecFile(path)).toBe(expected)
			})
		})
	})

	describe('getRelativeCospecPath', () => {
		it('应该正确获取相对路径', () => {
			const testCases = [
				{ 
					path: '/project/.cospec/requirements.md', 
					expected: 'requirements.md' 
				},
				{ 
					path: '/project/.cospec/subdir/design.md', 
					expected: path.join('subdir', 'design.md')
				},
				{ 
					path: '/project/src/main.ts', 
					expected: null 
				}
			]

			testCases.forEach(({ path, expected }) => {
				expect(CospecMetadataManager.getRelativeCospecPath(path)).toBe(expected)
			})
		})
	})

	describe('metadataExists', () => {
		it('元数据文件存在时应该返回 true', async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined)

			const result = await CospecMetadataManager.metadataExists(mockDirectoryPath)

			expect(result).toBe(true)
			expect(fs.access).toHaveBeenCalledWith(
				path.join(mockDirectoryPath, '.cometa.json')
			)
		})

		it('元数据文件不存在时应该返回 false', async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error('File not found'))

			const result = await CospecMetadataManager.metadataExists(mockDirectoryPath)

			expect(result).toBe(false)
		})
	})

	describe('getMetadataOrDefault', () => {
		it('元数据存在时应该返回元数据', async () => {
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMetadata))

			const result = await CospecMetadataManager.getMetadataOrDefault(mockDirectoryPath)

			expect(result).toEqual(mockMetadata)
		})

		it('元数据不存在时应该返回默认值', async () => {
			const error = new Error('File not found')
			;(error as any).code = 'ENOENT'
			vi.mocked(fs.readFile).mockRejectedValue(error)

			const result = await CospecMetadataManager.getMetadataOrDefault(mockDirectoryPath)

			expect(result).toEqual({
				design: { lastTaskId: '', lastCheckpointId: '' },
				requirements: { lastTaskId: '', lastCheckpointId: '' },
				tasks: { lastTaskId: '', lastCheckpointId: '' }
			})
		})
	})
})