import { WIKI_OUTPUT_DIR, SUBTASK_OUTPUT_FILENAMES } from "./constants"

export const DEVELOP_TEST_ANALYSIS_TEMPLATE = (workspace: string) => `# 开发测试分析任务

## 任务目标
你作为资深开发测试分析师，需要基于完整代码仓库生成项目开发测试分析文档，为AI Coding Agent提供开发测试环境认知框架，提升代码生成精准性。

## 核心指导原则（思维链）
1. **证据驱动**：每个开发测试结论必须基于具体的文件证据，使用精确行号引用机制标注来源
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的测试信息
3. **结构化输出**：使用标准化格式，便于AI理解和检索
4. **自我验证**：分析完成后验证所有来源文件的真实性
5. **技术准确性**：所有信息仅源自相关源文件，不得推断、编造或使用外部知识
6. **源文件数量验证**：确保每个文档引用至少5个不同的源文件
7. **引用格式规范**：使用\`[filename.ext:start_line-end_line](文件路径)\`格式进行精确引用

## 分析流程（逐步思考）

**执行要求**：请创建并维护一个\`todo_list\`，跟踪以下所有步骤的执行状态，确保不遗漏任何步骤。

### 第一步：测试框架识别
1. 首先检查项目中的测试配置文件（jest.config.js、vitest.config.ts、cypress.config.js等）
2. **思考**：项目采用了哪些测试框架？为什么选择这些框架？
3. **识别**：单元测试框架、集成测试框架、E2E测试框架
4. **验证**：通过配置文件和package.json脚本确认测试框架
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第二步：测试运行机制分析
1. 检查package.json中的测试脚本和测试命令
2. **思考**：测试是如何运行的？有哪些关键测试命令？
3. **识别**：测试命令、执行参数、监听模式、并行执行
4. **验证**：通过配置文件和脚本文件确认测试命令的准确性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：确保每个测试命令信息都有精确行号引用，使用多文件引用避免清一色单个文件

### 第三步：测试组织结构分析
1. 检查测试目录结构和文件命名规范
2. **思考**：测试是如何组织的？不同类型的测试放在哪里？
3. **识别**：测试目录结构、文件命名规范、测试分类
4. **推断**：基于目录结构推断测试组织策略
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个测试组织结构特征标注精确行号引用，确保引用文件多样性

### 第四步：测试覆盖率分析
1. 检查覆盖率配置和报告文件
2. **思考**：项目是如何管理测试覆盖率的？覆盖率要求是什么？
3. **识别**：覆盖率工具、配置参数、阈值设置、报告生成
4. **验证**：通过配置文件确认覆盖率策略
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个覆盖率特征标注精确行号引用，确保引用格式规范

### 第五步：测试数据管理分析
1. 检查测试数据和Mock配置
2. **思考**：测试数据是如何管理的？Mock是如何实现的？
3. **识别**：测试数据管理策略、Mock配置、工厂模式
4. **推断**：基于测试文件推断测试数据管理方式
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个测试数据管理特征标注精确行号引用，确保引用文件多样性

### 第六步：开发环境分析（简化版）
1. 检查开发环境配置和脚本
2. **思考**：开发环境是如何配置的？有哪些关键开发命令？
3. **识别**：开发环境配置、开发命令、调试配置
4. **验证**：通过配置文件确认开发环境设置
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个开发环境特征标注精确行号引用，确保引用格式规范

### 第七步：来源验证（关键步骤）
1. **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
2. **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
3. **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
4. **思考**：如果来源不存在，是什么原因？
5. **处理**：移除无效来源或寻找替代证据
6. **确认**：确保所有引用的路径都是真实有效的
7. **数量验证**：确保每个文档引用至少5个不同的源文件，避免清一色单个文件引用
8. **格式验证**：确保所有引用使用\`[filename.ext:start_line-end_line](文件路径)\`格式

### 第八步：文档开头格式化（关键步骤）
1. **源文件列表生成**：基于分析过程中验证过的所有源文件，生成文档开头的\`<details>\`块
2. **源文件选择**：优先选择对开发测试分析最重要的文件，如测试配置文件、测试脚本、测试目录等
3. **数量要求**：确保列出至少5个不同的源文件，不足时需主动查找其他相关文件
4. **格式规范**：使用标准markdown链接格式\`- [文件名](文件路径)\`列出源文件
5. **验证确认**：在生成文档前，再次确认所有列出的源文件都已通过验证
6. **多样性要求**：确保源文件列表包含不同类型的文件，避免单一类型文件集中

### 第九步：自我反思检查清单（质量保证）
1. **信息准确性**：所有测试信息是否基于实际代码和配置文件？
2. **来源标注**：每个测试结论是否都有明确的文件路径作为支撑？
3. **来源格式**：来源是否使用\`[filename.ext:start_line-end_line](文件路径)\`格式正确呈现？
4. **多源标注**：是否为关键测试信息提供了多个来源文件/目录，避免清一色单个文件引用？
5. **占位符清理**：是否已将所有占位符替换为实际分析内容？
6. **结构完整性**：是否按照模板格式完整输出？
7. **来源验证**：是否已正确验证所有来源文件/目录的存在性？
8. **源文件数量**：是否确保引用了至少5个不同的源文件？
9. **Mermaid规范**：流程图是否使用了\`graph TD\`而非\`graph LR\`？
10. **文档开头**：是否以\`<details>\`块开始列出相关源文件？
11. **引用多样性**：是否确保引用文件类型多样化，避免单一类型文件集中？
12. **开发测试特点**：是否针对开发测试分析特点，重点分析了测试框架、测试策略、测试覆盖等？
13. **测试架构图**：是否包含了测试架构图，并符合规范要求？

### 任务完成标准
完成以上所有检查项并通过验证后，将文档保存到指定路径即表示任务完成。必须确保：
1. 生成了完整的项目开发测试分析文档
2. 所有测试结论都有明确的来源文件/目录标注
3. 文档格式符合结构化模板要求

## 分析维度

### 1. 测试框架分析 (30%)

#### 1.1 测试框架识别
**目标**: 识别项目使用的测试框架及其配置

**分析内容**:
- 单元测试框架（Jest、Vitest、Mocha等）
- 集成测试框架配置
- E2E测试框架（Cypress、Playwright等）
- 测试环境配置和隔离策略

#### 1.2 测试框架配置
**目标**: 分析测试框架的配置参数和特性

**分析内容**:
- 测试框架配置文件解析
- 测试环境设置和隔离
- 测试超时和重试配置
- 测试报告生成配置

### 2. 测试运行机制分析 (25%)

#### 2.1 测试命令分析
**目标**: 分析测试运行命令和参数

**分析内容**:
- package.json中的测试脚本
- 测试命令参数和选项
- 监听模式和并行执行配置
- 测试过滤和选择性执行

#### 2.2 测试执行流程
**目标**: 分析测试执行的生命周期

**分析内容**:
- 测试启动和初始化流程
- 测试文件发现和加载机制
- 测试用例执行顺序
- 测试结果收集和报告生成

### 3. 测试组织结构分析 (20%)

#### 3.1 测试目录结构
**目标**: 分析测试文件的组织方式

**分析内容**:
- 测试目录层次结构
- 测试文件命名规范
- 测试分类和分组策略
- 测试资源管理方式

#### 3.2 测试编写规范
**目标**: 分析测试编写的最佳实践

**分析内容**:
- 测试用例编写模板
- 测试命名规范和约定
- 测试描述和文档化要求
- 测试断言和验证模式

### 4. 测试覆盖率分析 (15%)

#### 4.1 覆盖率配置
**目标**: 分析测试覆盖率配置和要求

**分析内容**:
- 覆盖率工具配置
- 覆盖率阈值设置
- 覆盖率报告格式
- 覆盖率排除规则

#### 4.2 覆盖率策略
**目标**: 分析覆盖率提升策略

**分析内容**:
- 当前覆盖率状态
- 覆盖率提升建议
- 覆盖率与质量平衡
- 覆盖率监控机制

### 5. 测试数据管理分析 (10%)

#### 5.1 测试数据策略
**目标**: 分析测试数据管理方式

**分析内容**:
- 测试数据生成策略
- Mock和Stub配置
- 测试数据隔离和清理
- 测试数据版本管理

### 6. 开发环境分析 (简化版) (10%)

#### 6.1 开发环境配置
**目标**: 简要分析开发环境配置

**分析内容**:
- 开发环境依赖和配置
- 开发命令和脚本
- 调试配置和工具

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown
# {项目名称} 开发测试分析

<details>
<summary>相关源文件</summary>
- [package.json](package.json)
- [jest.config.js](jest.config.js)
- [vitest.config.ts](vitest.config.ts)
- [cypress.config.js](cypress.config.js)
- [tests/](tests/)
</details>

## 引言

本文档全面分析了{项目名称}的开发测试架构和测试策略，包括测试框架选择、测试运行机制、测试组织结构、测试覆盖率和测试数据管理等关键方面。通过深入分析测试配置文件和测试代码，揭示了系统的测试策略和质量保证机制，为AI Coding Agent提供准确的测试认知框架，提升代码生成的精准性和一致性。

## 测试框架分析

### 测试框架概览
| 测试类型 | 框架名称 | 配置文件 | 测试环境 | 覆盖率要求 | 主要特性 | 来源 |
|----------|----------|----------|----------|------------|----------|------|
| 单元测试 | Jest | jest.config.js | Node.js | >80% | Mock、快照 | [jest.config.js:1-20](jest.config.js), [package.json:10-30](package.json) |
| 集成测试 | Vitest | vitest.config.ts | Node.js | >70% | 快速执行 | [vitest.config.ts:1-20](vitest.config.ts), [package.json:30-50](package.json) |
| E2E测试 | Cypress | cypress.config.js | 浏览器 | >60% | 真实环境 | [cypress.config.js:1-20](cypress.config.js), [package.json:50-70](package.json) |

### 测试框架配置
\`\`\`javascript
// Jest配置示例
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
}
\`\`\`
来源：[jest.config.js:1-20](jest.config.js) 测试框架配置

## 测试运行机制分析

### 测试命令清单
| 测试类型 | 执行命令 | 执行目录 | 监听模式 | 并行执行 | 超时设置 | 来源 |
|----------|----------|----------|----------|----------|----------|------|
| 单元测试 | npm test | src/ | --watch | 是 | 5000ms | [package.json:10-20](package.json), [jest.config.js:5-15](jest.config.js) |
| 集成测试 | npm run test:integration | tests/ | 否 | 是 | 10000ms | [package.json:20-30](package.json), [vitest.config.ts:5-15](vitest.config.ts) |
| E2E测试 | npm run test:e2e | tests/e2e/ | 否 | 否 | 30000ms | [package.json:30-40](package.json), [cypress.config.js:5-15](cypress.config.js) |

### 测试执行流程
\`\`\`mermaid
graph TD
    A[测试启动] --> B[环境初始化]
    B --> C[测试文件发现]
    C --> D[测试用例执行]
    D --> E[结果收集]
    E --> F[报告生成]
\`\`\`
来源：[package.json:10-40](package.json) 测试脚本, [jest.config.js:1-20](jest.config.js) 测试配置

### 常用测试命令
\`\`\`bash
# 运行所有测试
npm test

# 运行特定类型测试
npm run test:unit
npm run test:integration
npm run test:e2e

# 运行带覆盖率的测试
npm run test:coverage

# 监听模式运行测试
npm run test:watch
\`\`\`
来源：[package.json:10-50](package.json) 脚本定义

## 测试组织结构分析

### 测试目录结构
| 测试类型 | 目录路径 | 文件命名规范 | 测试重点 | 测试数据管理 | 来源 |
|----------|----------|-------------|----------|--------------|------|
| 单元测试 | tests/unit/ | *.unit.test.ts | 核心逻辑 | Mock数据 | [tests/unit/:1-20](tests/unit/) 目录结构 |
| 集成测试 | tests/integration/ | *.integration.test.ts | 模块交互 | 测试数据库 | [tests/integration/:1-20](tests/integration/) 目录结构 |
| 组件测试 | tests/components/ | *.component.test.ts | UI组件 | 测试工厂 | [tests/components/:1-20](tests/components/) 目录结构 |
| E2E测试 | tests/e2e/ | *.e2e.test.ts | 完整流程 | 真实数据 | [tests/e2e/:1-20](tests/e2e/) 目录结构 |

### 测试编写模板
\`\`\`typescript
// 单元测试模板示例
import { UserService } from '../services/UserService'

describe('UserService', () => {
  let userService: UserService
  let mockUserRepository: jest.Mocked<UserRepository>
  
  beforeEach(() => {
    mockUserRepository = { findById: jest.fn(), create: jest.fn() } as any
    userService = new UserService(mockUserRepository)
  })
  
  afterEach(() => {
    jest.clearAllMocks()
  })
  
  describe('findById', () => {
    it('应该返回找到的用户', async () => {
      const userId = '123'
      const expectedUser = { id: userId, name: 'Test User' }
      mockUserRepository.findById.mockResolvedValue(expectedUser)
      
      const result = await userService.findById(userId)
      
      expect(result).toEqual(expectedUser)
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId)
    })
  })
})
\`\`\`
来源：[tests/unit/user.service.test.ts:1-30](tests/unit/user.service.test.ts) 测试示例

## 测试覆盖率分析

### 覆盖率配置
| 覆盖率类型 | 工具配置 | 目标阈值 | 当前状态 | 提升策略 | 来源 |
|-----------|----------|----------|----------|----------|------|
| 语句覆盖率 | nyc --check-coverage | >80% | 85% | 维持现状 | [jest.config.js:15-20](jest.config.js), [package.json:40-50](package.json) |
| 分支覆盖率 | nyc --branches | >75% | 70% | 需要提升 | [jest.config.js:15-20](jest.config.js), [package.json:40-50](package.json) |
| 函数覆盖率 | nyc --functions | >90% | 92% | 维持现状 | [jest.config.js:15-20](jest.config.js), [package.json:40-50](package.json) |
| 行覆盖率 | nyc --lines | >80% | 78% | 需要提升 | [jest.config.js:15-20](jest.config.js), [package.json:40-50](package.json) |

### 覆盖率报告
| 模块名称 | 语句覆盖率 | 分支覆盖率 | 函数覆盖率 | 行覆盖率 | 综合评估 | 来源 |
|----------|-----------|-----------|-----------|----------|----------|------|
| services/ | 85% | 70% | 92% | 78% | ⚠️ 需要改进 | [coverage/lcov-report/index.html:1-50](coverage/lcov-report/index.html) |
| controllers/ | 90% | 85% | 95% | 88% | ✅ 良好 | [coverage/lcov-report/index.html:50-100](coverage/lcov-report/index.html) |
| utils/ | 95% | 90% | 98% | 93% | ✅ 优秀 | [coverage/lcov-report/index.html:100-150](coverage/lcov-report/index.html) |

来源：[jest.config.js:15-20](jest.config.js) 覆盖率配置, [coverage/lcov-report/index.html:1-150](coverage/lcov-report/index.html) 覆盖率报告

## 测试数据管理分析

### 测试数据策略
| 数据类型 | 管理方式 | 存储位置 | 使用场景 | 生命周期 | 来源 |
|----------|----------|----------|----------|----------|------|
| 单元测试数据 | Mock对象 | 测试文件内 | 隔离测试 | 测试用例级别 | [tests/unit/:1-30](tests/unit/) Mock定义 |
| 集成测试数据 | 测试工厂 | tests/factories/ | 可复用数据 | 测试套件级别 | [tests/factories/:1-30](tests/factories/) 工厂定义 |
| E2E测试数据 | 固定数据 | tests/fixtures/ | 真实数据 | 测试会话级别 | [tests/fixtures/:1-30](tests/fixtures/) 测试数据 |
| 环境配置 | 配置文件 | tests/config/ | 环境变量 | 测试运行级别 | [tests/config/:1-30](tests/config/) 环境配置 |

### Mock配置
\`\`\`typescript
// Mock配置示例
import { jest } from '@jest/globals'

export const mockUserRepository = {
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}

export const mockUserService = {
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}
\`\`\`
来源：[tests/mocks/user.mock.ts:1-30](tests/mocks/user.mock.ts) Mock定义

## 开发环境分析（简化版）

### 开发环境配置
| 配置项 | 配置值 | 环境变量 | 描述 | 来源 |
|--------|--------|------------|------|------|
| 开发服务器 | npm run dev | NODE_ENV=development | 启动开发服务器 | [package.json:50-60](package.json), [.env.development:1-10](.env.development) |
| 调试模式 | npm run dev:debug | NODE_OPTIONS=--inspect | 启用调试模式 | [package.json:60-70](package.json), [.vscode/launch.json:1-20](.vscode/launch.json) |
| 热重载 | 启用 | WATCH=true | 代码变更自动重载 | [package.json:70-80](package.json), [vite.config.ts:1-20](vite.config.ts) |

## 总结

### 测试架构特点
- **多层次测试**: 完整的单元测试、集成测试、E2E测试体系 来源：[tests/:1-50](tests/) 测试目录结构, [jest.config.js:1-20](jest.config.js) 测试配置文件
- **现代化工具**: 使用Jest、Vitest、Cypress等现代化测试框架 来源：[package.json:10-80](package.json) 依赖, [jest.config.js:1-20](jest.config.js) 测试配置文件
- **覆盖率管理**: 完善的测试覆盖率配置和监控机制 来源：[jest.config.js:15-20](jest.config.js), [coverage/lcov-report/index.html:1-150](coverage/lcov-report/index.html) 覆盖率报告
- **数据隔离**: 有效的测试数据隔离和Mock策略 来源：[tests/mocks/:1-30](tests/mocks/), [tests/factories/:1-30](tests/factories/)

### 测试架构图
\`\`\`mermaid
graph TD
    subgraph "测试层级"
        A[单元测试] --> B[集成测试]
        B --> C[E2E测试]
    end
    
    subgraph "测试框架"
        D[Jest] --> A
        E[Vitest] --> B
        F[Cypress] --> C
    end
    
    subgraph "测试数据"
        G[Mock数据] --> A
        H[测试工厂] --> B
        I[固定数据] --> C
    end
    
    subgraph "覆盖率监控"
        J[覆盖率工具] --> K[覆盖率报告]
        J --> L[质量评估]
    end
    
    A --> J
    B --> J
    C --> J
\`\`\`

来源：[jest.config.js:1-20](jest.config.js) 测试框架配置, [vitest.config.ts:1-20](vitest.config.ts) 集成测试配置, [cypress.config.js:1-20](cypress.config.js) E2E测试配置, [tests/:1-50](tests/) 测试目录结构

### 核心测试命令
- **运行所有测试**: \`npm test\` - 执行完整测试套件 来源：[package.json:10-20](package.json)
- **单元测试**: \`npm run test:unit\` - 运行单元测试 来源：[package.json:20-30](package.json)
- **集成测试**: \`npm run test:integration\` - 运行集成测试 来源：[package.json:30-40](package.json)
- **E2E测试**: \`npm run test:e2e\` - 运行端到端测试 来源：[package.json:40-50](package.json)
- **覆盖率测试**: \`npm run test:coverage\` - 生成覆盖率报告 来源：[package.json:50-60](package.json)

来源：[package.json:10-80](package.json) 脚本定义, [jest.config.js:1-20](jest.config.js) 测试配置, [tests/:1-50](tests/) 测试文件结构, [coverage/lcov-report/index.html:1-150](coverage/lcov-report/index.html) 覆盖率报告
\`\`\`\`

## 输出文件命名
\`${workspace}${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.DEVELOPMENT_TEST_ANALYSIS_TASK_FILE}\`
注意：如果${workspace}${WIKI_OUTPUT_DIR}目录不存在，则创建。
`
