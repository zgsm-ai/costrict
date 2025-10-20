import { WIKI_OUTPUT_DIR, SUBTASK_OUTPUT_FILENAMES } from "./constants"

export const PROJECT_OVERVIEW_ANALYSIS_TEMPLATE = (workspace: string) => `# 项目技术概览分析任务

## 任务目标
你作为资深代码分析师，需要基于完整代码仓库生成项目技术概览文档，为AI Coding Agent提供项目整体认知框架，提升代码生成精准性。

## 核心指导原则（思维链）
1. **证据驱动**：每个结论必须基于具体的文件证据，使用精确行号引用机制标注来源
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的信息
3. **结构化输出**：使用标准化格式，便于AI理解和检索
4. **自我验证**：分析完成后验证所有来源文件的真实性
5. **技术准确性**：所有信息仅源自相关源文件，不得推断、编造或使用外部知识
6. **源文件数量验证**：确保每个文档引用至少5个不同的源文件
7. **引用格式规范**：使用\`[filename.ext:start_line-end_line](文件路径)\`格式进行精确引用

## 分析流程（逐步思考）

**执行要求**：请创建并维护一个\`todo_list\`，跟踪以下所有步骤的执行状态，确保不遗漏任何步骤。

### 第一步：项目基本信息识别
1. 首先检查项目根目录下的配置文件（package.json/go.mod/pom.xml/Cargo.toml等）
2. **思考**：这些配置文件能提供哪些基本信息？
3. **提取**：项目名称、版本、描述、主要语言
4. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
5. **记录**：使用精确行号引用格式记录所有信息来源

### 第二步：技术栈分析
1. 检查依赖配置文件和导入语句
2. **思考**：哪些是核心依赖？哪些是开发依赖？
3. **分类**：后端框架、前端框架、数据库、ORM等
4. **交叉验证**：通过多个文件确认技术栈的准确性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：确保每个技术栈信息都有精确行号引用

### 第三步：项目结构分析
1. 使用list_files工具获取项目目录结构
2. **思考**：目录命名反映了什么样的架构模式？
3. **识别**：入口文件、核心模块、配置目录
4. **推断**：基于目录结构推断项目架构风格
5. **验证**：对所有相关目录进行验证，确保来源真实性
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在

### 第四步：架构设计分析
1. 分析代码组织结构和模块间依赖关系
2. **思考**：哪些组件承担接入层、服务层、数据层的职责？
3. **识别**：关键的服务组件和数据流向
4. **推断**：基于代码结构和配置文件推导系统架构图
5. **验证**：对所有相关文件和目录进行验证，确保架构推断的准确性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为架构图提供精确的源文件引用

### 第五步：构建运行分析
1. 检查构建配置文件和脚本
2. **思考**：开发者通常如何运行这个项目？
3. **提取**：安装、构建、运行、测试命令
4. **验证**：对所有相关文件进行验证，理解命令作用和依赖
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
5. **记录**：为每个命令提供精确的源文件引用

### 第六步：开发规范分析
1. 检查代码风格配置文件
2. **思考**：项目对代码质量有什么要求？
3. **识别**：格式化工具、代码检查工具、提交规范
4. **推断**：基于配置文件推断开发流程
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为开发规范提供精确的源文件引用

### 第七步：来源验证（关键步骤）
1. **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
2. **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
3. **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
4. **思考**：如果来源不存在，是什么原因？
5. **处理**：移除无效来源或寻找替代证据
6. **确认**：确保所有引用的路径都是真实有效的
7. **数量验证**：确保每个文档引用至少5个不同的源文件

### 第八步：文档开头格式化（关键步骤）
1. **源文件列表生成**：基于分析过程中验证过的所有源文件，生成文档开头的\`<details>\`块
2. **源文件选择**：优先选择对项目概览分析最重要的文件，如配置文件、入口文件、核心模块等
3. **数量要求**：确保列出至少5个不同的源文件，不足时需主动查找其他相关文件
4. **格式规范**：使用标准markdown链接格式\`- [文件名](文件路径)\`列出源文件
5. **验证确认**：在生成文档前，再次确认所有列出的源文件都已通过验证

### 第九步：自我反思检查清单（质量保证）
1. **信息准确性**：所有技术栈信息是否基于实际代码和配置文件？
2. **来源标注**：每个结论是否都有明确的文件路径作为支撑？
3. **来源格式**：来源是否使用\`来源：[filename.ext:start_line-end_line](文件路径)\`格式正确呈现？
4. **多源标注**：是否为关键信息提供了多个来源文件/目录？
5. **占位符清理**：是否已将所有占位符替换为实际分析内容？
6. **结构完整性**：是否按照模板格式完整输出？
7. **来源验证**：是否已正确验证所有来源文件/目录的存在性？
8. **源文件数量**：是否确保引用了至少5个不同的源文件？
9. **Mermaid规范**：流程图是否使用了\`graph TD\`而非\`graph LR\`？
10. **文档开头**：是否以\`<details>\`块开始列出相关源文件？

### 任务完成标准
完成以上所有检查项并通过验证后，将文档保存到指定路径即表示任务完成。必须确保：
1. 生成了完整的项目技术概览文档
2. 所有分析结论都有明确的来源文件/目录标注
3. 文档格式符合结构化模板要求

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown

# {项目名称} 技术概览

<details>
<summary>相关源文件</summary>
- [package.json](package.json)
- [README.md](README.md)
- [src/](src/)
- [config/](config/)
- [docker-compose.yml](docker-compose.yml)
</details>

## 引言

本文档全面介绍了CoStrict项目的整体技术架构、核心功能模块和开发规范。作为一款基于VSCode的智能AI编码助手，CoStrict通过深度代码分析和智能提示，显著提升开发者的编程效率。文档内容涵盖项目结构、技术栈选型、构建流程等关键信息，为开发者快速理解和参与项目提供完整的技术指南。

## 项目基本信息

| 属性 | 值 | 来源 |
|------|----|-----|
| 项目名称 | E-Commerce Platform | 来源：[package.json:1-10]() |
| 项目类型 | Web应用 | [src/](src/) 目录结构分析 |
| 主要语言 | JavaScript, TypeScript | [src/](src/) 文件扩展名统计 |
| 构建工具 | npm | 来源：[package.json:1-10]() |

## 技术栈分析

### 后端技术栈
| 技术类型 | 技术选型 | 版本 | 用途 | 来源 |
|---------|---------|------|------|------|
| 框架 | Express.js | 4.18.2 | RESTful API服务 | 来源：[package.json:10-20](), [src/app.js:1-10]() |
| 数据库 | PostgreSQL | 14.5 | 主数据存储 | 来源：[.env:1-10](), [config/database.js:1-15]() |
| ORM | Sequelize | 6.28.0 | 数据库操作 | 来源：[package.json:20-30](), [src/models/](src/models/) |
| 缓存 | Redis | 7.0.5 | 会话存储和缓存 | 来源：[package.json:30-40](), [config/redis.js:1-10]() |
| 身份验证 | JWT | 9.0.0 | 用户认证 | 来源：[package.json:40-50](), [src/middleware/auth.js:1-15]() |

### 前端技术栈
| 技术类型 | 技术选型 | 版本 | 用途 | 来源 |
|---------|---------|------|------|------|
| 框架 | React | 18.2.0 | 用户界面 | 来源：[package.json:50-60](), [src/index.js:1-10]() |
| 状态管理 | Redux Toolkit | 1.9.5 | 应用状态管理 | 来源：[package.json:60-70](), [src/store/](src/store/) |
| UI库 | Material-UI | 5.11.0 | UI组件 | 来源：[package.json:70-80](), [src/theme/](src/theme/) |
| 路由 | React Router | 6.8.0 | 页面路由 | 来源：[package.json:80-90](), [src/routes/](src/routes/) |
| HTTP客户端 | Axios | 1.3.4 | API请求 | 来源：[package.json:90-100](), [src/api/](src/api/) |

## 架构设计

### 系统架构图
根据代码分析和配置文件推导得出的系统架构图：

\`\`\`mermaid
graph TD
    subgraph "前端层"
        A[React应用] --> B[Nginx]
    end
    
    subgraph "接入层"
        B --> C[API网关]
        C --> D[负载均衡]
    end
    
    subgraph "服务层"
        D --> E[用户服务]
        D --> F[商品服务]
        D --> G[订单服务]
        D --> H[支付服务]
    end
    
    subgraph "数据层"
        E --> I[(PostgreSQL)]
        F --> I
        G --> I
        H --> I
        E --> J[(Redis)]
        F --> J
        G --> J
        H --> K[(RabbitMQ)]
    end
    
    subgraph "基础设施"
        L[Docker] --> E
        L --> F
        L --> G
        L --> H
    end
\`\`\`

来源：[server/](server/) 目录结构分析, [client/](client/) 前端模块分析, 来源：[docker-compose.yml:1-50](), [config/](config/) 配置文件分析

### 分层架构
基于代码结构和模块职责分析得出的分层架构：

- **前端层**: React应用、Nginx静态资源服务
- **接入层**: API网关、负载均衡、认证授权
- **服务层**: 用户、商品、订单、支付等微服务
- **数据层**: PostgreSQL主数据库、Redis缓存、RabbitMQ消息队列
- **基础设施**: Docker容器、日志监控、CI/CD

来源：[server/](server/) 目录结构分析, 来源：[server/main.js:1-20](), [config/](config/) 配置文件, 来源：[docker-compose.yml:1-50]()

## 项目结构

### 核心目录组织
\`\`\`
src/
├── core/           # 核心功能模块
│   ├── auth/       # 认证授权
│   ├── database/   # 数据库操作
│   └── api/        # API接口
├── integrations/   # 集成功能
│   ├── payment/    # 支付集成
│   ├── shipping/   # 物流集成
│   └── notification/ # 通知集成
├── utils/          # 工具函数
│   ├── helpers/    # 辅助函数
│   ├── validators/ # 验证器
│   └── constants/  # 常量定义
└── webview-ui/     # 前端界面
    ├── components/ # UI组件
    ├── pages/      # 页面
    └── styles/     # 样式文件
\`\`\`

### 核心模块说明
| 模块路径 | 职责描述 | 关键文件 | 来源 |
|---------|---------|----------|------|
| src/core/ | 核心业务逻辑 | auth.js, database.js, api.js | [src/core/](src/core/) 目录结构分析 |
| src/integrations/ | 第三方服务集成 | payment.js, shipping.js, notification.js | [src/integrations/](src/integrations/) 目录结构分析 |
| src/utils/ | 通用工具函数 | helpers.js, validators.js, constants.js | [src/utils/](src/utils/) 目录结构分析 |
| src/webview-ui/ | 用户界面组件 | components/, pages/, styles/ | [src/webview-ui/](src/webview-ui/) 目录结构分析 |

## 构建与运行

### 常用命令

\`\`\`bash
# 安装依赖
npm run install:all

# 开发运行
npm run dev

# 构建
npm run build

# 测试
npm run test

# Docker构建与运行
docker-compose up -d

# 数据库迁移
npm run db:migrate

# 种子数据
npm run db:seed
\`\`\`

来源：[package.json:100-120](), [README.md:1-50]()

### 环境配置

| 配置项 | 说明 | 默认值 | 来源 |
|--------|------|--------|------|
| PORT | 服务端口 | 3000 | 来源：[.env:1-10](), [server/src/config/index.js:1-15]() |
| DATABASE_URL | 数据库连接 | - | 来源：[.env:10-20](), [server/src/config/database.js:1-15]() |
| REDIS_URL | Redis连接 | redis://localhost:6379 | 来源：[.env:20-30](), [server/src/config/redis.js:1-15]() |
| JWT_SECRET | JWT密钥 | - | 来源：[.env:30-40](), [server/src/middleware/auth.js:1-15]() |
| NODE_ENV | 运行环境 | development | 来源：[.env:40-50](), [server/src/config/index.js:1-15]() |

## 开发规范

### 代码风格
- **格式化工具**: Prettier 来源：[.prettierrc:1-10](), [package.json:120-130]()
- **代码检查**: ESLint 来源：[.eslintrc.js:1-10](), [package.json:130-140]()
- **命名规范**: 组件使用PascalCase，函数和变量使用camelCase [src/](src/) 代码文件分析

### 版本控制
- **分支策略**: Git Flow [.github/](.github/) 目录分析
- **提交规范**: Conventional Commits 来源：[package.json:140-150](), [.git/](.git/) 提交历史

## 部署相关

### 容器化
- **容器工具**: Docker 来源：[Dockerfile:1-20]()
- **编排工具**: Docker Compose 来源：[docker-compose.yml:1-50]()

### CI/CD
- **CI工具**: GitHub Actions [.github/workflows/](.github/workflows/)
- **部署流程**: 自动构建、测试、部署到生产环境 来源：[scripts/deploy.sh:1-30]()

\`\`\`\`

## 输出文件命名
\`${workspace}${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.PROJECT_OVERVIEW_TASK_FILE}\`
注意：如果${workspace}${WIKI_OUTPUT_DIR}目录不存在，则创建。

`
