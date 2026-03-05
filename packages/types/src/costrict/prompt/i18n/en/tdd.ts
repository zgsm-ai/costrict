// TDD command content for English
export const TDD_CONTENT = `---
description: "Test Driven Development"
---

Please strictly follow the following rules:

1. First use \`search_files\` to check if the .cospec/TEST_GUIDE.md file exists. If the file does not exist, use the \`ask_followup_question\` tool to inform the user how to create the test guide document: "Test guide document not found. Please trigger the 'Test Plan' function on the homepage to generate it.\u003csuggest\u003eConfirm and exit\u003c/suggest\u003e\u003csuggest\u003eSkip test steps\u003c/suggest\u003e", and then ignore subsequent test requirements; if the file exists, read it as the single source of truth for testing methods.
2. Ensure all test cases pass 100%
3. If not all test cases pass, you must use the \`ask_followup_question\` tool to ask me: "Tests did not pass completely (current pass rate: [please fill in the actual pass rate]%), is it allowed to end the task?". Only after I give a positive response can you use the attempt_completion tool
`

export default TDD_CONTENT
