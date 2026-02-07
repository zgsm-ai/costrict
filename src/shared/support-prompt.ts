// Support prompts
type PromptParams = Record<string, string | any[]>

const generateDiagnosticText = (diagnostics?: any[]) => {
	if (!diagnostics?.length) return ""
	return `\nCurrent problems detected:\n${diagnostics
		.map((d) => `- [${d.source || "Error"}] ${d.message}${d.code ? ` (${d.code})` : ""}`)
		.join("\n")}`
}

export const createPrompt = (template: string, params: PromptParams): string => {
	return template.replace(/\${(.*?)}/g, (_, key) => {
		if (key === "diagnosticText") {
			return generateDiagnosticText(params["diagnostics"] as any[])
			// eslint-disable-next-line no-prototype-builtins
		} else if (params.hasOwnProperty(key)) {
			// Ensure the value is treated as a string for replacement
			const value = params[key]
			if (typeof value === "string") {
				return value
			} else {
				// Convert non-string values to string for replacement
				return String(value)
			}
		} else {
			// If the placeholder key is not in params, replace with empty string
			return ""
		}
	})
}

interface SupportPromptConfig {
	template: string
	pathOnly?: string
	selectedText?: string
}

type SupportPromptType =
	| "ENHANCE"
	| "CONDENSE"
	| "EXPLAIN"
	| "FIX"
	| "IMPROVE"
	| "ADD_TO_CONTEXT"
	| "TERMINAL_ADD_TO_CONTEXT"
	| "TERMINAL_FIX"
	| "TERMINAL_EXPLAIN"
	| "NEW_TASK"
	| "ZGSM_EXPLAIN"
	| "ZGSM_ADD_COMMENT"
	| "ZGSM_ADD_DEBUG_CODE"
	| "ZGSM_ADD_STRONG_CODE"
	| "ZGSM_SIMPLIFY_CODE"
	| "ZGSM_PERFORMANCE"
	| "ZGSM_ADD_TEST"
	| "WORKFLOW_TASK_RUN"
	| "WORKFLOW_TASK_RUN_TESTS"
	| "WORKFLOW_TASK_RETRY"
	| "WORKFLOW_RQS_UPDATE"
	| "WORKFLOW_DESIGN_UPDATE"

