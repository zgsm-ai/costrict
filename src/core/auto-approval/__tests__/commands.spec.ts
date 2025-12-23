import { containsDangerousSubstitution } from "../commands"

vi.mock("../../../utils/shell", () => ({
	getShell: vi.fn(),
}))

import { getShell } from "../../../utils/shell"

describe("containsDangerousSubstitution", () => {
	// Store original process values
	const originalPlatform = process.platform
	const originalEnv = { ...process.env }

	afterEach(() => {
		// Restore original values after each test
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
		})
		process.env = { ...originalEnv }
		vi.clearAllMocks()
	})

	describe("Windows CMD environment", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", {
				value: "win32",
			})
			vi.mocked(getShell).mockReturnValue("C:\\Windows\\System32\\cmd.exe")
		})

		it("should detect caret before quote", () => {
			expect(containsDangerousSubstitution('echo ^"test^"')).toBe(true)
		})

		it("should detect caret before space", () => {
			expect(containsDangerousSubstitution("echo ^ test")).toBe(true)
		})

		it("should detect caret before pipe", () => {
			expect(containsDangerousSubstitution("echo test^|cat")).toBe(true)
		})

		it("should detect caret before ampersand", () => {
			expect(containsDangerousSubstitution("echo test^&echo done")).toBe(true)
		})

		it("should detect caret before less than", () => {
			expect(containsDangerousSubstitution("echo ^<input")).toBe(true)
		})

		it("should detect caret before greater than", () => {
			expect(containsDangerousSubstitution("echo test^>output")).toBe(true)
		})

		it("should detect caret before caret", () => {
			expect(containsDangerousSubstitution("echo test^^")).toBe(true)
		})

		it("should allow caret without dangerous context", () => {
			expect(containsDangerousSubstitution("echo test")).toBe(false)
		})

		it("should allow caret before letters", () => {
			expect(containsDangerousSubstitution("echo^test")).toBe(false)
		})
	})

	describe("PowerShell environment", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", {
				value: "win32",
			})
			vi.mocked(getShell).mockReturnValue("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
		})

		it("should detect backtick before quote", () => {
			expect(containsDangerousSubstitution('echo `"test`"')).toBe(true)
		})

		it("should detect backtick before space", () => {
			expect(containsDangerousSubstitution("echo ` test")).toBe(true)
		})

		it("should detect backtick before dollar sign", () => {
			expect(containsDangerousSubstitution("echo `$var")).toBe(true)
		})

		it("should detect backtick before semicolon", () => {
			expect(containsDangerousSubstitution("echo test`; echo done")).toBe(true)
		})

		it("should detect backtick before ampersand", () => {
			expect(containsDangerousSubstitution("echo test`& echo done")).toBe(true)
		})

		it("should detect backtick before pipe", () => {
			expect(containsDangerousSubstitution("echo test`| cat")).toBe(true)
		})

		it("should detect backtick before parentheses", () => {
			expect(containsDangerousSubstitution("echo `(`test`)`")).toBe(true)
		})

		it("should detect backtick before braces", () => {
			expect(containsDangerousSubstitution("echo `{`test`}`")).toBe(true)
		})

		it("should allow caret in PowerShell (not a danger)", () => {
			expect(containsDangerousSubstitution('echo ^"test^"')).toBe(false)
		})

		it("should allow backtick before letters", () => {
			expect(containsDangerousSubstitution("echo`test")).toBe(false)
		})
	})

	describe("Git Bash environment", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", {
				value: "win32",
			})
			vi.mocked(getShell).mockReturnValue("C:\\Program Files\\Git\\bin\\bash.exe")
		})

		it("should not detect caret as dangerous in Git Bash", () => {
			expect(containsDangerousSubstitution('echo ^"test^"')).toBe(false)
		})

		it("should not detect backtick as dangerous in Git Bash", () => {
			expect(containsDangerousSubstitution('echo `"test`"')).toBe(false)
		})

		it("should allow normal commands in Git Bash", () => {
			expect(containsDangerousSubstitution("echo test")).toBe(false)
		})
	})

	describe("Non-Windows environment", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", {
				value: "linux",
			})
			delete process.env.SHELL
			delete process.env.PSModulePath
		})

		it("should not detect caret as dangerous on Linux", () => {
			expect(containsDangerousSubstitution('echo ^"test^"')).toBe(false)
		})

		it("should not detect backtick as dangerous on Linux", () => {
			expect(containsDangerousSubstitution('echo `"test`"')).toBe(false)
		})
	})

	describe("Parameter expansion patterns", () => {
		it("should detect ${var@P} - prompt string expansion", () => {
			expect(containsDangerousSubstitution("echo ${var@P}")).toBe(true)
		})

		it("should detect ${var@Q} - quote removal", () => {
			expect(containsDangerousSubstitution("echo ${var@Q}")).toBe(true)
		})

		it("should detect ${var@E} - escape sequence expansion", () => {
			expect(containsDangerousSubstitution("echo ${var@E}")).toBe(true)
		})

		it("should detect ${var@A} - assignment statement", () => {
			expect(containsDangerousSubstitution("echo ${var@A}")).toBe(true)
		})

		it("should detect ${var@a} - attribute flags", () => {
			expect(containsDangerousSubstitution("echo ${var@a}")).toBe(true)
		})
	})

	describe("Parameter expansion with escape sequences", () => {
		it("should detect octal escape sequences", () => {
			expect(containsDangerousSubstitution("echo ${var=\\140}")).toBe(true)
		})

		it("should detect hex escape sequences", () => {
			expect(containsDangerousSubstitution("echo ${var:=\\x60}")).toBe(true)
		})

		it("should detect unicode escape sequences", () => {
			expect(containsDangerousSubstitution("echo ${var+\\u0060}")).toBe(true)
		})
	})

	describe("Indirect variable references", () => {
		it("should detect ${!var}", () => {
			expect(containsDangerousSubstitution("echo ${!var}")).toBe(true)
		})

		it("should detect ${!prefix*}", () => {
			expect(containsDangerousSubstitution("echo ${!prefix*}")).toBe(true)
		})
	})

	describe("Here-strings with command substitution", () => {
		it("should detect <<< with $()", () => {
			expect(containsDangerousSubstitution("cat <<< $(whoami)")).toBe(true)
		})

		it("should detect <<< with backticks", () => {
			expect(containsDangerousSubstitution("cat <<< `whoami`")).toBe(true)
		})

		it("should allow <<< without command substitution", () => {
			expect(containsDangerousSubstitution("cat <<< test")).toBe(false)
		})
	})

	describe("Zsh process substitution", () => {
		it("should detect =(...)", () => {
			expect(containsDangerousSubstitution("cat =(ls)")).toBe(true)
		})

		it("should detect =(command)", () => {
			expect(containsDangerousSubstitution("echo =(whoami)")).toBe(true)
		})
	})

	describe("Zsh glob qualifiers with code execution", () => {
		it("should detect *(e:command:)", () => {
			expect(containsDangerousSubstitution("ls *(e:whoami:)")).toBe(true)
		})

		it("should detect ?(e:command:)", () => {
			expect(containsDangerousSubstitution("ls ?(e:whoami:)")).toBe(true)
		})

		it("should detect +(e:command:)", () => {
			expect(containsDangerousSubstitution("ls +(e:whoami:)")).toBe(true)
		})

		it("should detect @(e:command:)", () => {
			expect(containsDangerousSubstitution("ls @(e:whoami:)")).toBe(true)
		})

		it("should detect !(e:command:)", () => {
			expect(containsDangerousSubstitution("ls !(e:whoami:)")).toBe(true)
		})
	})

	describe("Safe commands", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", {
				value: "linux",
			})
		})

		it("should allow simple echo", () => {
			expect(containsDangerousSubstitution("echo hello")).toBe(false)
		})

		it("should allow git commands", () => {
			expect(containsDangerousSubstitution("git status")).toBe(false)
		})

		it("should allow npm commands", () => {
			expect(containsDangerousSubstitution("npm install")).toBe(false)
		})

		it("should allow variable expansion without dangerous patterns", () => {
			expect(containsDangerousSubstitution("echo ${var}")).toBe(false)
		})

		it("should allow simple parameter expansion", () => {
			expect(containsDangerousSubstitution("echo ${var:-default}")).toBe(false)
		})
	})

	describe("Edge cases", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", {
				value: "win32",
			})
			vi.mocked(getShell).mockReturnValue("C:\\Windows\\System32\\cmd.exe")
		})

		it("should handle empty string", () => {
			expect(containsDangerousSubstitution("")).toBe(false)
		})

		it("should handle multiple caret patterns", () => {
			expect(containsDangerousSubstitution('echo ^"test^" && echo ^"done^"')).toBe(true)
		})

		it("should handle caret at the beginning", () => {
			expect(containsDangerousSubstitution('^"test"')).toBe(true)
		})

		it("should handle caret at the end", () => {
			expect(containsDangerousSubstitution("echo test^")).toBe(false)
		})
	})
})
