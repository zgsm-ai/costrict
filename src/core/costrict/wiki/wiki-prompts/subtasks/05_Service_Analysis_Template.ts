import { WIKI_OUTPUT_DIR, SUBTASK_OUTPUT_FILENAMES } from "./constants"

export const SERVICE_ANALYSIS_TEMPLATE = (workspace: string) => `# 服务分析任务

## 任务目标
你作为资深服务架构分析师，需要基于完整代码仓库生成项目服务分析文档，为AI Coding Agent提供服务模块认知框架，提升代码生成精准性。

## 核心指导原则（思维链）
1. **证据驱动**：每个服务结论必须基于具体的文件证据，使用精确行号引用机制标注来源
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的服务信息
3. **结构化输出**：使用标准化格式，便于AI理解和检索
4. **自我验证**：分析完成后验证所有来源文件的真实性
5. **技术准确性**：所有信息仅源自相关源文件，不得推断、编造或使用外部知识
6. **源文件数量验证**：确保每个文档引用至少5个不同的源文件
7. **引用格式规范**：使用\`[filename.ext:start_line-end_line](文件路径)\`格式进行精确引用

## 分析流程（逐步思考）

**执行要求**：请创建并维护一个\`todo_list\`，跟踪以下所有步骤的执行状态，确保不遗漏任何步骤。

### 第一步：服务架构识别
1. 首先检查项目中的服务入口文件和配置
2. **思考**：项目被拆分为哪些服务？每个服务的职责是什么？
3. **识别**：服务边界、服务分层、架构模式
4. **验证**：通过配置文件、部署文件等验证服务架构推断
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`
7. **多样性要求**：确保引用文件类型多样化，避免单一类型文件集中

### 第二步：服务功能分析
1. 检查服务核心业务逻辑代码
2. **思考**：每个服务提供哪些核心功能？如何实现业务价值？
3. **识别**：核心功能模块、业务流程、数据模型
4. **交叉验证**：通过多个文件确认服务功能的准确性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：确保每个服务功能信息都有精确行号引用，使用多文件引用避免清一色单个文件
7. **多样性要求**：确保引用文件类型多样化，避免单一类型文件集中

### 第三步：服务接口分析
1. 检查API定义和接口实现代码
2. **思考**：服务间是如何通信的？接口契约是什么？
3. **识别**：REST API、gRPC接口、WebSocket接口
4. **验证**：通过API文档和测试用例确认接口定义
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个接口特征标注精确行号引用，确保引用文件多样性
7. **多样性要求**：确保引用文件类型多样化，避免单一类型文件集中

### 第四步：服务依赖分析
1. 检查服务间调用和依赖配置
2. **思考**：服务间有哪些依赖关系？依赖强度如何？
3. **识别**：同步调用、异步消息、共享数据依赖
4. **推断**：基于代码结构推导服务依赖图
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个依赖关系标注精确行号引用，确保引用文件多样性
7. **多样性要求**：确保引用文件类型多样化，避免单一类型文件集中

### 第五步：服务配置分析
1. 检查服务配置文件和环境变量
2. **思考**：服务是如何配置和运行的？哪些配置是关键？
3. **识别**：环境配置、性能配置、安全配置
4. **验证**：通过多个配置文件确认配置依赖关系
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个配置项标注精确行号引用，确保引用格式规范
7. **多样性要求**：确保引用文件类型多样化，避免单一类型文件集中

### 第六步：服务性能分析
1. 检查性能配置和监控指标
2. **思考**：服务的性能目标和实际表现如何？
3. **识别**：响应时间、吞吐量、资源使用率
4. **评估**：基于监控数据分析性能瓶颈
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个性能指标标注精确行号引用，确保引用文件多样性
7. **多样性要求**：确保引用文件类型多样化，避免单一类型文件集中