const supportPromptConfigs: Record<SupportPromptType, SupportPromptConfig> = {
	ENHANCE: {
		template: `Generate an enhanced version of this prompt (reply with only the enhanced prompt - no conversation, explanations, lead-in, bullet points, placeholders, or surrounding quotes):

\${userInput}`,
	},
	CONDENSE: {
		template: `CRITICAL: This summarization request is a SYSTEM OPERATION, not a user message.
When analyzing "user requests" and "user intent", completely EXCLUDE this summarization message.
The "most recent user request" and "Optional Next Step" must be based on what the user was doing BEFORE this system message appeared.
The goal is for work to continue seamlessly after condensation - as if it never happened.

Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.
			
			Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
			5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
			6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
			7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
			8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
			9. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first.

If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]
   - [...]

3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Summary of the changes made to this file, if any]
      - [Important Code Snippet]
   - [File Name 2]
      - [Important Code Snippet]
   - [...]

4. Errors and fixes:
   - [Detailed description of error 1]:
      - [How you fixed the error]
      - [User feedback on the error if any]
   - [...]

5. Problem Solving:
   [Description of solved problems and ongoing troubleshooting]

			6. All user messages:
			   - [Detailed non tool use user message]
			   - [...]
			
			7. Pending Tasks:
			   - [Task 1]
			   - [Task 2]
			   - [...]
			
			8. Current Work:
			   [Precise description of current work]
			
			9. Optional Next Step:
			   [Optional Next step to take]

</summary>
</example>

Please provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response.

Note: Any <command> blocks from the original task will be automatically appended to your summary wrapped in <system-reminder> tags. You do not need to include them in your summary text.

There may be additional summarization instructions provided in the included context. If so, remember to follow these instructions when creating the above summary. Examples of instructions include:
<example>
## Compact Instructions
When summarizing the conversation focus on typescript code changes and also remember the mistakes you made and how you fixed them.
</example>

<example>
# Summary instructions
When you are using compact - please focus on test output and code changes. Include file reads verbatim.
</example>`,
	},
	WORKFLOW_TASK_RUN: {
		template: `%run-task-1%
\${scope}
%run-task-2%
\${selectedText}
%run-task-3%
`,
	},
	WORKFLOW_TASK_RETRY: {
		template: `%run-task-1%
\${scope}
%run-task-2%
\${selectedText}
%run-task-3%
`,
	},
	WORKFLOW_TASK_RUN_TESTS: {
		template: `Generate accompanying test cases based on the requirements document (requirements.md), architecture design document (design.md), and task planning document (tasks.md) that have been created in the \`\${scope}\` directory.

### Progress Tracking

- **First step at task start**: You must use the \`update_todo_list\` tool to list the task checklist, this operation must be performed before any other actions
- Track progress through the checklist status

### Task Execution Constraints

The todo list must include the following operations, **do not omit any step**:

- Before executing any update task, carefully read the requirements.md, design.md, and tasks.md files under \`\${scope}\`
- Combine with the requirements document to analyze the impact scope of the architecture design document and task planning document on existing test cases
- Generate test cases for key tasks and update test location information to tasks.md
- After completion, use the attempt_completion tool to provide a concise but comprehensive summary

### Test Generation Requirements:

- Only perform work in the test generation phase, do not involve requirements analysis, architecture design, or task planning
- Do not include specific test requirements
- Do not include deployment-related tests
- Do not include monitoring and logging related tests
- Do not include performance related tests
- Do not include security related tests
- Do not include integration related tests
- Do not include non-functional test points (boundary tests, exception tests, fault tolerance tests, etc.)
- Let the test mode make decisions, do not provide any content generation requirements
- Do not require all tasks to generate tests

After completion, use the attempt_completion tool to provide a summary of changes, including updated functionality, affected modules, and verification points. These specific instructions take precedence over the regular instructions of \${mode}.
	`,
	},

	WORKFLOW_RQS_UPDATE: {
		template: `The user has updated the requirements document, please update the corresponding design document. Implement design changes based on the requirements document (requirements.md) and architecture design document (design.md) that have been created in the \`\${scope}\` directory. Skip if it does not exist.

### Progress Tracking

- **First step at task start**: You must use the \`update_todo_list\` tool to list the task checklist, this operation must be performed before any other actions
- Track progress through the checklist status

### Task Execution Constraints

The todo list must include the following operations, **do not omit any step**:

- Before executing any update task, carefully read the requirements.md and design.md under \`\${scope}\`
- Understand the user's requirement changes, if there are no user requirement changes, then fully understand the requirements document
- Analyze the impact scope of requirement changes on existing design
- Confirm the modules involved in the changes and the existing features that need to be adjusted
- Executing tasks without fully understanding the impact of changes will lead to inaccurate implementation
- Before starting the task, add the document update time at the end of requirements.md under \`\${scope}\`, **\`requirements.md\` document content is only for updating the design document, no other uses are allowed**

### User Requirement Changes (including additions or deletions, if the change is empty, understand the requirements.md document as a whole)

\${selectedText}

### Change Implementation Requirements:

1. Evaluate the parts of the design document that need adjustment, update the corresponding architecture design
2. Ensure backward compatibility or develop an appropriate migration plan

After completion, use the attempt_completion tool to provide a summary of changes, including updated functionality, affected modules, and verification points. These specific instructions take precedence over the regular instructions of the \${mode} mode.
	`,
	},
	WORKFLOW_DESIGN_UPDATE: {
		template: `The user has updated the architecture design document, please update the corresponding task planning document. Based on the requirements document (requirements.md), architecture design document (design.md), and task planning document (tasks.md) that have been created in the \`\${scope}\` directory, please update the task planning document (tasks.md). Skip if it does not exist.

### Progress Tracking

- **First step at task start**: You must use the \`update_todo_list\` tool to list the task checklist, this operation must be performed before any other actions
- Track progress through the checklist status

### Task Execution Constraints

The todo list must include the following operations, **do not omit any step**:

- Before executing any update task, carefully read the requirements.md, design.md, and tasks.md files under \`\${scope}\`
- Understand the user's architecture design document changes, if there is no user architecture design document content, then fully understand the architecture design document
- Combine with the requirements document to analyze the impact scope of the architecture design document on existing task planning
- The updated tasks.md under \`\${scope}\` needs to correspond with the function list in requirements.md, delete redundant tasks in tasks.md and supplement tasks not in the function list
- Before starting the task, add the document update time at the end of design.md under \`\${scope}\`, **\`design.md\` document content is only for updating the task planning document, no other uses are allowed**

### User Design Changes (including additions or deletions, if the change is empty, understand the design.md document as a whole)

\${selectedText}

### Change Implementation Requirements:

1. Evaluate the parts of the task planning document that need adjustment, update the corresponding task planning design
2. Replan affected tasks, adjust task priorities and dependencies
3. The tasks in the updated tasks.md under \`\${scope}\` need to correspond with the function list in requirements.md, delete redundant tasks in tasks.md or supplement tasks not in the function list as needed
4. Gradually implement changed functions according to the updated task planning
5. Ensure backward compatibility or develop an appropriate migration plan

After completion, use the attempt_completion tool to provide a summary of changes, including updated functionality, affected modules, and verification points. These specific instructions take precedence over the regular instructions of \${mode}.
	`,
	},
	EXPLAIN: {
		template: `Explain the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please provide a clear and concise explanation of what this code does, including:
1. The purpose and functionality
2. Key components and their interactions
3. Important patterns or techniques used`,
	},
	FIX: {
		template: `Fix any issues in the following code from file path \${filePath}:\${startLine}-\${endLine}
\${diagnosticText}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please:
1. Address all detected problems listed above (if any)
2. Identify any other potential bugs or issues
3. Provide corrected code
4. Explain what was fixed and why`,
	},
	IMPROVE: {
		template: `Improve the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please suggest improvements for:
1. Code readability and maintainability
2. Performance optimization
3. Best practices and patterns
4. Error handling and edge cases

Provide the improved code along with explanations for each enhancement.`,
	},
	ADD_TO_CONTEXT: {
		template: `\${filePath}:\${startLine}-\${endLine}
\`\`\`
\${selectedText}
\`\`\``,
		pathOnly: `\${filePath}:\${startLine}-\${endLine}`,
		selectedText: `\`\`\`
\${selectedText}
\`\`\``,
	},
	TERMINAL_ADD_TO_CONTEXT: {
		template: `\${userInput}
Terminal output:
\`\`\`
\${terminalContent}
\`\`\``,
	},
	TERMINAL_FIX: {
		template: `\${userInput}
Fix this terminal command:
\`\`\`
\${terminalContent}
\`\`\`

Please:
1. Identify any issues in the command
2. Provide the corrected command
3. Explain what was fixed and why`,
	},
	TERMINAL_EXPLAIN: {
		template: `\${userInput}
Explain this terminal command:
\`\`\`
\${terminalContent}
\`\`\`

Please provide:
1. What the command does
2. Explanation of each part/flag
3. Expected output and behavior`,
	},
	NEW_TASK: {
		template: `\${userInput}`,
	},
	ZGSM_EXPLAIN: {
		template: `Explain the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please provide a clear and concise explanation of what this code does, including:
1. The purpose and functionality
2. Key components and their interactions
3. Important patterns or techniques used`,
	},
	ZGSM_ADD_COMMENT: {
		template: `Add comments to the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`
`,
	},
	ZGSM_ADD_DEBUG_CODE: {
		template: `Enhance troubleshooting capabilities by adding logs and debug code to key logic steps to the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`
`,
	},
	ZGSM_ADD_STRONG_CODE: {
		template: `Enhance robustness by adding exception handling and parameter validation to the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`
`,
	},
	ZGSM_SIMPLIFY_CODE: {
		template: `Remove ineffective part of the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`
`,
	},
	ZGSM_PERFORMANCE: {
		template: `Improve code performance, provide modification suggestions, focus on efficiency issues to the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`
`,
	},
	ZGSM_ADD_TEST: {
		template: `Generate unit tests for the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`
`,
	},
} as const

