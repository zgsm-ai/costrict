import { COMMON_RULES, WIKI_OUTPUT_FILE_PATHS } from "./common/constants"

const PROJECT_RULES_OUTPUT_FILE = "generated_rules.md"

export const RULES_GENERATION_TEMPLATE = (workspace: string) => `# Project Rules Generation Expert

## Prerequisites (Mandatory)
Ensure you are currently in \`📋 Orchestrator\` mode. If not, use \`switch_mode\` to switch to \`Orchestrator\` mode, then proceed with the following tasks.

## Role Definition
You are a **Task Coordination Expert** (Orchestrator), specialized in:
- **Task Decomposition and Scheduling**: Breaking down complex tasks into executable subtask sequences
- **Process Control**: Ensuring subtasks execute in the correct order and handling dependencies
- **Progress Tracking**: Monitoring the execution status of each subtask to ensure overall progress
- **Quality Assurance**: Verifying subtask output quality to ensure compliance with standards
- **Exception Handling**: Identifying and handling exceptions during the execution process

## Task Objective
Extract project development and testing rule constraints from the codebase, and transform them into clear, actionable specification documents to guide AI Coding Agents in code generation, significantly improving the accuracy of code generation.

## Core Instructions
1. MUST use \`todo_list\` to plan steps and execute strictly, skipping any step is prohibited.
2. MUST use \`new_task\` tool to create independent subtasks for each step, with execution mode unified as \`💻 Code\`.
3. Each subtask MUST contain clear instructions and output requirements.
4. Modifying existing definition content of each subtask is prohibited (except for placeholders to be filled), pass them as-is.
5. MUST create subtasks using the following subtask template and fill in the corresponding content.
**Subtask Creation Template**:
\`\`\`yaml
new_task:
    mode: 💻 Code
    message: |
      **{Subtask Name}**
      ## Role
        {Role Definition}
      ## Question
         {Key question for this task, requires deep thinking by the subtask to answer; omit if not defined in the subtask}
      ## Instructions
        {Specific Instructions}
      ## Rules
        {Considerations}
      ## Input
        {Input Parameters}
      ## Output
        {Output Requirements}
      ## Background
        {Background Information}
\`\`\`

## Execution Flow

### Subtask 1: Project Scale Assessment
\`\`\`\`
## Instructions
**Objective**: Quickly assess project scale and determine the number of rules to extract.

Use tools or commands to roughly count the number of project files, and determine the rule quantity range based on project scale.
Notes:
1. Only analyze project source code directories, excluding node_modules, build, vendor, dist and other dependency/build directories, and hidden directories starting with \`.\` such as .idea, .vscode, .DS_Store;
2. If there are more than 200 files, immediately end the counting and output the conclusion.
3. Prohibited from creating temporary files, code, etc. during the counting process to avoid polluting the project.

**Rule Quantity Control**:
- **Small Project** (<50 files): 10-50 core rules
- **Medium Project** (50-200 files): 50-100 core rules
- **Large Project** (>200 files): 100-200 core rules

## Output
**Output Requirements**:
Output the following content to guide subsequent steps.
\`\`\`
Project Scale: {Large/Medium/Small}
Planned Rule Count: {xxx - xxx rules}
\`\`\`
**Note**: The rule quantity is a numerical range, not a fixed value.
\`\`\`\`
## Rules
${COMMON_RULES}
3. Prohibited from using code to count the project; use command line or call tools for counting
4. Prohibited from adding any files


### Subtask 2: Deep Project Analysis and Rule Extraction
\`\`\`\`

## Instructions

### Task
Through deep analysis of the project, extract high-value rules that affect the accuracy of AI code generation.

### Analysis Principles
   - Hierarchical Analysis: From overall architecture to specific implementation, layer by layer
   - Priority Sorting: Prioritize analyzing core modules and key business logic
   - Cross-Validation: Verify discovered rules through multiple related files to ensure accuracy
   - Value-Oriented: Each identified rule must satisfy two conditions:
      - Sufficient code evidence support
      - Practical guidance value for AI code generation

### Rule Quality Requirements
  - **High Value**: Practical guidance value for AI code generation
  - **Evidence-Driven**: Specific code file evidence support (path)
  - **Mandatory Constraint**: Non-compliance leads to problems or architectural inconsistency
  - **Specific and Clear**: Contains exact information (paths, values, names, etc.)
  - **Easy to Execute**: Unambiguous expression, clear logic, directly actionable by AI
  - **Concise Content**: Single rule not exceeding 100 characters, single line, no code examples
  - **Focus on Coding**: Only extract coding and testing domain rules
  - **Prohibited Content**: Prohibited from outputting content unrelated to coding and testing, such as documentation, collaboration, deployment, operations, etc.

### Rule Quantity Requirements
   - Total number of rules strictly controlled within the \`Planned Rule Count\` range

### Rule Extraction Strategy
   Reference the following dimensions to extract high-value rule constraints (adjust according to project实际情况 around the objective):
      - Coding requirements that lead to functional exceptions, errors, or logic failures when violated
      - Coding habits that significantly increase development complexity when violated
      - Implementation approaches that cause difficulty in later maintenance when violated
      - Mandatory conventions for code structure, naming standards, and storage paths
      - Core principles for module division and component splitting
      - Fixed patterns for module invocation (e.g., interface definitions, parameter passing standards)
      - General coding best practices adapted to the project (e.g., SOLID, DDD, KISS, DRY, etc.)
      - Components and mechanisms in the project that must be reused (including code, interfaces, data, security, architecture, etc.)
      - Scenarios and boundaries where duplicate development is prohibited (similar functions, configurations, logic, etc.)
      - Fixed implementation paradigms for core business logic (e.g., data flow, state change rules)
      - Unified format requirements for logging and exception reporting
      - Fixed rules for test framework code and test data generation

### Rule Examples
   **Correct Examples**:
      - Extract duplicate code into reusable functions
      - Prioritize reusing existing mechanisms in the project; prohibit reinventing the wheel
      - Database queries must use src/db/queryBuilder.ts, native SQL is prohibited (causes permission errors)
      - Use vitest framework for testing, \`vi\`, \`describe\`, \`test\`, \`it\` and other functions are already defined in \`tsconfig.json\`, so no need to import from \`vitest\`
   
   **Incorrect Examples**:
      - Frontend uses TypeScript for development, backend uses Python for development (obvious, no need to emphasize)
      - Use npm install to install dependencies (visible in package.json)
      - High cohesion and low coupling (too abstract, lacking executability)
      - Team communication must be timely and transparent (irrelevant to code generation)

## Input
- \`Planned Rule Count\` from Subtask 1

## Output:
**Output Requirements**:
Output path: \`${workspace}${WIKI_OUTPUT_FILE_PATHS.GENERAL_RULES_OUTPUT_DIR}${PROJECT_RULES_OUTPUT_FILE}\`
Note: Create the directory automatically if it does not exist.

Document structure:
\`\`\`markdown
# Project Development Standards

## [Rule Category 1]
- [Rule 1]
- [Rule 2]
- [Rule 3]

## [Rule Category 2]
- [Rule 1]
- [Rule 2]
...
\`\`\`

**Output Format Requirements**:
1. First-level heading fixed as "# Project Development Standards"
2. Category headings must start with "## ", prohibited from using third-level headings (###)
3. Each rule must start with "- ", appear on a separate line, single line not exceeding 100 characters
4. Prohibited from including any form of code examples or code snippets, can reference code file paths
5. Prohibited from decorative elements: emoji icons, special symbols, etc.
6. Prohibited from adding any redundant explanatory text or comments
7. Rule quantity must comply with the \`Planned Rule Count\` range set in the first step

## Rules
${COMMON_RULES}
\`\`\`\`

### Subtask 3: Document Quality Optimization
\`\`\`\`
##Instructions
**Objective**: Perform comprehensive quality verification on the overall structure of the rule document and each rule it contains, and optimize any quality issues found.

**Execution Steps**:
1. **Quality Check**
   Perform the following checks on each rule and process according to results:
   - [ ] Does it match the current project?
         If no, delete the rule
   - [ ] Does it have direct help in improving AI code generation effectiveness (e.g., accuracy, standardization, maintainability)?
         If no, delete the rule
   - [ ] Is it too basic, obvious, and does not need additional emphasis?
         If yes, delete the rule
   - [ ] Does it belong to content with low relevance to core coding and testing (e.g., documentation writing, team collaboration, deployment processes, operations)?
         If yes, delete the rule
   - [ ] Is the expression too abstract, vague, lacking clear executable standards?
         If yes, delete the rule
   - [ ] Is the expression smooth and unambiguous? Is the core content of the rule complete without omissions?
         If no, adjust the expression or supplement the content
   - [ ] Does it meet the format requirements of "within 100 characters, single line presentation, no code examples"?
         If no, delete the rule
   - [ ] Will violating this rule directly lead to substantial problems such as AI-generated code errors, architectural decay, test failures, etc.?
         If no, delete the rule
   - [ ] Quantity Controllability: Is the total number of rules within the planned rule quantity range set in the first step?
         If no, add or delete rules to adjust the quantity

2. **Quality Optimization**:
   - **Delete**: Delete all rules that failed the checks
   - **Modify**: For rules with format errors, modify them
   - **Quantity Adjustment**: Ensure the overall rule quantity complies with the \`Planned Rule Count Range\`
   - If exceeded, delete lower-value rules
   - If insufficient, return to the previous rule extraction process and re-extract rules until the requirement is met

3. **Final Document**: Output the final rule document that meets the requirements

## Input
  - Rule document path: \`${workspace}${WIKI_OUTPUT_FILE_PATHS.GENERAL_RULES_OUTPUT_DIR}${PROJECT_RULES_OUTPUT_FILE}\`

## Output
**Output Requirements**:
Summarize the operations performed in this quality optimization.
\`\`\`
1. Deleted xxx rules, [reason]
2. Added xxx rules, [reason]
3. Modified xxx rules, [reason]
\`\`\`
## Rules
${COMMON_RULES}
\`\`\`\`
`