### 第七步：来源验证（关键步骤）
1. **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
2. **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
3. **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
4. **思考**：如果来源不存在，是什么原因？
5. **处理**：移除无效来源或寻找替代证据
6. **确认**：确保所有引用的路径都是真实有效的
7. **数量验证**：确保每个文档引用至少5个不同的源文件，避免清一色单个文件引用
8. **格式验证**：确保所有引用使用\`[filename.ext:start_line-end_line](文件路径)\`格式
9. **多样性验证**：确保引用文件类型多样化，避免单一类型文件集中

### 第八步：文档开头格式化（关键步骤）
1. **源文件列表生成**：基于分析过程中验证过的所有源文件，生成文档开头的\`<details>\`块
2. **源文件选择**：优先选择对服务分析最重要的文件，如服务入口文件、配置文件、核心模块等
3. **数量要求**：确保列出至少5个不同的源文件，不足时需主动查找其他相关文件
4. **格式规范**：使用标准markdown链接格式\`- [文件名](文件路径)\`列出源文件
5. **验证确认**：在生成文档前，再次确认所有列出的源文件都已通过验证
6. **多样性要求**：确保源文件列表包含不同类型的文件，避免单一类型文件集中

### 第九步：自我反思检查清单（质量保证）
1. **信息准确性**：所有服务信息是否基于实际代码和配置文件？
2. **来源标注**：每个服务结论是否都有明确的文件路径作为支撑？
3. **来源格式**：来源是否使用\`[filename.ext:start_line-end_line](文件路径)\`格式正确呈现？
4. **多源标注**：是否为关键服务信息提供了多个来源文件/目录，避免清一色单个文件引用？
5. **占位符清理**：是否已将所有占位符替换为实际分析内容？
6. **结构完整性**：是否按照模板格式完整输出？
7. **来源验证**：是否已正确验证所有来源文件/目录的存在性？
8. **源文件数量**：是否确保引用了至少5个不同的源文件？
9. **Mermaid规范**：流程图是否使用了\`graph TD\`而非\`graph LR\`？
10. **文档开头**：是否以\`<details>\`块开始列出相关源文件？
11. **引用多样性**：是否确保引用文件类型多样化，避免单一类型文件集中？
12. **服务分析特点**：是否针对服务分析模板特点，重点分析了服务功能、接口定义、业务逻辑等？
13. **类图和序列图**：是否包含了服务类图和序列图，并符合规范要求？

### 任务完成标准
完成以上所有检查项并通过验证后，将文档保存到指定路径即表示任务完成。必须确保：
1. 生成了完整的项目服务分析文档
2. 所有服务结论都有明确的来源文件/目录标注
3. 文档格式符合结构化模板要求

## 分析维度

### 1. 服务架构分析
#### 服务分层架构
\`\`\`mermaid
graph TD
    subgraph "接入层"
        A[API网关]
        B[WebSocket网关]
        C[负载均衡器]
    end
    
    subgraph "业务层"
        D[Management服务]
        E[Collector服务]
        F[IDM服务]
    end
    
    subgraph "数据层"
        G[数据访问层]
        H[缓存层]
        I[消息层]
    end
    
    subgraph "基础设施层"
        J[数据库]
        K[缓存]
        L[消息队列]
        M[监控]
    end
    
    A --> D
    A --> E
    A --> F
    B --> D
    C --> D
    C --> E
    C --> F
    D --> G
    D --> H
    D --> I
    E --> G
    E --> H
    E --> I
    F --> G
    F --> H
    F --> I
    G --> J
    H --> K
    I --> L
    J --> M
    K --> M
    L --> M
\`\`\`

来源：[cmd/](cmd/) 目录结构分析, [internal/](internal/) 服务模块分析, [docker-compose.yml:10-30](docker-compose.yml) 服务依赖关系, [config/](config/) 配置文件分析

#### 架构模式
- **微服务架构**: 服务独立部署和扩展 来源：[服务目录结构分析, 部署配置文件]
- **分层架构**: 清晰的层次结构 来源：[代码组织, 模块划分]
- **事件驱动架构**: 基于事件的异步通信 来源：[事件定义, 消息队列配置]
- **API网关模式**: 统一的API入口 来源：[网关配置, 路由规则]

### 2. 服务功能分析
#### 核心服务功能
| 服务名称 | 核心功能 | 业务价值 | 技术特点 | 来源 |
|----------|----------|----------|----------|------|
| Management | 用户管理、数据管理 | 核心业务支撑 | REST API、事务处理 | [cmd/management/main.go:1-20](cmd/management/main.go), [internal/management/service.go:10-30](internal/management/service.go) |
| Collector | 数据收集、处理 | 数据采集分析 | 高并发、流式处理 | [cmd/collector/main.go:1-20](cmd/collector/main.go), [internal/collector/service.go:15-35](internal/collector/service.go) |
| IDM | 身份认证、授权 | 安全保障 | OAuth2、JWT | [cmd/idm/main.go:1-20](cmd/idm/main.go), [internal/idm/service.go:20-40](internal/idm/service.go) |

### 3. 服务接口分析
#### REST API接口
| 服务 | 接口路径 | HTTP方法 | 功能描述 | 参数 | 来源 |
|------|----------|----------|----------|------|------|
| Management | /api/v1/users | GET | 获取用户列表 | page, size | [api/management.yaml:10-20](api/management.yaml), [internal/management/handler.go:30-50](internal/management/handler.go) |
| Management | /api/v1/users/{id} | DELETE | 删除用户 | - | [api/management.yaml:25-30](api/management.yaml), [internal/management/handler.go:55-65](internal/management/handler.go) |
| Collector | /api/v1/data | POST | 提交数据 | data payload | [api/collector.yaml:10-20](api/collector.yaml), [internal/collector/handler.go:30-50](internal/collector/handler.go) |
| Collector | /api/v1/data/batch | POST | 批量提交数据 | data array | [api/collector.yaml:25-35](api/collector.yaml), [internal/collector/handler.go:55-75](internal/collector/handler.go) |
| IDM | /api/v1/auth/login | POST | 用户登录 | credentials | [api/idm.yaml:10-20](api/idm.yaml), [internal/idm/handler.go:30-50](internal/idm/handler.go) |
| IDM | /api/v1/auth/logout | POST | 用户登出 | - | [api/idm.yaml:25-30](api/idm.yaml), [internal/idm/handler.go:55-65](internal/idm/handler.go) |
| IDM | /api/v1/auth/refresh | POST | 刷新令牌 | refresh token | [api/idm.yaml:35-40](api/idm.yaml), [internal/idm/handler.go:70-85](internal/idm/handler.go) |

#### gRPC接口示例
\`\`\`go
service CollectorService {
    rpc CollectData(CollectDataRequest) returns (CollectDataResponse);
    rpc ProcessData(ProcessDataRequest) returns (ProcessDataResponse);
    rpc GetMetrics(GetMetricsRequest) returns (GetMetricsResponse);
}
\`\`\`

来源：[proto/collector.proto:10-30](proto/collector.proto), [internal/collector/grpc.go:20-50](internal/collector/grpc.go)

#### WebSocket接口
| 服务 | 事件类型 | 数据格式 | 用途 | 来源 |
|------|----------|----------|------|------|
| Management | user.created | JSON | 用户创建通知 | [internal/management/websocket.go:10-20](internal/management/websocket.go), [config/websocket.yml:5-10](config/websocket.yml) |
| Management | user.deleted | JSON | 用户删除通知 | [internal/management/websocket.go:25-35](internal/management/websocket.go), [config/websocket.yml:15-20](config/websocket.yml) |
| Collector | data.received | JSON | 数据接收通知 | [internal/collector/websocket.go:10-20](internal/collector/websocket.go), [config/websocket.yml:25-30](config/websocket.yml) |
| IDM | auth.login | JSON | 用户登录事件 | [internal/idm/websocket.go:10-20](internal/idm/websocket.go), [config/websocket.yml:35-40](config/websocket.yml) |
| IDM | auth.logout | JSON | 用户登出事件 | [internal/idm/websocket.go:25-35](internal/idm/websocket.go), [config/websocket.yml:45-50](config/websocket.yml) |

### 4. 服务依赖分析
#### 依赖服务详情
| 服务 | 依赖服务 | 依赖类型 | 依赖方式 | 故障影响 | 来源 |
|------|----------|----------|----------|----------|------|
| Management | IDM | 强依赖 | 同步调用 | 无法进行用户操作 | [internal/management/service.go:10-20](internal/management/service.go), [docker-compose.yml:10-30](docker-compose.yml) |
| Management | Redis | 弱依赖 | 缓存 | 性能下降 | [internal/management/cache.go:5-15](internal/management/cache.go), [config/redis.yml:10-20](config/redis.yml) |
| Collector | PostgreSQL | 强依赖 | 数据存储 | 无法存储数据 | [internal/collector/database.go:10-20](internal/collector/database.go), [docker-compose.yml:40-60](docker-compose.yml) |
| Collector | Pulsar | 强依赖 | 消息队列 | 无法处理消息 | [internal/collector/mq.go:5-15](internal/collector/mq.go), [config/pulsar.yml:10-20](config/pulsar.yml) |
| IDM | PostgreSQL | 强依赖 | 数据存储 | 无法验证用户 | [internal/idm/database.go:10-20](internal/idm/database.go), [docker-compose.yml:70-90](docker-compose.yml) |

### 5. 服务配置分析
#### 配置结构示例
\`\`\`yaml
management:
  server:
    host: "0.0.0.0"
    port: 8080
    read_timeout: "30s"
    write_timeout: "30s"
  database:
    host: "localhost"
    port: 5432
    database: "management"
    max_connections: 100
  cache:
    host: "localhost"
    port: 6379
    pool_size: 10
  auth:
    jwt_secret: "secret"
    jwt_expire: "24h"
\`\`\`

来源：[config/management.yml:1-30](config/management.yml), [cmd/management/main.go:20-40](cmd/management/main.go)

#### 配置管理策略
- **环境配置**: 开发、测试、生产环境配置分离 来源：[config/](config/) 目录分析, [docker-compose.yml:1-20](docker-compose.yml)
- **配置中心**: 集中配置管理和动态更新 来源：[config/consul.yml:1-15](config/consul.yml), [internal/config/consul.go:10-30](internal/config/consul.go)
- **配置加密**: 敏感配置信息加密存储 来源：[config/security.yml:1-20](config/security.yml), [internal/security/encrypt.go:5-25](internal/security/encrypt.go)
- **配置验证**: 配置格式和有效性验证 来源：[internal/config/validator.go:10-30](internal/config/validator.go), [config/schema.json:1-50](config/schema.json)

### 6. 服务性能分析
#### 性能指标
| 服务 | 指标类型 | 指标名称 | 目标值 | 当前值 | 来源 |
|------|----------|----------|--------|--------|------|
| Management | 响应时间 | API平均响应时间 | <100ms | 85ms | [config/monitoring.yml:10-20](config/monitoring.yml), [internal/metrics/response_time.go:10-30](internal/metrics/response_time.go) |
| Management | 错误率 | API错误率 | <1% | 0.5% | [config/monitoring.yml:25-35](config/monitoring.yml), [internal/metrics/error_rate.go:10-30](internal/metrics/error_rate.go) |
| Collector | 响应时间 | 数据处理时间 | <50ms | 45ms | [config/monitoring.yml:40-50](config/monitoring.yml), [internal/metrics/processing_time.go:10-30](internal/metrics/processing_time.go) |
| Collector | 错误率 | 处理错误率 | <0.1% | 0.05% | [config/monitoring.yml:55-65](config/monitoring.yml), [internal/metrics/processing_error.go:10-30](internal/metrics/processing_error.go) |
| IDM | 响应时间 | 认证响应时间 | <200ms | 180ms | [config/monitoring.yml:70-80](config/monitoring.yml), [internal/metrics/auth_time.go:10-30](internal/metrics/auth_time.go) |
| IDM | 吞吐量 | 认证请求量 | 500/s | 450/s | [config/monitoring.yml:85-95](config/monitoring.yml), [internal/metrics/auth_throughput.go:10-30](internal/metrics/auth_throughput.go) |

### 7. 服务监控分析
#### 监控指标
| 服务 | 监控类型 | 指标名称 | 阈值 | 告警级别 | 来源 |
|------|----------|----------|------|----------|------|
| Management | 系统监控 | CPU使用率 | >80% | 警告 | [config/monitoring.yml:100-110](config/monitoring.yml), [internal/metrics/cpu.go:10-30](internal/metrics/cpu.go) |
| Management | 业务监控 | API请求量 | >10000 QPS | 警告 | [config/monitoring.yml:115-125](config/monitoring.yml), [internal/metrics/request_count.go:10-30](internal/metrics/request_count.go) |
| Management | 业务监控 | API错误率 | >5% | 警告 | [config/monitoring.yml:130-140](config/monitoring.yml), [internal/metrics/error_rate.go:35-55](internal/metrics/error_rate.go) |
| Collector | 系统监控 | CPU使用率 | >80% | 警告 | [config/monitoring.yml:145-155](config/monitoring.yml), [internal/metrics/cpu.go:35-55](internal/metrics/cpu.go) |
| Collector | 业务监控 | 处理延迟 | >100ms | 警告 | [config/monitoring.yml:160-170](config/monitoring.yml), [internal/metrics/processing_time.go:35-55](internal/metrics/processing_time.go) |
| IDM | 系统监控 | CPU使用率 | >80% | 警告 | [config/monitoring.yml:175-185](config/monitoring.yml), [internal/metrics/cpu.go:60-80](internal/metrics/cpu.go) |
| IDM | 业务监控 | 认证失败率 | >10% | 警告 | [config/monitoring.yml:190-200](config/monitoring.yml), [internal/metrics/auth_failure.go:10-30](internal/metrics/auth_failure.go) |

### 8. 服务安全分析
#### 安全措施
| 服务 | 安全类型 | 安全措施 | 实现方式 | 来源 |
|------|----------|----------|----------|------|
| Management | 身份认证 | JWT令牌认证 | 中间件拦截 | [internal/management/auth.go:10-30](internal/management/auth.go), [config/auth.yml:5-15](config/auth.yml) |
| Management | 权限控制 | RBAC权限控制 | 权限中间件 | [internal/management/rbac.go:10-30](internal/management/rbac.go), [config/auth.yml:20-30](config/auth.yml) |
| Management | 数据加密 | 敏感数据加密 | AES加密 | [internal/management/encrypt.go:5-25](internal/management/encrypt.go), [config/security.yml:5-15](config/security.yml) |
| Management | 输入验证 | 参数验证 | 验证中间件 | [internal/management/validator.go:10-30](internal/management/validator.go), [config/validation.yml:5-15](config/validation.yml) |
| Collector | 身份认证 | API密钥认证 | 密钥验证 | [internal/collector/auth.go:10-30](internal/collector/auth.go), [config/auth.yml:35-45](config/auth.yml) |
| Collector | 数据验证 | 数据格式验证 | Schema验证 | [internal/collector/validator.go:35-55](internal/collector/validator.go), [config/validation.yml:20-30](config/validation.yml) |
| Collector | 限流保护 | 请求限流 | 限流中间件 | [internal/collector/rate_limiter.go:10-30](internal/collector/rate_limiter.go), [config/rate_limit.yml:5-15](config/rate_limit.yml) |
| IDM | 身份认证 | OAuth2认证 | OAuth2流程 | [internal/idm/oauth2.go:10-30](internal/idm/oauth2.go), [config/auth.yml:50-60](config/auth.yml) |
| IDM | 密码安全 | 密码哈希 | bcrypt哈希 | [internal/idm/password.go:10-30](internal/idm/password.go), [config/security.yml:20-30](config/security.yml) |
| IDM | 会话管理 | 会话令牌 | JWT令牌 | [internal/idm/session.go:10-30](internal/idm/session.go), [config/auth.yml:65-75](config/auth.yml) |

#### 安全策略
- **认证策略**: 多因素认证、单点登录 来源：[config/auth.yml:80-90](config/auth.yml), [internal/auth/mfa.go:10-30](internal/auth/mfa.go)
- **授权策略**: 基于角色的访问控制 来源：[config/auth.yml:95-105](config/auth.yml), [internal/auth/rbac.go:35-55](internal/auth/rbac.go)
- **加密策略**: 传输加密、存储加密 来源：[config/security.yml:35-45](config/security.yml), [internal/security/encrypt.go:30-50](internal/security/encrypt.go)
- **审计策略**: 操作审计、日志记录 来源：[config/audit.yml:5-15](config/audit.yml), [internal/audit/logger.go:10-30](internal/audit/logger.go)

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown
# {项目名称} 服务分析

<details>
<summary>相关源文件</summary>

- [cmd/](cmd/) - 服务入口文件目录
- [internal/](internal/) - 内部实现代码目录
- [docker-compose.yml](docker-compose.yml) - 服务编排配置
- [config/](config/) - 配置文件目录
- [api/](api/) - API定义文件目录

</details>

## 引言

本文档全面分析了{项目名称}的服务架构、功能模块、接口定义和业务逻辑等关键方面。通过深入分析代码结构和配置文件，揭示了系统的服务设计思路和实现原理，为AI Coding Agent提供准确的服务认知框架，提升代码生成的精准性和一致性。

## 服务架构概览

### 服务分层架构
\`\`\`mermaid
graph TD
    subgraph "接入层"
        A[API网关]
        B[WebSocket网关]
        C[负载均衡器]
    end
    
    subgraph "业务层"
        D[Management服务]
        E[Collector服务]
        F[IDM服务]
    end
    
    subgraph "数据层"
        G[数据访问层]
        H[缓存层]
        I[消息层]
    end
    
    subgraph "基础设施层"
        J[数据库]
        K[缓存]
        L[消息队列]
        M[监控]
    end
    
    A --> D
    A --> E
    A --> F
    B --> D
    C --> D
    C --> E
    C --> F
    D --> G
    D --> H
    D --> I
    E --> G
    E --> H
    E --> I
    F --> G
    F --> H
    F --> I
    G --> J
    H --> K
    I --> L
    J --> M
    K --> M
    L --> M
\`\`\`

来源：[cmd/](cmd/) 目录结构分析, [internal/](internal/) 服务模块分析, [docker-compose.yml:10-30](docker-compose.yml) 服务依赖关系, [config/](config/) 配置文件分析

### 服务架构特点
- **微服务架构**: 服务独立部署和扩展 来源：[服务目录结构分析, 部署配置文件]
- **分层架构**: 清晰的层次结构 来源：[代码组织, 模块划分]
- **事件驱动架构**: 基于事件的异步通信 来源：[事件定义, 消息队列配置]
- **API网关模式**: 统一的API入口 来源：[网关配置, 路由规则]

## 核心服务分析

### {服务名称}服务分析

#### 服务概述
| 属性 | 值 | 来源 |
|------|----|-----|
| 服务名称 | {从配置文件提取的实际服务名} | [cmd/{service}/main.go:1-20](cmd/{service}/main.go) 或 [docker-compose.yml:10-30](docker-compose.yml) |
| 服务端口 | {实际端口号} | [config/{service}.yml:5-15](config/{service}.yml), [cmd/{service}/main.go:20-30](cmd/{service}/main.go) |
| 技术栈 | {技术栈列表} | [go.mod:1-10](go.mod), [package.json:1-10](package.json) |
| 部署方式 | {部署方式} | [Dockerfile:1-20](Dockerfile), [k8s/deployments/:1-10](k8s/deployments/) |

#### 核心功能模块
\`\`\`go
// 功能模块示例
type {ServiceName}Module struct {
    // 模块字段
}
\`\`\`

来源：[internal/{service}/](internal/{service}/) 目录结构分析, [cmd/{service}/](cmd/{service}/) 服务入口分析

#### REST API接口
| 接口路径 | HTTP方法 | 功能描述 | 参数 | 返回值 | 来源 |
|----------|----------|----------|------|--------|------|
| {接口详情} | | | | | [api/](api/) API定义, [internal/handlers/](internal/handlers/) 处理函数 |

#### 数据模型
\`\`\`go
// 数据模型示例
type {ModelName} struct {
    // 模型字段
}
\`\`\`

来源：[internal/models/](internal/models/) 数据模型定义, [internal/database/](internal/database/) 数据访问层

#### 服务依赖关系
\`\`\`mermaid
graph TD
    // 依赖关系图
\`\`\`

来源：[internal/](internal/) 服务模块分析, [docker-compose.yml:40-60](docker-compose.yml) 服务依赖关系, [config/](config/) 配置文件分析

#### 性能特性
| 指标类型 | 指标名称 | 目标值 | 当前值 | 状态 | 来源 |
|----------|----------|--------|--------|------|------|
| {性能指标详情} | | | | | [config/monitoring.yml:10-20](config/monitoring.yml), [internal/metrics/](internal/metrics/) |

#### 监控指标
- **系统监控**: CPU使用率、内存使用率、磁盘使用率、网络流量 来源：[config/monitoring.yml:30-40](config/monitoring.yml), [internal/metrics/](internal/metrics/)
- **业务监控**: API请求量、响应时间、错误率、并发数 来源：[config/monitoring.yml:50-60](config/monitoring.yml), [internal/metrics/](internal/metrics/)
- **数据库监控**: 连接数、查询性能、慢查询、锁等待 来源：[config/database.yml:20-30](config/database.yml), [internal/database/](internal/database/)
- **缓存监控**: 缓存命中率、内存使用率、键数量 来源：[config/cache.yml:15-25](config/cache.yml), [internal/cache/](internal/cache/)

## 服务间通信分析

### 通信方式
| 通信方式 | 使用场景 | 协议 | 特点 | 来源 |
|----------|----------|------|------|------|
| HTTP REST | 同步API调用 | HTTP/1.1 | 简单易用，广泛支持 | [internal/http/](internal/http/) HTTP客户端, [api/](api/) API定义 |
| gRPC | 高性能服务间通信 | HTTP/2 | 高性能，强类型 | [proto/](proto/) 协议定义, [internal/grpc/](internal/grpc/) gRPC实现 |
| WebSocket | 实时双向通信 | WebSocket | 实时性，双向通信 | [internal/websocket/](internal/websocket/) WebSocket实现 |
| Message Queue | 异步消息传递 | AMQP/MQTT | 异步解耦，可靠性 | [internal/mq/](internal/mq/) 消息客户端, [config/pulsar.yml:10-20](config/pulsar.yml) |

### 通信协议选择
- **HTTP REST**: 简单的CRUD操作，外部API 来源：[API文档, 代码注释]
- **gRPC**: 内部服务间高性能通信 来源：[服务间调用代码, 性能配置]
- **WebSocket**: 实时通知和事件推送 来源：[事件处理代码, WebSocket配置]
- **Message Queue**: 异步事件处理和消息传递 来源：[事件发布代码, 消息队列配置]

## 服务部署分析

### 部署架构
\`\`\`mermaid
graph TD
    subgraph "负载均衡层"
        LB[负载均衡器]
    end
    
    subgraph "API网关层"
        GW[API网关]
    end
    
    subgraph "服务层"
        M1[Management-1]
        M2[Management-2]
        C1[Collector-1]
        C2[Collector-2]
        I1[IDM-1]
        I2[IDM-2]
    end
    
    subgraph "数据层"
        DB[(PostgreSQL集群)]
        Cache[(Redis集群)]
        MQ[(Pulsar集群)]
        ES[(Elasticsearch集群)]
    end
    
    LB --> GW
    GW --> M1
    GW --> M2
    GW --> C1
    GW --> C2
    GW --> I1
    GW --> I2
    M1 --> DB
    M2 --> DB
    C1 --> DB
    C2 --> DB
    I1 --> DB
    I2 --> DB
    M1 --> Cache
    M2 --> Cache
    C1 --> MQ
    C2 --> MQ
    C1 --> ES
    C2 --> ES
\`\`\`

来源：[k8s/deployments/](k8s/deployments/) 部署配置, [docker-compose.yml:70-90](docker-compose.yml) 服务依赖关系, [helm/](helm/) Helm Chart

### 部署策略
- **容器化部署**: Docker容器化，便于管理和扩展 来源：[Dockerfile:1-20](Dockerfile), [docker-compose.yml:100-120](docker-compose.yml)
- **负载均衡**: 多实例部署，负载均衡分发 来源：[nginx/nginx.conf:10-30](nginx/nginx.conf), [k8s/ingress/:1-20](k8s/ingress/)
- **自动扩展**: 基于CPU、内存、QPS自动扩展 来源：[k8s/hpa/:1-15](k8s/hpa/), [扩展策略:5-20](扩展策略)
- **健康检查**: 定期健康检查，自动故障转移 来源：[k8s/healthcheck/:1-15](k8s/healthcheck/), [健康检查配置:10-25](健康检查配置)

## 服务类图分析

### 服务类图
\`\`\`mermaid
classDiagram
    class ServiceBase {
        +Start() error
        +Stop() error
        +HealthCheck() HealthStatus
    }
    
    class ManagementService {
        -config ManagementConfig
        -database Database
        -cache Cache
        +CreateUser(user User) error
        +UpdateUser(id string, user User) error
        +DeleteUser(id string) error
        +GetUser(id string) (*User, error)
        +ListUsers(filter UserFilter) ([]User, error)
    }
    
    class CollectorService {
        -config CollectorConfig
        -database Database
        -messageQueue MessageQueue
        +CollectData(data Data) error
        +ProcessData(id string) error
        +GetMetrics() Metrics
        +GetStatus() Status
    }
    
    class IDMService {
        -config IDMConfig
        -database Database
        -authProvider AuthProvider
        +Authenticate(credentials Credentials) (*Token, error)
        +Authorize(token Token, resource string) bool
        +RefreshToken(token Token) (*Token, error)
        +RevokeToken(token Token) error
    }
    
    ServiceBase <|-- ManagementService
    ServiceBase <|-- CollectorService
    ServiceBase <|-- IDMService
    
    ManagementService --> Database
    ManagementService --> Cache
    CollectorService --> Database
    CollectorService --> MessageQueue
    IDMService --> Database
    IDMService --> AuthProvider
\`\`\`

来源：[internal/service/base.go:10-30](internal/service/base.go), [internal/management/service.go:20-50](internal/management/service.go), [internal/collector/service.go:20-50](internal/collector/service.go), [internal/idm/service.go:20-50](internal/idm/service.go)

## 服务序列图分析

### 用户认证序列图
\`\`\`mermaid
sequenceDiagram
    participant C as 客户端
    participant GW as API网关
    participant M as Management服务
    participant I as IDM服务
    participant DB as 数据库
    
    C->>+GW: 登录请求
    GW->>+M: 转发登录请求
    M->>+I: 验证用户凭证
    I->>+DB: 查询用户信息
    DB-->>-I: 返回用户数据
    I-->>-M: 返回验证结果
    M-->>-GW: 返回认证令牌
    GW-->>-C: 返回登录响应
\`\`\`

来源：[internal/management/handler.go:30-50](internal/management/handler.go), [internal/idm/service.go:40-60](internal/idm/service.go), [internal/database/user.go:20-40](internal/database/user.go)

### 数据收集序列图
\`\`\`mermaid
sequenceDiagram
    participant C as 客户端
    participant GW as API网关
    participant Co as Collector服务
    participant MQ as 消息队列
    participant DB as 数据库
    
    C->>+GW: 提交数据请求
    GW->>+Co: 转发数据请求
    Co->>+MQ: 发布数据事件
    MQ-->>-Co: 确认接收
    Co->>+DB: 存储数据
    DB-->>-Co: 存储确认
    Co-->>-GW: 返回处理结果
    GW-->>-C: 返回提交响应
\`\`\`

来源：[internal/collector/handler.go:30-50](internal/collector/handler.go), [internal/collector/publisher.go:20-40](internal/collector/publisher.go), [internal/database/data.go:20-40](internal/database/data.go)

## 总结

### 关键服务特征
- **服务架构**: 微服务架构，服务独立部署和扩展 来源：[服务目录结构分析, 部署配置文件]
- **服务功能**: 用户管理、数据收集、身份验证等核心功能 来源：[服务实现代码, 业务逻辑]
- **服务接口**: REST API、gRPC、WebSocket等多种接口类型 来源：[API定义, 接口实现]
- **服务依赖**: 服务间依赖关系清晰，依赖强度合理 来源：[服务调用代码, 依赖配置]
- **服务性能**: 性能指标明确，监控机制完善 来源：[性能配置, 监控实现]

来源：[cmd/](cmd/) 服务入口分析, [internal/](internal/) 服务实现分析, [config/](config/) 配置文件分析, [docker-compose.yml](docker-compose.yml) 服务编排

\`\`\`\`

## 输出文件命名
\`${workspace}${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.SERVICE_ANALYSIS_TASK_FILE}\`
注意：如果${workspace}${WIKI_OUTPUT_DIR}目录不存在，则创建。
`