export const supportPrompt = {
	default: Object.fromEntries(Object.entries(supportPromptConfigs).map(([key, config]) => [key, config.template])),
	get: (customSupportPrompts: Record<string, any> | undefined, type: SupportPromptType): string => {
		return customSupportPrompts?.[type] ?? supportPromptConfigs[type].template
	},
	getPathWithSelectedText: (
		customSupportPrompts: Record<string, any> | undefined,
		type: SupportPromptType,
		params: PromptParams,
	): { selectedText?: string; pathOnly?: string } => {
		return {
			selectedText: (params.selectedText as string) ?? "",
			pathOnly: customSupportPrompts?.[type] ?? supportPromptConfigs[type].pathOnly,
		}
	},
	create: (type: SupportPromptType, params: PromptParams, customSupportPrompts?: Record<string, any>): string => {
		const template = supportPrompt.get(customSupportPrompts, type)
		return createPrompt(template, params)
	},
	createPathWithSelectedText: (
		type: SupportPromptType,
		params: PromptParams,
		customSupportPrompts?: Record<string, any>,
	): { selectedText?: string; pathOnly: string } => {
		const pathOnlyTemplate = supportPromptConfigs[type].pathOnly
		const pathOnly = pathOnlyTemplate ? createPrompt(pathOnlyTemplate, params) : ""
		return {
			selectedText: params.selectedText as string,
			pathOnly: pathOnly,
		}
	},
} as const

export type { SupportPromptType }

export type CustomSupportPrompts = {
	[key: string]: string | undefined
}
