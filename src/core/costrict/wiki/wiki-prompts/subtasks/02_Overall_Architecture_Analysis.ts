import { WIKI_OUTPUT_DIR, SUBTASK_OUTPUT_FILENAMES } from "./constants"

export const OVERALL_ARCHITECTURE_ANALYSIS_TEMPLATE = (workspace: string) => `# 整体架构分析任务

## 任务目标
你作为资深架构分析师，需要基于完整代码仓库生成项目整体架构文档，为AI Coding Agent提供系统架构认知框架，提升代码生成精准性。

## 核心指导原则（思维链）
1. **证据驱动**：每个架构结论必须基于具体的文件证据，使用精确行号引用机制标注来源
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的架构信息
3. **结构化输出**：使用标准化格式，便于AI理解和检索
4. **自我验证**：分析完成后验证所有来源文件的真实性
5. **技术准确性**：所有信息仅源自相关源文件，不得推断、编造或使用外部知识
6. **源文件数量验证**：确保每个文档引用至少5个不同的源文件
7. **引用格式规范**：使用\`[filename.ext:start_line-end_line](文件路径)\`格式进行精确引用

## 分析流程（逐步思考）

**执行要求**：请创建并维护一个\`todo_list\`，跟踪以下所有步骤的执行状态，确保不遗漏任何步骤。

### 第一步：架构模式识别
1. 首先检查项目目录结构和配置文件
2. **思考**：目录结构反映了什么样的架构模式？
3. **识别**：单体、微服务、分层、事件驱动等架构风格
4. **验证**：通过配置文件、部署文件等验证架构推断
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源

### 第二步：服务架构分析
1. 检查服务入口文件和配置
2. **思考**：系统被拆分为哪些服务？每个服务的职责是什么？
3. **识别**：服务边界、服务通信、服务治理机制
4. **交叉验证**：通过多个文件确认服务架构的准确性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：确保每个服务架构信息都有精确行号引用

### 第三步：数据架构分析
1. 检查数据库配置和数据模型文件
2. **思考**：数据是如何存储和流动的？
3. **识别**：数据存储策略、数据流设计、缓存机制
4. **推断**：基于代码结构和配置文件推导数据流图
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为数据架构图提供精确的源文件引用

### 第四步：技术架构分析
1. 检查依赖配置和代码实现
2. **思考**：项目采用了哪些技术栈和设计模式？
3. **识别**：技术选型、架构模式、设计原则
4. **验证**：通过多个文件确认技术架构的准确性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：确保每个技术架构信息都有精确行号引用

### 第五步：部署架构分析
1. 检查部署配置文件和脚本
2. **思考**：系统是如何部署和运行的？
3. **识别**：容器化策略、编排工具、环境配置
4. **推断**：基于部署文件推导部署架构图
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为部署架构图提供精确的源文件引用

### 第六步：安全架构分析
1. 检查安全配置和认证相关代码
2. **思考**：系统是如何保障安全的？
3. **识别**：认证机制、授权策略、安全防护
4. **验证**：通过多个文件确认安全架构的准确性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为安全架构信息提供精确的源文件引用

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
2. **源文件选择**：优先选择对架构分析最重要的文件，如配置文件、服务入口文件、核心模块等
3. **数量要求**：确保列出至少5个不同的源文件，不足时需主动查找其他相关文件
4. **格式规范**：使用标准markdown链接格式\`- [文件名](文件路径)\`列出源文件
5. **验证确认**：在生成文档前，再次确认所有列出的源文件都已通过验证

### 第九步：自我反思检查清单（质量保证）
1. **信息准确性**：所有架构信息是否基于实际代码和配置文件？
2. **来源标注**：每个架构结论是否都有明确的文件路径作为支撑？
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
1. 生成了完整的项目整体架构分析文档
2. 所有架构结论都有明确的来源文件/目录标注
3. 文档格式符合结构化模板要求

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown
# CoStrict 整体架构分析

<details>
<summary>相关源文件</summary>
- [package.json](package.json)
- [README.md](README.md)
- [src/extension.ts](src/extension.ts)
- [src/core/analyzer/index.ts](src/core/analyzer/index.ts)
- [config/project.json](config/project.json)
</details>

## 引言

本文档全面分析了CoStrict项目的整体架构设计，包括系统架构模式、服务拆分策略、数据流设计、技术选型和部署架构等关键方面。通过深入分析代码结构和配置文件，揭示了系统的设计思路和实现原理，为AI Coding Agent提供准确的架构认知框架，提升代码生成的精准性和一致性。

## 架构概览

### 系统定位
- **项目类型**: VSCode插件 来源：[package.json:1-10](package.json)
- **业务领域**: AI代码辅助开发 来源：[README.md:1-20](README.md)
- **用户规模**: 企业级开发者 来源：[config/app.yml:1-10](config/app.yml)
- **技术复杂度**: 高复杂度 来源：[src/extension.ts:1-30](src/extension.ts)

### 架构目标
- **高性能**: 毫秒级代码分析响应 来源：[config/performance.yml:1-15](config/performance.yml)
- **高可用**: 99.9%服务可用性 来源：[config/ha.yml:1-10](config/ha.yml)
- **可扩展**: 支持多语言插件扩展 来源：[config/scalability.yml:1-10](config/scalability.yml)
- **易维护**: 模块化设计便于维护 来源：[src/core/index.ts:1-25](src/core/index.ts)

## 系统架构设计

### 架构风格
#### 分层架构模式
- **架构描述**: 系统采用分层架构设计，将功能模块按照职责分离为前端层、核心服务层、数据层和基础设施层 来源：[src/core/architecture.ts:1-30](src/core/architecture.ts)
- **选择原因**: 分层架构提供了清晰的职责分离，便于维护和扩展，符合VSCode插件开发的最佳实践 来源：[README.md:1-30](README.md)
- **适用场景**: 适用于需要模块化开发的AI代码辅助工具，支持多种编程语言和复杂业务逻辑 来源：[docs/design-principles.md:1-20](docs/design-principles.md)

### 整体架构图
根据代码分析和配置文件推导得出的系统架构图：

\`\`\`mermaid
graph TD
    subgraph "前端层"
        A[VSCode扩展界面] --> B[Webview组件]
    end
    
    subgraph "核心服务层"
        B --> C[代码分析引擎]
        C --> D[AI代码生成器]
        C --> E[项目管理器]
        D --> F[代码优化器]
    end
    
    subgraph "数据层"
        E --> G[(项目配置)]
        F --> H[(代码模板库)]
        C --> I[(缓存系统)]
    end
    
    subgraph "基础设施"
        J[文件系统] --> C
        K[Git仓库] --> E
        L[外部API] --> D
    end
\`\`\`

来源：[src/core/analyzer/index.ts:1-20](src/core/analyzer/index.ts), [src/core/generator/index.ts:1-25](src/core/generator/index.ts), [package.json:1-50](package.json), [config/project.json:1-30](config/project.json)

### 架构分层说明
#### 前端层
- **VSCode扩展界面**: 提供用户交互界面和快捷操作 来源：[src/extension.ts:1-20](src/extension.ts)
- **Webview组件**: 渲染复杂的UI界面和交互逻辑 来源：[src/webview-ui/index.ts:1-25](src/webview-ui/index.ts), [src/webview-ui/components.ts:1-30](src/webview-ui/components.ts)

#### 核心服务层
- **代码分析引擎**: 负责代码解析和语义分析 来源：[src/core/analyzer/index.ts:1-20](src/core/analyzer/index.ts), [src/core/analyzer/parser.ts:1-30](src/core/analyzer/parser.ts)
- **AI代码生成器**: 基于分析结果生成代码建议 来源：[src/core/generator/index.ts:1-25](src/core/generator/index.ts), [src/core/generator/aiClient.ts:1-40](src/core/generator/aiClient.ts)
- **项目管理器**: 管理项目配置和上下文信息 来源：[src/core/project/index.ts:1-15](src/core/project/index.ts), [src/core/project/config.ts:1-35](src/core/project/config.ts)
- **代码优化器**: 对生成的代码进行优化和重构 来源：[src/core/optimizer/index.ts:1-20](src/core/optimizer/index.ts), [src/core/optimizer/refactor.ts:1-45](src/core/optimizer/refactor.ts)

#### 数据层
- **项目配置**: 存储项目相关的配置信息 来源：[config/project.json:1-30](config/project.json)
- **代码模板库**: 存储各种代码模板和片段 来源：[src/templates/index.ts:1-20](src/templates/index.ts), [src/templates/javascript.ts:1-50](src/templates/javascript.ts)
- **缓存系统**: 缓存分析结果和生成的代码 来源：[src/cache/index.ts:1-25](src/cache/index.ts), [src/cache/memory.ts:1-30](src/cache/memory.ts)

#### 基础设施
- **文件系统**: 处理文件读写和目录操作 来源：[src/utils/fileUtils.ts:1-50](src/utils/fileUtils.ts)
- **Git仓库**: 集成Git操作和版本控制 来源：[src/integrations/git/index.ts:1-20](src/integrations/git/index.ts), [src/integrations/git/commands.ts:1-35](src/integrations/git/commands.ts)
- **外部API**: 调用外部AI服务和API 来源：[src/integrations/api/index.ts:1-15](src/integrations/api/index.ts), [src/integrations/api/client.ts:1-40](src/integrations/api/client.ts)

## 服务架构

### 微服务设计
#### 服务清单
| 服务名称 | 端口 | 功能描述 | 技术栈 | 依赖服务 | 来源 | 置信度 |
|---------|------|----------|-------|----------|------|--------|
| Management | 8080 | 核心管理功能 | Go+Echo | PostgreSQL, Redis | [cmd/management/](cmd/management/), [docker-compose.yml](docker-compose.yml) | 高 |
| Collector | 9164 | 数据收集服务 | Go+Echo | PostgreSQL, Pulsar | [cmd/collector/](cmd/collector/), [docker-compose.yml](docker-compose.yml) | 高 |
| IDM | 8005 | 身份管理服务 | Go+Echo | PostgreSQL, Redis | [cmd/idm/](cmd/idm/), [docker-compose.yml](docker-compose.yml) | 高 |

#### 服务间通信
- **同步通信**: HTTP/REST、gRPC 来源：[src/core/communication/api.ts:1-35](src/core/communication/api.ts)
- **异步通信**: 消息队列、事件总线 来源：[src/core/events/eventEmitter.ts:1-30](src/core/events/eventEmitter.ts)
- **通信协议**: HTTP/REST协议，便于调试和扩展 来源：[src/core/communication/protocol.ts:1-25](src/core/communication/protocol.ts)
- **数据格式**: JSON、TypeScript接口 来源：[src/types/index.ts:1-50](src/types/index.ts)

### 服务治理
#### 服务注册发现
\`\`\`json
// 服务注册发现配置示例
{
  "consul": {
    "address": "consul:8500",
    "health_check": {
      "interval": "10s",
      "timeout": "3s"
    }
  }
}
\`\`\`
来源：[config/consul.json](config/consul.json), [服务注册代码](internal/registry/registry.go) [置信度: 高]

#### 容错机制
\`\`\`yaml
# 熔断器配置示例
circuitbreaker:
  threshold: 5      # 失败阈值
  timeout: 60s      # 超时时间
  maxRequests: 100  # 半开状态最大请求数
\`\`\`
来源：[config/circuitbreaker.yml](config/circuitbreaker.yml), [熔断实现代码](internal/circuitbreaker/breaker.go) [置信度: 高]

## 数据架构

### 数据存储架构
#### 数据库选型
| 数据库类型 | 技术选型 | 用途 | 特点 | 来源 | 置信度 |
|-----------|---------|------|------|------|--------|
| 关系数据库 | PostgreSQL | 事务性数据 | ACID特性、复杂查询 | [docker-compose.yml](docker-compose.yml), [config/database.yml](config/database.yml) | 高 |
| 缓存数据库 | Redis | 高性能缓存 | 内存存储、高性能 | [docker-compose.yml](docker-compose.yml), [config/cache.yml](config/cache.yml) | 高 |
| 消息队列 | Pulsar | 异步消息 | 高吞吐、持久化 | [docker-compose.yml](docker-compose.yml), [config/pulsar.yml](config/pulsar.yml) | 高 |

#### 数据分片策略
\`\`\`sql
-- 分片策略示例
CREATE TABLE users (
    id BIGSERIAL,
    username VARCHAR(50),
    email VARCHAR(100),
    shard_key INT NOT NULL
) PARTITION BY HASH (shard_key);
\`\`\`
来源：[migrations/](migrations/) 目录中的分片表定义, [config/sharding.yml](config/sharding.yml) [置信度: 中]

### 数据流设计
#### 业务数据流
\`\`\`mermaid
sequenceDiagram
    participant U as 用户
    participant G as API网关
    participant S as 业务服务
    participant D as 数据库
    participant C as 缓存
    
    U->>G: 发起请求
    G->>S: 转发请求
    S->>C: 查询缓存
    alt 缓存命中
        C->>S: 返回缓存数据
    else 缓存未命中
        S->>D: 查询数据库
        D->>S: 返回数据
        S->>C: 更新缓存
    end
    S->>G: 返回响应
    G->>U: 返回结果
\`\`\`

来源：[internal/handlers/](internal/handlers/) 处理函数分析, [internal/cache/](internal/cache/) 缓存实现, [internal/database/](internal/database/) 数据访问层 [置信度: 中]

#### 事件流
\`\`\`go
// 事件发布示例
type UserCreatedEvent struct {
    UserID    string    \`json:"user_id"\`
    Username  string    \`json:"username"\`
    Email     string    \`json:"email"\`
    CreatedAt time.Time \`json:"created_at"\`
}

func (s *UserService) CreateUser(req *CreateUserRequest) error {
    // 创建用户逻辑
    user := &User{
        Username: req.Username,
        Email:    req.Email,
    }
    
    if err := s.repo.Create(user); err != nil {
        return err
    }
    
    // 发布事件
    event := UserCreatedEvent{
        UserID:    user.ID,
        Username:  user.Username,
        Email:     user.Email,
        CreatedAt: time.Now(),
    }
    
    return s.eventBus.Publish("user.created", event)
}
\`\`\`
来源：[internal/events/](internal/events/) 事件定义, [internal/user/service.go](internal/user/service.go) 事件发布代码 [置信度: 高]

## 技术架构

### 技术栈架构
#### 后端技术栈
| 技术层级 | 技术选型 | 版本 | 作用 | 来源 | 置信度 |
|---------|---------|------|------|------|--------|
| 编程语言 | Go | 1.21+ | 主要开发语言 | [go.mod](go.mod) | 高 |
| Web框架 | Echo | v4.10+ | HTTP框架 | [go.mod](go.mod), [main.go](main.go) | 高 |
| ORM框架 | GORM | 1.25+ | 数据库操作 | [go.mod](go.mod), [internal/database/](internal/database/) | 高 |
| 配置管理 | Viper | v2.0+ | 配置文件管理 | [go.mod](go.mod), [config/](config/) | 高 |

#### 中间件技术栈
| 中间件类型 | 技术选型 | 用途 | 特点 | 来源 | 置信度 |
|-----------|---------|------|------|------|--------|
| 消息队列 | Apache Pulsar | 异步消息处理 | 高吞吐、多租户 | [docker-compose.yml](docker-compose.yml), [internal/mq/](internal/mq/) | 高 |
| 缓存系统 | Redis | 数据缓存 | 高性能、持久化 | [docker-compose.yml](docker-compose.yml), [internal/cache/](internal/cache/) | 高 |
| 服务网格 | Istio | 服务治理 | 流量管理、安全 | [k8s/istio/](k8s/istio/) 目录分析 | 中 |

### 架构模式应用
#### 设计模式
- **分层架构**: 系统采用清晰的分层设计，各层职责明确 来源：[src/core/architecture.ts:1-30](src/core/architecture.ts)
- **微服务模式**: 模块化设计，支持独立开发和部署 来源：[src/core/modules/index.ts:1-25](src/core/modules/index.ts)
- **事件驱动模式**: 基于事件的模块间通信机制 来源：[src/core/events/eventEmitter.ts:1-30](src/core/events/eventEmitter.ts)
- **云原生模式**: 支持容器化部署和云环境运行 来源：[docker-compose.yml:1-20](docker-compose.yml)

#### 架构原则
- **单一职责**: 每个模块专注于单一功能领域 来源：[src/core/design/principles.ts:1-20](src/core/design/principles.ts)
- **开闭原则**: 对扩展开放，对修改封闭的设计 来源：[src/core/design/openclosed.ts:1-15](src/core/design/openclosed.ts)
- **依赖倒置**: 高层模块不依赖低层模块，都依赖抽象 来源：[src/core/injection/container.ts:1-25](src/core/injection/container.ts)
- **接口隔离**: 客户端不应依赖不需要的接口 来源：[src/types/interfaces.ts:1-30](src/types/interfaces.ts)

## 部署架构

### 容器化架构
#### Docker镜像策略
| 服务名称 | 镜像名称 | 基础镜像 | 构建策略 | 来源 | 置信度 |
|---------|---------|----------|----------|------|--------|
| Management | management:latest | golang:1.21-alpine | 多阶段构建 | [cmd/management/Dockerfile](cmd/management/Dockerfile) | 高 |
| Collector | collector:latest | golang:1.21-alpine | 多阶段构建 | [cmd/collector/Dockerfile](cmd/collector/Dockerfile) | 高 |
| IDM | idm:latest | golang:1.21-alpine | 多阶段构建 | [cmd/idm/Dockerfile](cmd/idm/Dockerfile) | 高 |

\`\`\`dockerfile
# 多阶段构建示例
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/management

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
CMD ["./main"]
\`\`\`
来源：[cmd/management/Dockerfile](cmd/management/Dockerfile) [置信度: 高]

#### 容器编排
\`\`\`yaml
# Kubernetes部署示例
apiVersion: apps/v1
kind: Deployment
metadata:
  name: management
spec:
  replicas: 3
  selector:
    matchLabels:
      app: management
  template:
    metadata:
      labels:
        app: management
    spec:
      containers:
      - name: management
        image: management:latest
        ports:
        - containerPort: 8080
        env:
        - name: DB_HOST
          value: "postgres-service"
        - name: REDIS_HOST
          value: "redis-service"
\`\`\`
来源：[k8s/deployments/](k8s/deployments/) 目录分析 [置信度: 高]

### 环境部署
#### 多环境部署
| 环境类型 | 部署方式 | 配置特点 | 访问地址 | 来源 | 置信度 |
|---------|---------|----------|----------|------|--------|
| 开发环境 | Docker Compose | 本地开发配置 | localhost | [docker-compose.dev.yml](docker-compose.dev.yml) | 高 |
| 测试环境 | Kubernetes | 测试配置 | test.example.com | [k8s/test/](k8s/test/) 目录分析 | 中 |
| 生产环境 | Kubernetes | 生产优化配置 | api.example.com | [k8s/prod/](k8s/prod/) 目录分析 | 中 |

#### 部署流水线
\`\`\`mermaid
graph TD
    A[代码提交] --> B[代码检查]
    B --> C[单元测试]
    C --> D[构建VSIX包]
    D --> E[集成测试]
    E --> F[发布测试版本]
    F --> G[验收测试]
    G --> H[发布正式版本]
\`\`\`

来源：[.github/workflows/ci.yml:1-50](.github/workflows/ci.yml), [scripts/build.sh:1-30](scripts/build.sh), [scripts/deploy.sh:1-40](scripts/deploy.sh)

## 安全架构

### 认证授权架构
#### 身份认证
\`\`\`go
// JWT认证实现示例
type JWTClaims struct {
    UserID   string \`json:"user_id"\`
    Username string \`json:"username"\`
    Role     string \`json:"role"\`
    jwt.StandardClaims
}

func (s *AuthService) GenerateToken(user *User) (string, error) {
    claims := JWTClaims{
        UserID:   user.ID,
        Username: user.Username,
        Role:     user.Role,
        StandardClaims: jwt.StandardClaims{
            ExpiresAt: time.Now().Add(time.Hour * 24).Unix(),
            Issuer:    "costrict",
        },
    }
    
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString([]byte(s.secretKey))
}
\`\`\`
来源：[internal/auth/jwt.go](internal/auth/jwt.go) JWT实现, [config/auth.yml](config/auth.yml) 认证配置 [置信度: 高]

#### 权限控制
- **RBAC模型**: 基于角色的访问控制，支持用户角色分配 来源：[src/auth/rbac/index.ts:1-30](src/auth/rbac/index.ts)
- **ABAC模型**: 基于属性的访问控制，支持细粒度权限 来源：[src/auth/abac/index.ts:1-25](src/auth/abac/index.ts)
- **API权限**: 接口级别的权限控制和访问限制 来源：[src/auth/middleware/permissions.ts:1-20](src/auth/middleware/permissions.ts)

### 安全防护架构
#### 网络安全
- **防火墙**: 网络层面的访问控制和流量过滤 来源：[config/security/firewall.json:1-15](config/security/firewall.json)
- **WAF防护**: Web应用层面的攻击防护和流量监控 来源：[config/security/waf.json:1-20](config/security/waf.json)
- **SSL/TLS**: 数据传输加密和安全通信协议 来源：[config/security/ssl.json:1-10](config/security/ssl.json)

#### 应用安全
\`\`\`go
// 输入验证示例
type CreateUserRequest struct {
    Username string \`json:"username" validate:"required,min=3,max=20"\`
    Email    string \`json:"email" validate:"required,email"\`
    Password string \`json:"password" validate:"required,min=8"\`
}

func (h *UserHandler) CreateUser(c echo.Context) error {
    req := new(CreateUserRequest)
    if err := c.Bind(req); err != nil {
        return c.JSON(400, map[string]string{"error": "Invalid request"})
    }
    
    if err := h.validator.Struct(req); err != nil {
        return c.JSON(400, map[string]string{"error": err.Error()})
    }
    
    // 处理创建用户逻辑
    return c.JSON(201, map[string]string{"message": "User created successfully"})
}
\`\`\`
来源：[internal/handlers/user.go](internal/handlers/user.go) 输入验证, [internal/middleware/validation.go](internal/middleware/validation.go) 验证中间件 [置信度: 高]

#### 数据安全
- **数据加密**: 敏感数据的加密存储和传输 来源：[src/security/encryption/index.ts:1-30](src/security/encryption/index.ts)
- **数据脱敏**: 隐私数据的脱敏处理和保护 来源：[src/security/masking/index.ts:1-25](src/security/masking/index.ts)
- **访问控制**: 数据访问权限的精细化控制 来源：[src/security/access/index.ts:1-20](src/security/access/index.ts)

\`\`\`\`

## 输出文件命名
\`${workspace}${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.OVERALL_ARCHITECTURE_TASK_FILE}\`
注意：如果${workspace}${WIKI_OUTPUT_DIR}目录不存在，则创建。
`
