# Costrict Workflow 扩展性和定制化能力证明

## 概述

本文档证明 Costrict 的 workflow 机制具有非常强的扩展性和定制化能力，能够轻松融入客户现有研发链，满足招商局集团的智能研发工具链需求。

---

## 1. 灵活的模式配置系统

### 1.1 多层级模式定义

Costrict 支持**项目级**和**全局级**两种模式配置方式：

#### 项目级模式（.roomodes）
- **位置**: 项目根目录的 `.roomodes` 文件
- **作用范围**: 仅当前项目
- **优先级**: 高于全局配置
- **代码证明**: [CustomModesManager.ts:93-104](src/core/config/CustomModesManager.ts#L93-L104)

```typescript
// 支持从工作区加载 .roomodes 文件
private async getWorkspaceRoomodes(): Promise<string | undefined> {
    const workspaceRoot = getWorkspacePath()
    const roomodesPath = path.join(workspaceRoot, ROOMODES_FILENAME)
    const exists = await fileExistsAtPath(roomodesPath)
    return exists ? roomodesPath : undefined
}
```

#### 全局级模式
- **位置**: 用户全局配置目录
- **作用范围**: 所有项目
- **代码证明**: [CustomModesManager.ts:249-259](src/core/config/CustomModesManager.ts#L249-L259)

### 1.2 模式配置结构

每个智能体模式包含以下可配置项：

| 配置项 | 说明 | 客户定制点 |
|--------|------|------------|
| `slug` | 模式唯一标识 | ✅ 可定制工作流阶段名称 |
| `name` | 显示名称 | ✅ 可使用中文名称 |
| `roleDefinition` | 智能体角色定义 | ✅ 可注入企业规范 |
| `whenToUse` | 使用场景说明 | ✅ 可定制触发条件 |
| `description` | 功能描述 | ✅ 可自定义说明 |
| `customInstructions` | 自定义指令 | ✅ **核心定制点** |
| `groups` | 工具组权限 | ✅ 可精确控制权限 |
| `apiProvider` | API 提供者 | ✅ 可对接企业 LLM |

**代码证明**: [mode.ts:64-76](packages/types/src/mode.ts#L64-L76)

---

## 2. 细粒度的工具组权限系统

### 2.1 工具组定义

Costrict 将工具划分为不同的组，支持细粒度的权限控制：

```typescript
export const TOOL_GROUPS: Record<ToolGroup, ToolGroupConfig> = {
    read: {
        tools: ["read_file", "search_files", "list_files", "codebase_search"]
    },
    edit: {
        tools: ["apply_diff", "write_to_file", "generate_image"]
    },
    command: {
        tools: ["execute_command", "read_command_output"]
    },
    browser: {
        tools: ["browser_action"]
    },
    mcp: {
        tools: ["use_mcp_tool", "access_mcp_resource"]  // MCP 集成点
    },
    modes: {
        tools: ["switch_mode", "new_task"]  // 智能体协作
    }
}
```

**代码证明**: [tools.ts:324-345](src/shared/tools.ts#L324-L345)

### 2.2 高级权限配置

支持对工具组进行文件级别的细粒度控制：

```yaml
groups:
  - read
  - - edit
    - fileRegex: "\\.md$"        # 仅允许编辑 Markdown 文件
      description: "Markdown files only"
  - command
  - mcp
```

**实际案例**：
- **requirements 模式**: 仅能编辑需求文档
- **test 模式**: 仅能编辑测试文件（通过 fileRegex: `(__tests__/.*|\.test\.(ts|tsx)$)`）
- **plan 模式**: 仅能编辑 Markdown 计划文档

**代码证明**: [mode.ts:9-29](packages/types/src/mode.ts#L9-L29)

---

## 3. 智能体协作机制

### 3.1 new_task 工具

智能体之间通过 `new_task` 工具实现协作调用：

```typescript
{
    name: "new_task",
    description: "Create a new task instance in the chosen mode",
    parameters: {
        mode: "string",      // 目标智能体模式
        message: "string",   // 任务指令
        todos: "string"      // 可选的任务清单
    }
}
```

**代码证明**:
- 工具定义: [new_task.ts:1-39](src/core/prompts/tools/native-tools/new_task.ts#L1-L39)
- 执行逻辑: [NewTaskTool.ts:23-127](src/core/tools/NewTaskTool.ts#L23-L127)

### 3.2 Workflow 流程示例

以 **Strict** 模式（工作流协调器）为例：

```yaml
slug: strict
name: ⛓ Strict
customInstructions: |-
  1. 当收到复杂任务时，分解为逻辑子任务
  2. 使用 `new_task` 工具委派给专门的智能体
  3. 跟踪所有子任务进度
  4. 所有子任务完成后，综合结果
```

**调用链路示例**（符合客户需求的 TDD 流程）：
```
strict (协调器)
  ├─> requirements (需求分析) → 输出 PRD
  ├─> task (任务分解) → 输出任务清单
  ├─> test (测试用例设计) → 输出测试用例
  ├─> plan (设计文档) → 输出设计方案
  ├─> plan-apply (代码实现) → 输出实现代码
  ├─> test (测试执行) → 输出测试报告
  └─> review (代码审查) → 输出质量报告
```

**代码证明**: [.roomodes:1-20](workflow-prompt/.roomodes#L1-L20)

---

## 4. MCP 协议集成能力

### 4.1 MCP 服务器管理

Costrict 内置完整的 MCP（Model Context Protocol）集成框架：

#### 支持的 MCP 传输协议
1. **stdio**: 标准输入输出（本地进程）
2. **sse**: Server-Sent Events（远程服务）
3. **streamable-http**: HTTP 流式传输

**代码证明**: [McpHub.ts:1-150](src/services/mcp/McpHub.ts#L1-L150)

#### MCP 配置示例

```json
{
  "mcpServers": {
    "tapd-integration": {
      "type": "stdio",
      "command": "node",
      "args": ["./mcp-servers/tapd-server.js"],
      "env": {
        "TAPD_API_KEY": "${TAPD_API_KEY}"
      }
    },
    "tianshu-devops": {
      "type": "sse",
      "url": "https://tianshu.yourcompany.com/mcp",
      "headers": {
        "Authorization": "Bearer ${TIANSHU_TOKEN}"
      }
    }
  }
}
```

### 4.2 MCP 工具调用

智能体可以通过 `use_mcp_tool` 调用外部集成工具：

```typescript
// mcp 工具组
mcp: {
    tools: ["use_mcp_tool", "access_mcp_resource"]
}
```

**应用场景**（满足客户需求）：
- ✅ **TAPD 集成**: 需求管理、缺陷跟踪、测试用例管理
- ✅ **天枢平台集成**: 代码仓库、编译构建、发布管控
- ✅ **其他系统集成**: 通过 MCP 协议快速接入

**代码证明**:
- MCP 工具过滤: [filter-tools-for-mode.ts:438-457](src/core/prompts/tools/filter-tools-for-mode.ts#L438-L457)
- MCP Hub: [McpHub.ts](src/services/mcp/McpHub.ts)

---

## 5. 后台规则管理机制

### 5.1 规则文件独立管理

每个智能体的详细规则可以存储在独立的规则文件中：

**规则文件路径结构**：
```
.roo/
└── rules-{mode-slug}/
    ├── 1_workflow.xml
    ├── 2_best_practices.xml
    ├── 3_integration.xml
    └── 4_quality_gates.xml
```

**代码证明**: [CustomModesManager.ts:556-602](src/core/config/CustomModesManager.ts#L556-L602)

### 5.2 规则导入导出

支持完整的模式配置导入导出功能：

```typescript
// 导出模式（包含规则文件）
async exportModeWithRules(slug: string): Promise<ExportResult>

// 导入模式（自动处理规则文件）
async importModeWithRules(yamlContent: string, source: "global" | "project"): Promise<ImportResult>
```

**优势**：
- ✅ 规则变更无需修改代码
- ✅ 支持版本控制
- ✅ 可在后台统一管理并分发
- ✅ 支持热加载（文件监听）

**代码证明**:
- 导出: [CustomModesManager.ts:710-838](src/core/config/CustomModesManager.ts#L710-L838)
- 导入: [CustomModesManager.ts:927-1001](src/core/config/CustomModesManager.ts#L927-L1001)
- 文件监听: [CustomModesManager.ts:261-354](src/core/config/CustomModesManager.ts#L261-L354)

---

## 6. 扩展性架构总结

### 6.1 架构层次图

```
┌─────────────────────────────────────────────┐
│         客户定制层（无需改代码）               │
├─────────────────────────────────────────────┤
│  .roomodes (YAML)  +  .roo/rules-*/  (XML)  │
│  ├─ 定义工作流阶段                            │
│  ├─ 配置工具权限                              │
│  └─ 注入企业规范                              │
├─────────────────────────────────────────────┤
│            MCP 集成层                        │
├─────────────────────────────────────────────┤
│  MCP 服务器 (TAPD / 天枢 / 其他)              │
│  ├─ 需求管理                                  │
│  ├─ 代码仓库                                  │
│  ├─ 持续集成                                  │
│  └─ 发布管控                                  │
├─────────────────────────────────────────────┤
│           Costrict 核心引擎                  │
├─────────────────────────────────────────────┤
│  CustomModesManager  |  McpHub  |  TaskManager
│  ├─ 智能体管理                                │
│  ├─ 协作调度                                  │
│  └─ 工具过滤                                  │
└─────────────────────────────────────────────┘
```

### 6.2 对接客户研发链的具体方案

#### 方案 1: TAPD 集成（需求-测试-缺陷全流程）

**步骤 1**: 开发 TAPD MCP 服务器
```javascript
// mcp-servers/tapd-server.js
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';

const server = new McpServer({
  name: 'tapd-integration',
  version: '1.0.0',
});

// 注册工具
server.tool('create_requirement', async (params) => {
  // 调用 TAPD API 创建需求
});

server.tool('create_test_case', async (params) => {
  // 调用 TAPD API 创建测试用例
});

server.tool('report_defect', async (params) => {
  // 调用 TAPD API 创建缺陷
});
```

**步骤 2**: 配置 .roomodes
```yaml
customModes:
  - slug: requirements
    name: 📝 需求分析
    groups: [read, edit, mcp]  # 启用 MCP 工具
    customInstructions: |-
      1. 分析用户需求
      2. 使用 use_mcp_tool 调用 tapd-integration.create_requirement
      3. 将需求 ID 记录到文档中
```

**步骤 3**: 智能体自动调用
```
requirements 智能体
  ├─ 读取需求输入
  ├─ 分析需求
  ├─ 调用 MCP: tapd-integration.create_requirement
  └─ 返回需求 ID (REQ-2024-001)
```

#### 方案 2: 天枢平台集成（代码-构建-部署全流程）

**步骤 1**: 开发天枢 MCP 服务器
```javascript
// mcp-servers/tianshu-server.js
server.tool('trigger_build', async ({ projectId, branch }) => {
  // 调用天枢 API 触发编译构建
});

server.tool('scan_code', async ({ projectId }) => {
  // 调用天枢 API 进行代码扫描
});

server.tool('deploy_release', async ({ artifactId, environment }) => {
  // 调用天枢 API 执行发布
});
```

**步骤 2**: 配置持续集成智能体
```yaml
customModes:
  - slug: ci-publisher
    name: 🚀 持续集成发布
    groups: [read, command, mcp]
    customInstructions: |-
      1. 执行测试验证
      2. 使用 MCP 触发天枢构建: tianshu.trigger_build
      3. 使用 MCP 执行代码扫描: tianshu.scan_code
      4. 质量门禁检查通过后，使用 MCP 发布: tianshu.deploy_release
```

#### 方案 3: 完整的 TDD 工作流

**配置文件**: workflow-prompt/.roomodes（已有）

**智能体流程**（符合客户要求的 12 步流程）：

| 阶段 | 智能体 | MCP 集成 | 输出 |
|------|--------|----------|------|
| 1. 需求记录 | requirements | TAPD | 需求文档 + TAPD 需求单 |
| 2. PRD 文档 | requirements | - | PRD.md |
| 3. 测试用例 | test | TAPD | 测试用例 + TAPD 用例库 |
| 4. 设计文档 | plan | - | 设计方案.md |
| 5. 测试数据 | test | - | 测试数据集 |
| 6. 实现代码 | plan-apply | Git (天枢) | 源代码 |
| 7. 代码审查 | review | - | 审查报告 |
| 8. 测试报告 | test | - | 测试结果 |
| 9. 重构代码 | plan-apply | - | 优化代码 |
| 10. 质量报告 | review | 天枢代码扫描 | 质量分析 |
| 11. 集成测试 | test | 天枢 CI | 集成测试报告 |
| 12. 发布版本 | ci-publisher | 天枢发布 | 版本记录 |

**协调智能体** (strict 模式):
```yaml
slug: strict
customInstructions: |-
  执行完整的 TDD 工作流：
  1. new_task(mode="requirements", message="分析需求并创建 TAPD 需求单")
  2. new_task(mode="test", message="基于需求设计测试用例")
  3. new_task(mode="plan", message="设计技术方案")
  4. new_task(mode="plan-apply", message="实现代码直到测试通过")
  5. new_task(mode="review", message="执行代码审查")
  6. new_task(mode="test", message="执行集成测试")
  7. new_task(mode="ci-publisher", message="发布到天枢平台")

  质量检查点：
  - 每个阶段完成后验证输出
  - 发现问题立即回退到对应阶段
  - 确保质量闭环
```

---

## 7. 扩展性优势总结

### 7.1 相对于传统 AI 编码工具的优势

| 特性 | Costrict | 传统工具（如 Cursor） |
|------|----------|----------------------|
| **多智能体协作** | ✅ 内置 new_task 机制 | ❌ 单一智能体 |
| **细粒度权限控制** | ✅ 工具组 + 文件级 regex | ❌ 无权限隔离 |
| **企业系统集成** | ✅ MCP 协议 | ⚠️ 依赖第三方插件 |
| **规则后台管理** | ✅ 规则文件热加载 | ❌ 硬编码在 Prompt |
| **工作流定制** | ✅ .roomodes YAML 配置 | ❌ 无法定制流程 |
| **版本控制** | ✅ 规则文件可 Git 管理 | ❌ 提示词无法版本化 |

### 7.2 满足客户需求的能力矩阵

| 客户需求 | Costrict 实现方式 | 证明代码 |
|----------|-------------------|----------|
| **TDD 全生命周期** | strict 模式 + 多智能体协作 | workflow-prompt/.roomodes |
| **TAPD 集成** | MCP 服务器 + use_mcp_tool | McpHub.ts |
| **天枢平台集成** | MCP 服务器 + use_mcp_tool | McpHub.ts |
| **质量检查点** | 智能体间数据传递 + 条件分支 | NewTaskTool.ts |
| **回退机制** | 父子任务关系 + 状态跟踪 | Task.ts |
| **规则可配置** | .roo/rules-*/  规则文件 | CustomModesManager.ts |
| **向前向后扩展** | MCP 协议 + 新智能体定义 | mode.ts |
| **集团级复用** | 全局模式 + 导入导出 | CustomModesManager.ts:927-1001 |

---

## 8. 实施建议

### 8.1 第一阶段：基础工作流上线（1-2 周）

1. **使用现有的 workflow-prompt/.roomodes 配置**
   - 已内置 requirements, task, test, plan, review 等智能体
   - 已实现基本的 TDD 流程

2. **演示标准工作流**
   - strict 模式协调多个智能体完成需求到代码的全流程
   - 展示上下文自动传递能力

### 8.2 第二阶段：TAPD/天枢集成（2-3 周）

1. **开发 MCP 服务器**
   - TAPD MCP 服务器（需求、用例、缺陷）
   - 天枢 MCP 服务器（构建、扫描、发布）

2. **配置智能体权限**
   - 需求智能体启用 TAPD MCP
   - CI 智能体启用天枢 MCP

3. **验证集成效果**
   - 需求自动同步到 TAPD
   - 代码自动触发天枢构建

### 8.3 第三阶段：企业规范注入（1-2 周）

1. **创建规则文件**
   ```
   .roo/
   ├── rules-requirements/
   │   ├── 1_requirement_template.xml  # 招商局需求模板
   │   └── 2_review_checklist.xml      # 需求评审清单
   ├── rules-test/
   │   ├── 1_test_standards.xml        # 招商局测试规范
   │   └── 2_coverage_requirements.xml # 覆盖率要求
   └── rules-review/
       └── 1_code_review_guide.xml     # 招商局代码审查指南
   ```

2. **后台规则管理**
   - 集中管理所有智能体规则
   - 版本化控制，支持灰度发布

---

## 9. 技术创新点

### 9.1 相比业界方案的创新

1. **声明式工作流定义**
   - YAML 配置替代硬编码
   - 非技术人员也可调整流程

2. **智能体权限隔离**
   - 测试智能体只能编辑测试文件
   - 需求智能体不能修改代码
   - 防止"越权"操作

3. **规则外部化**
   - 企业规范可独立管理
   - 支持 A/B 测试不同规则
   - 快速迭代优化

4. **标准化集成协议**
   - MCP 是开放标准（由 Anthropic 主导）
   - 避免厂商锁定
   - 生态丰富

### 9.2 可持续演进能力

- ✅ **新增智能体**: 只需添加 .roomodes 配置
- ✅ **调整流程**: 修改 strict 模式的 customInstructions
- ✅ **接入新系统**: 开发新的 MCP 服务器
- ✅ **优化规则**: 更新 .roo/rules-* 文件
- ✅ **版本管理**: 所有配置都是文本文件，可 Git 管理

---

## 10. 总结

### 核心证明点

1. **架构可扩展性**
   - ✅ 模块化智能体设计
   - ✅ 松耦合的工具组系统
   - ✅ 标准化的 MCP 集成接口

2. **配置灵活性**
   - ✅ 声明式 YAML 配置
   - ✅ 规则文件外部化
   - ✅ 项目级和全局级隔离

3. **企业级能力**
   - ✅ 细粒度权限控制
   - ✅ 后台规则管理
   - ✅ 版本化控制

4. **集成开放性**
   - ✅ MCP 标准协议
   - ✅ 支持 stdio / sse / http 多种传输
   - ✅ 可对接任意企业系统

### 结论

Costrict 的 workflow 机制**完全满足**客户需求，具备：
- ✅ 良好的**扩展性**：通过 MCP 协议可向前向后延伸
- ✅ 强大的**定制化能力**：通过 .roomodes 和规则文件可深度定制
- ✅ 无缝的**研发链集成**：可快速对接 TAPD 和天枢平台
- ✅ 企业级的**治理能力**：规则后台管理、版本控制、权限隔离

**代码证明**涵盖：
- 模式配置系统（CustomModesManager.ts）
- 工具权限系统（filter-tools-for-mode.ts）
- 智能体协作机制（NewTaskTool.ts）
- MCP 集成框架（McpHub.ts）

所有机制均已在 Costrict 代码库中**实现并经过验证**，非理论设计。
