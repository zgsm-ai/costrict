export function getAskMultipleChoiceDescription(): string {
	return `## ask_multiple_choice
Description: Present structured multiple-choice questions to collect user decisions efficiently. Use this when you need the user to select from predefined options, supporting both single-select and multi-select modes. This tool is ideal for gathering categorical preferences, confirming implementation approaches, or collecting structured feedback.

**IMPORTANT**: When you have multiple related decisions to make, ask ALL questions in a SINGLE tool call rather than making multiple separate calls. This significantly improves user experience by reducing back-and-forth interactions.

Key differences from ask_followup_question:
- ask_followup_question: Provides suggestions but allows free-text input (flexible)
- ask_multiple_choice: Forces selection from given options only (structured, no free input)

Parameters:
- title: (optional) A brief title for the entire questionnaire
- questions: (required) Array of question objects, each containing:
  - id: (required) Unique identifier for this question (used to match answers in the result)
  - prompt: (required) The question text to display
  - options: (required) Array of option objects (minimum 2), each with:
    - id: (required) Unique identifier for this option (used in the result to identify which option was selected)
    - label: (required) Display text for this option
  - allow_multiple: (optional) Boolean, defaults to false. Set to true for checkbox-style multi-select, false for radio-style single-select

Usage:
<ask_multiple_choice>
<title>Optional Questionnaire Title</title>
<questions>
<question>
<id>question_id</id>
<prompt>Your question text here</prompt>
<options>
<option>
<id>option_id</id>
<label>First option text</label>
</option>
<option>
<id>another_option_id</id>
<label>Second option text</label>
</option>
</options>
<allow_multiple>false</allow_multiple>
</question>
</questions>
</ask_multiple_choice>

Example:
<ask_multiple_choice>
<title>Project Configuration</title>
<questions>
<question>
<id>framework</id>
<prompt>Which framework should I use?</prompt>
<options>
<option>
<id>react</id>
<label>React</label>
</option>
<option>
<id>vue</id>
<label>Vue</label>
</option>
<option>
<id>angular</id>
<label>Angular</label>
</option>
</options>
<allow_multiple>false</allow_multiple>
</question>
<question>
<id>features</id>
<prompt>Which features should be included? (Select all that apply)</prompt>
<options>
<option>
<id>auth</id>
<label>User authentication</label>
</option>
<option>
<id>api</id>
<label>REST API integration</label>
</option>
<option>
<id>i18n</id>
<label>Internationalization</label>
</option>
<option>
<id>testing</id>
<label>Unit testing setup</label>
</option>
</options>
<allow_multiple>true</allow_multiple>
</question>
</questions>
</ask_multiple_choice>

Best Practices:
- **Ask multiple related questions in ONE tool call** rather than calling this tool multiple times. This reduces interaction rounds and improves efficiency.
- Use single-select (allow_multiple=false) for mutually exclusive choices (e.g., choosing a framework)
- Use multi-select (allow_multiple=true) when multiple options can coexist (e.g., selecting features to include)
- Keep option labels concise but descriptive (1-2 lines maximum per option)
- Provide 2-6 options per question for optimal user experience
- Group related questions together with a descriptive title that explains the overall context
- Use clear, specific question prompts that explain what you're asking for
- Choose meaningful IDs (e.g., "framework", "auth_method") that make the response self-documenting

When to use ask_multiple_choice vs ask_followup_question:
- Use ask_multiple_choice when you need structured, categorical decisions (choosing from predefined options)
- Use ask_followup_question when you need free-form text input or simple confirmation with suggestions`
}

