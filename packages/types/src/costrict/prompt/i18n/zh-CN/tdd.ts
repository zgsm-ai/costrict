// TDD command content for Simplified Chinese
export const TDD_CONTENT = `---
description: "测试驱动开发"
---

请严格遵守以下规则：

1. 首先使用 \`search_files\` 检查 .cospec/TEST_GUIDE.md 文件是否存在。如果文件不存在，使用 \`ask_followup_question\` 工具告知用户如何创建测试指南文档："未找到测试指南文档。请在首页触发'测试计划'功能来生成它。\u003csuggest\u003e确认并退出\u003c/suggest\u003e\u003csuggest\u003e跳过测试步骤\u003c/suggest\u003e"，然后忽略后续的测试要求；如果文件存在，请将其作为测试方法的唯一事实来源阅读。
2. 确保所有测试用例 100% 通过
3. 如果并非所有测试用例都通过，您必须使用 \`ask_followup_question\` 工具问我："测试未完全通过（当前通过率：[请填写实际通过率]%），是否允许结束任务？"。只有在我给出肯定答复后，您才能使用 attempt_completion 工具
`

export default TDD_CONTENT
