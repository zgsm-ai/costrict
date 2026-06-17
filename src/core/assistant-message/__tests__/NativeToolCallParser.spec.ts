import { NativeToolCallParser } from "../NativeToolCallParser"

describe("NativeToolCallParser", () => {
	beforeEach(() => {
		NativeToolCallParser.clearAllStreamingToolCalls()
		NativeToolCallParser.clearRawChunkState()
	})

	describe("parseToolCall", () => {
		describe("read_file tool", () => {
			it("should parse minimal single-file read_file args", () => {
				const toolCall = {
					id: "toolu_123",
					name: "read_file" as const,
					arguments: JSON.stringify({
						path: "src/core/task/Task.ts",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					expect(result.nativeArgs).toBeDefined()
					const nativeArgs = result.nativeArgs as { path: string }
					expect(nativeArgs.path).toBe("src/core/task/Task.ts")
				}
			})

			it("should parse slice-mode params", () => {
				const toolCall = {
					id: "toolu_123",
					name: "read_file" as const,
					arguments: JSON.stringify({
						path: "src/core/task/Task.ts",
						mode: "slice",
						offset: 10,
						limit: 20,
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						path: string
						mode?: string
						offset?: number
						limit?: number
					}
					expect(nativeArgs.path).toBe("src/core/task/Task.ts")
					expect(nativeArgs.mode).toBe("slice")
					expect(nativeArgs.offset).toBe(10)
					expect(nativeArgs.limit).toBe(20)
				}
			})

			it("should parse indentation-mode params", () => {
				const toolCall = {
					id: "toolu_123",
					name: "read_file" as const,
					arguments: JSON.stringify({
						path: "src/utils.ts",
						mode: "indentation",
						indentation: {
							anchor_line: 123,
							max_levels: 2,
							include_siblings: true,
							include_header: false,
						},
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						path: string
						mode?: string
						indentation?: {
							anchor_line?: number
							max_levels?: number
							include_siblings?: boolean
							include_header?: boolean
						}
					}
					expect(nativeArgs.path).toBe("src/utils.ts")
					expect(nativeArgs.mode).toBe("indentation")
					expect(nativeArgs.indentation?.anchor_line).toBe(123)
					expect(nativeArgs.indentation?.include_siblings).toBe(true)
					expect(nativeArgs.indentation?.include_header).toBe(false)
				}
			})

			// Legacy format backward compatibility tests
			describe("legacy format backward compatibility", () => {
				it("should parse legacy files array format with single file", () => {
					const toolCall = {
						id: "toolu_legacy_1",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [{ path: "src/legacy/file.ts" }],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as { files: Array<{ path: string }>; _legacyFormat: true }
						expect(nativeArgs._legacyFormat).toBe(true)
						expect(nativeArgs.files).toHaveLength(1)
						expect(nativeArgs.files[0].path).toBe("src/legacy/file.ts")
					}
				})

				it("should parse legacy files array format with multiple files", () => {
					const toolCall = {
						id: "toolu_legacy_2",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [{ path: "src/file1.ts" }, { path: "src/file2.ts" }, { path: "src/file3.ts" }],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as { files: Array<{ path: string }>; _legacyFormat: true }
						expect(nativeArgs.files).toHaveLength(3)
						expect(nativeArgs.files[0].path).toBe("src/file1.ts")
						expect(nativeArgs.files[1].path).toBe("src/file2.ts")
						expect(nativeArgs.files[2].path).toBe("src/file3.ts")
					}
				})

				it("should parse legacy line_ranges as tuples", () => {
					const toolCall = {
						id: "toolu_legacy_3",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [
								{
									path: "src/task.ts",
									line_ranges: [
										[1, 50],
										[100, 150],
									],
								},
							],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as {
							files: Array<{ path: string; lineRanges?: Array<{ start: number; end: number }> }>
							_legacyFormat: true
						}
						expect(nativeArgs.files[0].lineRanges).toHaveLength(2)
						expect(nativeArgs.files[0].lineRanges?.[0]).toEqual({ start: 1, end: 50 })
						expect(nativeArgs.files[0].lineRanges?.[1]).toEqual({ start: 100, end: 150 })
					}
				})

				it("should parse legacy line_ranges as objects", () => {
					const toolCall = {
						id: "toolu_legacy_4",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [
								{
									path: "src/task.ts",
									line_ranges: [
										{ start: 10, end: 20 },
										{ start: 30, end: 40 },
									],
								},
							],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as {
							files: Array<{ path: string; lineRanges?: Array<{ start: number; end: number }> }>
						}
						expect(nativeArgs.files[0].lineRanges).toHaveLength(2)
						expect(nativeArgs.files[0].lineRanges?.[0]).toEqual({ start: 10, end: 20 })
						expect(nativeArgs.files[0].lineRanges?.[1]).toEqual({ start: 30, end: 40 })
					}
				})

				it("should parse legacy line_ranges as strings", () => {
					const toolCall = {
						id: "toolu_legacy_5",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: [
								{
									path: "src/task.ts",
									line_ranges: ["1-50", "100-150"],
								},
							],
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as {
							files: Array<{ path: string; lineRanges?: Array<{ start: number; end: number }> }>
						}
						expect(nativeArgs.files[0].lineRanges).toHaveLength(2)
						expect(nativeArgs.files[0].lineRanges?.[0]).toEqual({ start: 1, end: 50 })
						expect(nativeArgs.files[0].lineRanges?.[1]).toEqual({ start: 100, end: 150 })
					}
				})

				it("should parse double-stringified files array (model quirk)", () => {
					// This tests the real-world case where some models double-stringify the files array
					// e.g., { files: "[{\"path\": \"...\"}]" } instead of { files: [{path: "..."}] }
					const toolCall = {
						id: "toolu_double_stringify",
						name: "read_file" as const,
						arguments: JSON.stringify({
							files: JSON.stringify([
								{ path: "src/services/example/service.ts" },
								{ path: "src/services/mcp/McpServerManager.ts" },
							]),
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBe(true)
						const nativeArgs = result.nativeArgs as {
							files: Array<{ path: string }>
							_legacyFormat: true
						}
						expect(nativeArgs._legacyFormat).toBe(true)
						expect(nativeArgs.files).toHaveLength(2)
						expect(nativeArgs.files[0].path).toBe("src/services/example/service.ts")
						expect(nativeArgs.files[1].path).toBe("src/services/mcp/McpServerManager.ts")
					}
				})

				it("should NOT set usedLegacyFormat for new format", () => {
					const toolCall = {
						id: "toolu_new",
						name: "read_file" as const,
						arguments: JSON.stringify({
							path: "src/new/format.ts",
							mode: "slice",
							offset: 1,
							limit: 100,
						}),
					}

					const result = NativeToolCallParser.parseToolCall(toolCall)

					expect(result).not.toBeNull()
					expect(result?.type).toBe("tool_use")
					if (result?.type === "tool_use") {
						expect(result.usedLegacyFormat).toBeUndefined()
					}
				})
			})
		})

		describe("attempt_completion tool", () => {
			it("should parse attempt_completion args", () => {
				const toolCall = {
					id: "toolu_attempt_1",
					name: "attempt_completion" as const,
					arguments: JSON.stringify({
						result: "Task completed successfully",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { result: string }
					expect(nativeArgs.result).toBe("Task completed successfully")
				}
			})
		})

		describe("execute_command tool", () => {
			it("should parse execute_command args with all fields", () => {
				const toolCall = {
					id: "toolu_exec_1",
					name: "execute_command" as const,
					arguments: JSON.stringify({
						command: "ls -la",
						cwd: "/home/project",
						timeout: 30,
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						command: string
						cwd?: string
						timeout?: number | null
					}
					expect(nativeArgs.command).toBe("ls -la")
					expect(nativeArgs.cwd).toBe("/home/project")
					expect(nativeArgs.timeout).toBe(30)
				}
			})

			it("should parse execute_command with minimal args", () => {
				const toolCall = {
					id: "toolu_exec_2",
					name: "execute_command" as const,
					arguments: JSON.stringify({
						command: "npm test",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { command: string }
					expect(nativeArgs.command).toBe("npm test")
				}
			})
		})

		describe("apply_diff tool", () => {
			it("should parse apply_diff args", () => {
				const toolCall = {
					id: "toolu_diff_1",
					name: "apply_diff" as const,
					arguments: JSON.stringify({
						path: "src/index.ts",
						diff: "<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { path: string; diff: string }
					expect(nativeArgs.path).toBe("src/index.ts")
					expect(nativeArgs.diff).toContain("SEARCH")
					expect(nativeArgs.diff).toContain("REPLACE")
				}
			})
		})

		describe("write_to_file tool", () => {
			it("should parse write_to_file args", () => {
				const toolCall = {
					id: "toolu_write_1",
					name: "write_to_file" as const,
					arguments: JSON.stringify({
						path: "src/output.txt",
						content: "Hello, world!",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { path: string; content: string }
					expect(nativeArgs.path).toBe("src/output.txt")
					expect(nativeArgs.content).toBe("Hello, world!")
				}
			})
		})

		describe("ask_followup_question tool", () => {
			it("should parse ask_followup_question args", () => {
				const toolCall = {
					id: "toolu_ask_1",
					name: "ask_followup_question" as const,
					arguments: JSON.stringify({
						question: "Are you sure?",
						follow_up: [{ text: "Yes", mode: "code" }, { text: "No" }],
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						question: string
						follow_up: Array<{ text: string; mode?: string }>
					}
					expect(nativeArgs.question).toBe("Are you sure?")
					expect(nativeArgs.follow_up).toHaveLength(2)
					expect(nativeArgs.follow_up[0].text).toBe("Yes")
					expect(nativeArgs.follow_up[0].mode).toBe("code")
					expect(nativeArgs.follow_up[1].text).toBe("No")
				}
			})
		})

		describe("ask_multiple_choice tool", () => {
			it("should parse ask_multiple_choice args", () => {
				const toolCall = {
					id: "toolu_choice_1",
					name: "ask_multiple_choice" as const,
					arguments: JSON.stringify({
						title: "Choose an option",
						questions: [
							{
								id: "q1",
								prompt: "Pick one",
								options: [
									{ id: "opt1", label: "Option 1" },
									{ id: "opt2", label: "Option 2" },
								],
							},
						],
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						title?: string
						questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }>
					}
					expect(nativeArgs.title).toBe("Choose an option")
					expect(nativeArgs.questions).toHaveLength(1)
					expect(nativeArgs.questions[0].id).toBe("q1")
					expect(nativeArgs.questions[0].options).toHaveLength(2)
				}
			})
		})

		describe("search_files tool", () => {
			it("should parse search_files args", () => {
				const toolCall = {
					id: "toolu_search_1",
					name: "search_files" as const,
					arguments: JSON.stringify({
						path: "src",
						regex: "export function",
						file_pattern: "*.ts",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						path: string
						regex: string
						file_pattern?: string | null
					}
					expect(nativeArgs.path).toBe("src")
					expect(nativeArgs.regex).toBe("export function")
					expect(nativeArgs.file_pattern).toBe("*.ts")
				}
			})
		})

		describe("switch_mode tool", () => {
			it("should parse switch_mode args", () => {
				const toolCall = {
					id: "toolu_mode_1",
					name: "switch_mode" as const,
					arguments: JSON.stringify({
						mode_slug: "code",
						reason: "Need to write code",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { mode_slug: string; reason: string }
					expect(nativeArgs.mode_slug).toBe("code")
					expect(nativeArgs.reason).toBe("Need to write code")
				}
			})
		})

		describe("update_todo_list tool", () => {
			it("should parse update_todo_list args", () => {
				const toolCall = {
					id: "toolu_todo_1",
					name: "update_todo_list" as const,
					arguments: JSON.stringify({
						todos: "- [x] Task 1\n- [ ] Task 2",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { todos: string }
					expect(nativeArgs.todos).toContain("Task 1")
					expect(nativeArgs.todos).toContain("Task 2")
				}
			})
		})

		describe("use_mcp_tool tool", () => {
			it("should parse use_mcp_tool args", () => {
				const toolCall = {
					id: "toolu_mcp_1",
					name: "use_mcp_tool" as const,
					arguments: JSON.stringify({
						server_name: "weather",
						tool_name: "get_forecast",
						arguments: { city: "Tokyo" },
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						server_name: string
						tool_name: string
						arguments?: Record<string, unknown>
					}
					expect(nativeArgs.server_name).toBe("weather")
					expect(nativeArgs.tool_name).toBe("get_forecast")
					expect(nativeArgs.arguments).toEqual({ city: "Tokyo" })
				}
			})

			it("should unwrap double-wrapped use_mcp_tool args (model quirk)", () => {
				// Some models double-wrap the entire payload inside a single stringified `arguments` field
				const toolCall = {
					id: "toolu_mcp_wrapped",
					name: "use_mcp_tool" as const,
					arguments: JSON.stringify({
						arguments: JSON.stringify({
							server_name: "af-deployer",
							tool_name: "sync_file",
							arguments: { file: "test.ts" },
						}),
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						server_name: string
						tool_name: string
						arguments?: Record<string, unknown>
					}
					expect(nativeArgs.server_name).toBe("af-deployer")
					expect(nativeArgs.tool_name).toBe("sync_file")
					expect(nativeArgs.arguments).toEqual({ file: "test.ts" })
				}
			})
		})

		describe("access_mcp_resource tool", () => {
			it("should parse access_mcp_resource args", () => {
				const toolCall = {
					id: "toolu_resource_1",
					name: "access_mcp_resource" as const,
					arguments: JSON.stringify({
						server_name: "filesystem",
						uri: "file:///home/project/readme.md",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { server_name: string; uri: string }
					expect(nativeArgs.server_name).toBe("filesystem")
					expect(nativeArgs.uri).toBe("file:///home/project/readme.md")
				}
			})
		})

		describe("codebase_search tool", () => {
			it("should parse codebase_search args", () => {
				const toolCall = {
					id: "toolu_cbsearch_1",
					name: "codebase_search" as const,
					arguments: JSON.stringify({
						query: "findUser",
						path: "src/services",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { query: string; path?: string }
					expect(nativeArgs.query).toBe("findUser")
					expect(nativeArgs.path).toBe("src/services")
				}
			})
		})

		describe("list_files tool", () => {
			it("should parse list_files args", () => {
				const toolCall = {
					id: "toolu_list_1",
					name: "list_files" as const,
					arguments: JSON.stringify({
						path: "src",
						recursive: true,
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { path: string; recursive?: boolean }
					expect(nativeArgs.path).toBe("src")
					expect(nativeArgs.recursive).toBe(true)
				}
			})
		})

		describe("new_task tool", () => {
			it("should parse new_task args with all fields", () => {
				const toolCall = {
					id: "toolu_newtask_1",
					name: "new_task" as const,
					arguments: JSON.stringify({
						mode: "code",
						message: "Implement feature X",
						todos: "- [ ] Step 1\n- [ ] Step 2",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { mode: string; message: string; todos?: string }
					expect(nativeArgs.mode).toBe("code")
					expect(nativeArgs.message).toBe("Implement feature X")
					expect(nativeArgs.todos).toContain("Step 1")
				}
			})

			it("should use default mode when mode is omitted", () => {
				const toolCall = {
					id: "toolu_newtask_2",
					name: "new_task" as const,
					arguments: JSON.stringify({
						message: "Do something",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { mode: string; message: string }
					expect(nativeArgs.mode).toBeDefined()
					expect(nativeArgs.message).toBe("Do something")
				}
			})
		})

		describe("costrict_checkpoint tool", () => {
			it("should parse costrict_checkpoint args", () => {
				const toolCall = {
					id: "toolu_cp_1",
					name: "costrict_checkpoint" as const,
					arguments: JSON.stringify({
						action: "commit",
						message: "Checkpoint message",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						action: string
						message?: string
					}
					expect(nativeArgs.action).toBe("commit")
					expect(nativeArgs.message).toBe("Checkpoint message")
				}
			})
		})

		describe("edit tool", () => {
			it("should parse edit (search_and_replace) args", () => {
				const toolCall = {
					id: "toolu_edit_1",
					name: "edit" as const,
					arguments: JSON.stringify({
						file_path: "src/index.ts",
						old_string: "foo",
						new_string: "bar",
						replace_all: true,
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as {
						file_path: string
						old_string: string
						new_string: string
						replace_all?: boolean
					}
					expect(nativeArgs.file_path).toBe("src/index.ts")
					expect(nativeArgs.old_string).toBe("foo")
					expect(nativeArgs.new_string).toBe("bar")
					expect(nativeArgs.replace_all).toBe(true)
				}
			})
		})

		describe("invalid tool name", () => {
			it("should return null for unknown tool names", () => {
				const toolCall = {
					id: "toolu_invalid",
					name: "nonexistent_tool" as any,
					arguments: "{}",
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).toBeNull()
			})
		})

		describe("invalid JSON arguments", () => {
			it("should return null for unparseable JSON", () => {
				const toolCall = {
					id: "toolu_badjson",
					name: "read_file" as const,
					arguments: "{invalid json!!!",
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).toBeNull()
			})
		})

		describe("alias resolution", () => {
			it("should resolve write_file alias to write_to_file", () => {
				const toolCall = {
					id: "toolu_alias_1",
					name: "write_file" as any,
					arguments: JSON.stringify({
						path: "file.txt",
						content: "hello",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					expect(result.name).toBe("write_to_file")
					expect(result.originalName).toBe("write_file")
				}
			})

			it("should resolve search alias to search_files", () => {
				const toolCall = {
					id: "toolu_alias_2",
					name: "search" as any,
					arguments: JSON.stringify({
						path: "src",
						regex: "test",
					}),
				}

				const result = NativeToolCallParser.parseToolCall(toolCall)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					expect(result.name).toBe("search_files")
					expect(result.originalName).toBe("search")
				}
			})
		})
	})

	describe("parseDynamicMcpTool", () => {
		it("should parse a standard dynamic MCP tool call", () => {
			const toolCall = {
				id: "mcp_toolu_1",
				name: "mcp--weather--get_forecast",
				arguments: JSON.stringify({ city: "Tokyo", days: 3 }),
			}

			const result = NativeToolCallParser.parseDynamicMcpTool(toolCall)

			expect(result).not.toBeNull()
			expect(result?.type).toBe("mcp_tool_use")
			expect(result?.serverName).toBe("weather")
			expect(result?.toolName).toBe("get_forecast")
			expect(result?.arguments).toEqual({ city: "Tokyo", days: 3 })
			expect(result?.partial).toBe(false)
		})

		it("should parse MCP tool with underscore separators (mcp__server__tool)", () => {
			// Models often convert hyphens to underscores
			const toolCall = {
				id: "mcp_toolu_2",
				name: "mcp__filesystem__read_file",
				arguments: JSON.stringify({ path: "/test.txt" }),
			}

			const result = NativeToolCallParser.parseDynamicMcpTool(toolCall)

			expect(result).not.toBeNull()
			expect(result?.type).toBe("mcp_tool_use")
			expect(result?.serverName).toBe("filesystem")
			expect(result?.toolName).toBe("read_file")
		})

		it("should return null for invalid MCP tool name format", () => {
			const toolCall = {
				id: "mcp_toolu_invalid",
				name: "mcp--onlyserver",
				arguments: "{}",
			}

			const result = NativeToolCallParser.parseDynamicMcpTool(toolCall)

			expect(result).toBeNull()
		})

		it("should return null for non-MCP tool names", () => {
			const toolCall = {
				id: "toolu_normal",
				name: "read_file",
				arguments: "{}",
			}

			const result = NativeToolCallParser.parseDynamicMcpTool(toolCall)

			expect(result).toBeNull()
		})
	})

	describe("processRawChunk", () => {
		it("should produce start/delta/end events across the full lifecycle", () => {
			// Step 1: First chunk with id and name -> start event
			const events1 = NativeToolCallParser.processRawChunk({
				index: 0,
				id: "call_123",
				name: "read_file",
			})

			expect(events1).toHaveLength(1)
			expect(events1[0].type).toBe("tool_call_start")
			if (events1[0].type === "tool_call_start") {
				expect(events1[0].id).toBe("call_123")
				expect(events1[0].name).toBe("read_file")
			}

			// Step 2: Delta chunk with arguments
			const events2 = NativeToolCallParser.processRawChunk({
				index: 0,
				arguments: '{"path": "',
			})

			expect(events2).toHaveLength(1)
			expect(events2[0].type).toBe("tool_call_delta")
			if (events2[0].type === "tool_call_delta") {
				expect(events2[0].delta).toBe('{"path": "')
			}

			// Step 3: Another delta chunk
			const events3 = NativeToolCallParser.processRawChunk({
				index: 0,
				arguments: 'test.ts"}',
			})

			expect(events3).toHaveLength(1)

			// Step 4: Finish reason
			const events4 = NativeToolCallParser.processFinishReason("tool_calls")

			expect(events4).toHaveLength(1)
			expect(events4[0].type).toBe("tool_call_end")
		})

		it("should buffer deltas that arrive before the name", () => {
			// Delta chunk before id/name is set
			const events1 = NativeToolCallParser.processRawChunk({
				index: 0,
				arguments: '{"path": "test.ts"}',
			})

			expect(events1).toHaveLength(0) // No id yet, nothing tracked

			// Now set id and name
			const events2 = NativeToolCallParser.processRawChunk({
				index: 0,
				id: "call_456",
				name: "execute_command",
			})

			// Should have start event
			expect(events2).toHaveLength(1)
			expect(events2[0].type).toBe("tool_call_start")
		})

		it("should clear raw chunk state", () => {
			NativeToolCallParser.processRawChunk({
				index: 0,
				id: "call_789",
				name: "read_file",
			})

			NativeToolCallParser.clearRawChunkState()

			// finish reason should now produce no events since state is cleared
			const events = NativeToolCallParser.processFinishReason("tool_calls")
			expect(events).toHaveLength(0)
		})
	})

	describe("finalizeRawChunks", () => {
		it("should finalize any remaining tracked chunks", () => {
			// Start a tool call without ending it
			NativeToolCallParser.processRawChunk({
				index: 0,
				id: "call_finalize",
				name: "read_file",
			})

			const events = NativeToolCallParser.finalizeRawChunks()

			expect(events).toHaveLength(1)
			expect(events[0].type).toBe("tool_call_end")
		})

		it("should return empty array when no chunks to finalize", () => {
			const events = NativeToolCallParser.finalizeRawChunks()
			expect(events).toHaveLength(0)
		})
	})

	describe("processFinishReason", () => {
		it("should emit end events for finish_reason='tool_calls'", () => {
			NativeToolCallParser.processRawChunk({
				index: 0,
				id: "call_1",
				name: "read_file",
			})
			NativeToolCallParser.processRawChunk({
				index: 1,
				id: "call_2",
				name: "execute_command",
			})

			const events = NativeToolCallParser.processFinishReason("tool_calls")

			expect(events).toHaveLength(2)
			expect(events[0].type).toBe("tool_call_end")
			expect(events[1].type).toBe("tool_call_end")
		})

		it("should not emit events for non-tool_calls finish reasons", () => {
			NativeToolCallParser.processRawChunk({
				index: 0,
				id: "call_1",
				name: "read_file",
			})

			const events = NativeToolCallParser.processFinishReason("stop")
			expect(events).toHaveLength(0)
		})

		it("should handle null/undefined finish reason", () => {
			const events1 = NativeToolCallParser.processFinishReason(null)
			expect(events1).toHaveLength(0)

			const events2 = NativeToolCallParser.processFinishReason(undefined)
			expect(events2).toHaveLength(0)
		})
	})

	describe("processStreamingChunk", () => {
		describe("read_file tool", () => {
			it("should emit a partial ToolUse with nativeArgs.path during streaming", () => {
				const id = "toolu_streaming_123"
				NativeToolCallParser.startStreamingToolCall(id, "read_file")

				const fullArgs = JSON.stringify({ path: "src/test.ts" })
				const result = NativeToolCallParser.processStreamingChunk(id, fullArgs)

				expect(result).not.toBeNull()
				expect(result?.nativeArgs).toBeDefined()
				const nativeArgs = result?.nativeArgs as { path: string }
				expect(nativeArgs.path).toBe("src/test.ts")
			})
		})

		describe("execute_command tool", () => {
			it("should emit partial ToolUse with command during streaming", () => {
				const id = "toolu_streaming_exec"
				NativeToolCallParser.startStreamingToolCall(id, "execute_command")

				const result = NativeToolCallParser.processStreamingChunk(
					id,
					JSON.stringify({ command: "npm run build", cwd: "/project" }),
				)

				expect(result).not.toBeNull()
				const nativeArgs = result?.nativeArgs as { command: string; cwd?: string }
				expect(nativeArgs.command).toBe("npm run build")
				expect(nativeArgs.cwd).toBe("/project")
			})
		})

		describe("attempt_completion tool", () => {
			it("should emit partial ToolUse during streaming", () => {
				const id = "toolu_streaming_attempt"
				NativeToolCallParser.startStreamingToolCall(id, "attempt_completion")

				const result = NativeToolCallParser.processStreamingChunk(id, JSON.stringify({ result: "Done!" }))

				expect(result).not.toBeNull()
				const nativeArgs = result?.nativeArgs as { result: string }
				expect(nativeArgs.result).toBe("Done!")
			})
		})

		describe("dynamic MCP tools", () => {
			it("should return null for MCP tools during streaming (no partial updates)", () => {
				const id = "toolu_streaming_mcp"
				NativeToolCallParser.startStreamingToolCall(id, "mcp--server--tool")

				const result = NativeToolCallParser.processStreamingChunk(id, JSON.stringify({ arg1: "value" }))

				expect(result).toBeNull()
			})
		})

		it("should return null for unknown streaming tool IDs", () => {
			const result = NativeToolCallParser.processStreamingChunk("nonexistent", "{}")
			expect(result).toBeNull()
		})
	})

	describe("finalizeStreamingToolCall", () => {
		describe("read_file tool", () => {
			it("should parse read_file args on finalize", () => {
				const id = "toolu_finalize_123"
				NativeToolCallParser.startStreamingToolCall(id, "read_file")

				NativeToolCallParser.processStreamingChunk(
					id,
					JSON.stringify({
						path: "finalized.ts",
						mode: "slice",
						offset: 1,
						limit: 10,
					}),
				)

				const result = NativeToolCallParser.finalizeStreamingToolCall(id)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { path: string; offset?: number; limit?: number }
					expect(nativeArgs.path).toBe("finalized.ts")
					expect(nativeArgs.offset).toBe(1)
					expect(nativeArgs.limit).toBe(10)
				}
			})
		})

		describe("write_to_file tool", () => {
			it("should finalize write_to_file args", () => {
				const id = "toolu_finalize_write"
				NativeToolCallParser.startStreamingToolCall(id, "write_to_file")

				NativeToolCallParser.processStreamingChunk(id, JSON.stringify({ path: "out.txt", content: "data" }))

				const result = NativeToolCallParser.finalizeStreamingToolCall(id)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("tool_use")
				if (result?.type === "tool_use") {
					const nativeArgs = result.nativeArgs as { path: string; content: string }
					expect(nativeArgs.path).toBe("out.txt")
					expect(nativeArgs.content).toBe("data")
				}
			})
		})

		describe("dynamic MCP tool", () => {
			it("should return McpToolUse for finalized MCP tool", () => {
				const id = "toolu_finalize_mcp"
				NativeToolCallParser.startStreamingToolCall(id, "mcp--weather--get_forecast")

				NativeToolCallParser.processStreamingChunk(id, JSON.stringify({ city: "London" }))

				const result = NativeToolCallParser.finalizeStreamingToolCall(id)

				expect(result).not.toBeNull()
				expect(result?.type).toBe("mcp_tool_use")
				if (result?.type === "mcp_tool_use") {
					expect(result.serverName).toBe("weather")
					expect(result.toolName).toBe("get_forecast")
					expect(result.arguments).toEqual({ city: "London" })
				}
			})
		})

		it("should return null for unknown streaming tool ID", () => {
			const result = NativeToolCallParser.finalizeStreamingToolCall("nonexistent")
			expect(result).toBeNull()
		})
	})

	describe("streaming state management", () => {
		it("should track active streaming tool calls", () => {
			expect(NativeToolCallParser.hasActiveStreamingToolCalls()).toBe(false)

			NativeToolCallParser.startStreamingToolCall("call_1", "read_file")
			expect(NativeToolCallParser.hasActiveStreamingToolCalls()).toBe(true)

			NativeToolCallParser.finalizeStreamingToolCall("call_1")
			expect(NativeToolCallParser.hasActiveStreamingToolCalls()).toBe(false)
		})

		it("should clear all streaming tool calls", () => {
			NativeToolCallParser.startStreamingToolCall("call_1", "read_file")
			NativeToolCallParser.startStreamingToolCall("call_2", "write_to_file")

			NativeToolCallParser.clearAllStreamingToolCalls()

			expect(NativeToolCallParser.hasActiveStreamingToolCalls()).toBe(false)
		})
	})

	describe("normalizeTypeValue", () => {
		it("should return non-string values as-is", () => {
			// Accessing private method via parseToolCall behavior test
			// Numbers should remain numbers
			const toolCall = {
				id: "toolu_norm_1",
				name: "read_file" as const,
				arguments: JSON.stringify({
					path: "test.ts",
					offset: 10,
				}),
			}

			const result = NativeToolCallParser.parseToolCall(toolCall)

			expect(result).not.toBeNull()
			if (result?.type === "tool_use") {
				const nativeArgs = result.nativeArgs as { offset: number }
				expect(typeof nativeArgs.offset).toBe("number")
				expect(nativeArgs.offset).toBe(10)
			}
		})
	})

	describe("convertFileEntries", () => {
		it("should return null for empty files array with no path", () => {
			// Empty files array does not match legacy format (no files to process)
			// and there's no path either, so nativeArgs is undefined -> invalid
			const toolCall = {
				id: "toolu_empty_files",
				name: "read_file" as const,
				arguments: JSON.stringify({
					files: [],
				}),
			}

			const result = NativeToolCallParser.parseToolCall(toolCall)

			expect(result).toBeNull()
		})

		it("should filter out invalid line_ranges entries", () => {
			const toolCall = {
				id: "toolu_bad_ranges",
				name: "read_file" as const,
				arguments: JSON.stringify({
					files: [
						{
							path: "test.ts",
							line_ranges: [
								[1, 50],
								null, // Should be filtered
								{ start: 100, end: 200 },
							],
						},
					],
				}),
			}

			const result = NativeToolCallParser.parseToolCall(toolCall)

			expect(result).not.toBeNull()
			if (result?.type === "tool_use") {
				const nativeArgs = result.nativeArgs as {
					files: Array<{ lineRanges?: Array<{ start: number; end: number }> }>
				}
				expect(nativeArgs.files[0].lineRanges).toHaveLength(2)
				expect(nativeArgs.files[0].lineRanges?.[0]).toEqual({ start: 1, end: 50 })
				expect(nativeArgs.files[0].lineRanges?.[1]).toEqual({ start: 100, end: 200 })
			}
		})
	})
})
