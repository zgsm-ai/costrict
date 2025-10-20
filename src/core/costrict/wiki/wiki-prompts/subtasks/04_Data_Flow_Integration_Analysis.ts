import { WIKI_OUTPUT_DIR, SUBTASK_OUTPUT_FILENAMES } from "./constants"

export const DATA_FLOW_INTEGRATION_ANALYSIS_TEMPLATE = (workspace: string) => `# 数据流集成分析任务

## 任务目标
你作为资深数据架构分析师，需要基于完整代码仓库生成项目数据流集成分析文档，为AI Coding Agent提供数据流转和处理逻辑认知框架，提升代码生成精准性。

## 核心指导原则（思维链）
1. **证据驱动**：每个数据流结论必须基于具体的文件证据，使用精确行号引用机制标注来源
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的数据流信息
3. **结构化输出**：使用标准化格式，便于AI理解和检索
4. **自我验证**：分析完成后验证所有来源文件的真实性
5. **技术准确性**：所有信息仅源自相关源文件，不得推断、编造或使用外部知识
6. **源文件数量验证**：确保每个文档引用至少5个不同的源文件
7. **引用格式规范**：使用\`[filename.ext:start_line-end_line](文件路径)\`格式进行精确引用

## 分析流程（逐步思考）

**执行要求**：请创建并维护一个\`todo_list\`，跟踪以下所有步骤的执行状态，确保不遗漏任何步骤。

### 第一步：数据流模式识别
1. 首先检查项目中的数据传输和处理代码
2. **思考**：项目主要采用哪些数据流转模式？
3. **识别**：同步数据流、异步数据流、批量数据流、实时数据流
4. **验证**：通过代码实现和配置文件确认数据流模式
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第二步：数据集成模式分析
1. 检查API接口定义和消息队列配置
2. **思考**：数据是如何在不同组件间集成的？
3. **识别**：API集成模式、消息集成模式、数据库集成模式
4. **交叉验证**：通过多个文件确认集成模式的准确性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：确保每个集成模式信息都有精确行号引用，使用多文件引用确保来源多样性

### 第三步：数据格式和协议分析
1. 检查数据序列化和传输相关代码
2. **思考**：项目使用哪些数据格式和传输协议？
3. **识别**：JSON、Protobuf、Avro等数据格式，HTTP、gRPC等协议
4. **验证**：通过API定义和配置文件确认格式和协议
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个格式和协议标注精确行号引用，确保引用格式规范

### 第四步：数据一致性分析
1. 检查事务处理和一致性保证机制
2. **思考**：项目如何保证数据的一致性？
3. **识别**：ACID事务、分布式事务、最终一致性机制
4. **推断**：基于代码结构推导数据一致性保证策略
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个一致性机制标注精确行号引用，使用多文件引用提供更全面的证据

### 第五步：数据安全分析
1. 检查加密、脱敏和安全相关代码
2. **思考**：项目如何保障数据的机密性和完整性？
3. **识别**：传输加密、存储加密、数据脱敏机制
4. **验证**：通过配置文件和安全实现确认安全措施
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个安全措施标注精确行号引用，确保引用文件多样性

### 第六步：数据监控分析
1. 检查监控和日志相关代码
2. **思考**：项目如何监控数据流和性能？
3. **识别**：流量监控、延迟监控、错误监控机制
4. **推断**：基于监控配置推导数据监控策略
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个监控机制标注精确行号引用，确保引用格式规范

### 第七步：来源验证（关键步骤）
1. **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
2. **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
3. **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
4. **思考**：如果来源不存在，是什么原因？
5. **处理**：移除无效来源或寻找替代证据
6. **确认**：确保所有引用的路径都是真实有效的
7. **数量验证**：确保每个文档引用至少5个不同的源文件，确保引用文件多样性
8. **格式验证**：确保所有引用使用\`[filename.ext:start_line-end_line](文件路径)\`格式

### 第八步：文档开头格式化（关键步骤）
1. **源文件列表生成**：基于分析过程中验证过的所有源文件，生成文档开头的\`<details>\`块
2. **源文件选择**：优先选择对数据流集成分析最重要的文件，如数据处理文件、配置文件、API定义等
3. **数量要求**：确保列出至少5个不同的源文件，不足时需主动查找其他相关文件
4. **格式规范**：使用标准markdown链接格式\`- [文件名](文件路径)\`列出源文件
5. **验证确认**：在生成文档前，再次确认所有列出的源文件都已通过验证
6. **多样性要求**：确保源文件列表包含不同类型的文件，避免单一类型文件集中

### 第九步：自我反思检查清单（质量保证）
1. **信息准确性**：所有数据流信息是否基于实际代码和配置文件？
2. **来源标注**：每个数据流结论是否都有明确的文件路径作为支撑？
3. **来源格式**：来源是否使用\`[filename.ext:start_line-end_line](文件路径)\`格式正确呈现？
4. **多源标注**：是否为关键数据流信息提供了多个来源文件/目录，确保引用文件多样性？
5. **占位符清理**：是否已将所有占位符替换为实际分析内容？
6. **结构完整性**：是否按照模板格式完整输出？
7. **来源验证**：是否已正确验证所有来源文件/目录的存在性？
8. **源文件数量**：是否确保引用了至少5个不同的源文件？
9. **Mermaid规范**：流程图是否使用了\`graph TD\`而非\`graph LR\`？
10. **文档开头**：是否以\`<details>\`块开始列出相关源文件？
11. **引用多样性**：是否确保引用文件类型多样化，避免单一类型文件集中？
12. **数据流特点**：是否针对数据流集成分析特点，重点分析了数据流向、处理逻辑、转换机制等？
13. **图表规范**：数据流图和序列图是否符合规范要求？

### 任务完成标准
完成以上所有检查项并通过验证后，将文档保存到指定路径即表示任务完成。必须确保：
1. 生成了完整的项目数据流集成分析文档
2. 所有数据流结论都有明确的来源文件/目录标注
3. 文档格式符合结构化模板要求

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown
# CoStrict 数据流集成分析

<details>
<summary>相关源文件</summary>
- [package.json](package.json)
- [docker-compose.yml](docker-compose.yml)
- [src/extension.ts](src/extension.ts)
- [src/core/analyzer/index.ts](src/core/analyzer/index.ts)
- [config/project.json](config/project.json)
</details>

## 引言

本文档全面分析了CoStrict项目的数据流集成架构，包括数据流向、处理逻辑、转换机制和存储策略等关键方面。通过深入分析代码结构和配置文件，揭示了系统的数据处理机制和流转路径，为AI Coding Agent提供准确的数据流认知框架，提升代码生成的精准性和一致性。

## 数据流概览

### 核心数据流清单
| 数据流类型 | 描述 | 涉及服务 | 传输方式 | 来源 |
|-----------|------|----------|----------|------|
| 业务数据流 | 核心业务数据流转 | Management, IDM | HTTP/REST | [internal/handlers/](internal/handlers/) 处理函数分析, [api/](api/) API定义 |
| 事件数据流 | 系统事件和通知 | 所有服务 | Message Queue | [internal/events/](internal/events/) 事件定义, [config/pulsar.yml](config/pulsar.yml) 消息配置 |
| 日志数据流 | 系统日志和监控 | 所有服务 | File/Stream | [internal/logger/](internal/logger/) 日志配置, [config/logging.yml](config/logging.yml) |
| 配置数据流 | 配置信息同步 | 所有服务 | Config Center | [config/](config/) 配置文件, [internal/config/](internal/config/) 配置管理 |

### 数据流架构图
\`\`\`mermaid
graph TD
    subgraph "数据源"
        A[用户输入] --> D[API网关]
        B[外部系统] --> D
        C[IoT设备] --> F[消息网关]
    end
    
    subgraph "接入层"
        D --> G[Management服务]
        E[WebSocket网关] --> H[Collector服务]
        F --> I[IDM服务]
    end
    
    subgraph "处理层"
        G --> J[(PostgreSQL)]
        H --> K[(Redis)]
        I --> L[(Pulsar)]
    end
    
    subgraph "存储层"
        J --> M[Elasticsearch]
        K --> M
        L --> M
    end
\`\`\`


来源：[cmd/](cmd/) 服务入口分析, [internal/](internal/) 服务模块分析, [docker-compose.yml](docker-compose.yml) 服务依赖关系, [config/](config/) 配置文件分析

## 数据流模式分析

### 同步数据流
| 数据流名称 | 触发方式 | 处理方式 | 响应时间 | 关键组件 | 来源 |
|-----------|----------|----------|----------|----------|------|
| 用户请求流 | HTTP请求 | 同步处理 | <100ms | API网关, 业务服务 | [internal/handlers/](internal/handlers/) 处理函数, [api/](api/) API定义 |
| 数据查询流 | API调用 | 同步查询 | <200ms | 数据访问层, 缓存 | [internal/database/](internal/database/) 数据访问, [internal/cache/](internal/cache/) 缓存实现 |

### 异步数据流
| 数据流名称 | 触发方式 | 处理方式 | 延迟 | 消息系统 | 来源 |
|-----------|----------|----------|------|----------|------|
| 用户事件流 | 业务操作 | 异步处理 | <1s | Pulsar | [internal/events/](internal/events/) 事件定义, [config/pulsar.yml](config/pulsar.yml) |
| 数据处理流 | 数据收集 | 批量处理 | <5s | 消息队列 | [internal/processor/](internal/processor/) 数据处理, [internal/mq/](internal/mq/) 消息客户端 |

### 数据流序列图
\`\`\`mermaid
sequenceDiagram
    participant U as 用户
    participant G as API网关
    participant M as Management服务
    participant D as 数据库
    participant C as 缓存
    
    U->>+G: 发起请求
    G->>+M: 转发请求
    M->>+C: 查询缓存
    alt 缓存命中
        C-->>-M: 返回缓存数据
    else 缓存未命中
        M->>+D: 查询数据库
        D-->>-M: 返回数据
        M->>+C: 更新缓存
        C-->>-M: 更新完成
    end
    M-->>-G: 返回响应
    G-->>-U: 返回结果
\`\`\`


来源：[internal/handlers/](internal/handlers/) 处理函数分析, [internal/cache/](internal/cache/) 缓存实现, [internal/database/](internal/database/) 数据访问层

## 数据集成模式分析

### API集成模式
| API端点 | HTTP方法 | 数据格式 | 用途 | 集成服务 | 来源 |
|---------|----------|----------|------|----------|------|
| /api/v1/users | POST/GET | JSON | 用户管理 | Management, IDM | [api/users.yaml](api/users.yaml), [internal/handlers/user.go](internal/handlers/user.go) |
| /api/v1/data | POST | JSON | 数据提交 | Management, Collector | [api/data.yaml](api/data.yaml), [internal/handlers/data.go](internal/handlers/data.go) |
| /api/v1/auth | POST | JSON | 身份验证 | Management, IDM | [api/auth.yaml](api/auth.yaml), [internal/handlers/auth.go](internal/handlers/auth.go) |

### 消息集成模式
| 主题(Topic) | 发布者 | 订阅者 | 消息格式 | 用途 | 来源 |
|------------|--------|--------|----------|------|------|
| user-events | Management, IDM | 所有服务 | JSON | 用户事件通知 | [internal/events/user.go](internal/events/user.go), [config/pulsar.yml](config/pulsar.yml) |
| data-events | Collector | 数据分析服务 | JSON | 数据事件处理 | [internal/events/data.go](internal/events/data.go), [config/pulsar.yml](config/pulsar.yml) |
| system-events | 所有服务 | 监控服务 | JSON | 系统事件监控 | [internal/events/system.go](internal/events/system.go), [config/pulsar.yml](config/pulsar.yml) |

### 数据库集成模式
| 数据库 | 角色 | 复制方式 | 延迟 | 用途 | 来源 |
|--------|------|----------|------|------|------|
| PostgreSQL主库 | 主库 | 同步复制 | <1s | 写操作 | [docker-compose.yml](docker-compose.yml), [config/database.yml](config/database.yml) |
| PostgreSQL从库 | 从库 | 异步复制 | <5s | 读操作 | [docker-compose.yml](docker-compose.yml), [config/database.yml](config/database.yml) |
| Redis主库 | 主库 | 同步复制 | <1s | 缓存写入 | [docker-compose.yml](docker-compose.yml), [config/cache.yml](config/cache.yml) |
| Redis从库 | 从库 | 异步复制 | <3s | 缓存读取 | [docker-compose.yml](docker-compose.yml), [config/cache.yml](config/cache.yml) |

## 数据格式和协议分析

### 数据格式
| 格式类型 | 应用场景 | 示例 | 验证方式 | 来源 |
|---------|----------|------|----------|------|
| JSON | REST API数据交换 | {"id": "123", "name": "test"} | JSON Schema | [api/](api/) API定义, [internal/models/](internal/models/) 数据模型 |
| Protobuf | gRPC服务数据格式 | 序列化二进制格式 | .proto定义 | [proto/](proto/) 协议定义, [internal/grpc/](internal/grpc/) gRPC实现 |
| Avro | 消息队列数据格式 | 二进制序列化格式 | Avro Schema | [schemas/](schemas/) 模式定义, [config/pulsar.yml](config/pulsar.yml) |

### 传输协议
| 协议类型 | 端口 | 用途 | 安全机制 | 来源 |
|---------|------|------|----------|------|
| HTTP/HTTPS | 80/443 | Web服务数据传输 | TLS 1.3 | [config/server.yml](config/server.yml), [nginx/nginx.conf](nginx/nginx.conf) |
| gRPC | 50051 | 高性能RPC数据传输 | TLS | [config/grpc.yml](config/grpc.yml), [internal/grpc/](internal/grpc/) |
| WebSocket | 8080/ws | 实时双向数据传输 | JWT认证 | [config/websocket.yml](config/websocket.yml), [internal/websocket/](internal/websocket/) |

## 数据一致性分析

### 事务一致性
#### ACID特性保证
- **原子性**: 事务中的操作要么全部成功，要么全部失败 来源：[internal/database/transaction.go:10-20](internal/database/transaction.go), [config/database.yml:5-15](config/database.yml)
- **一致性**: 事务执行前后数据保持一致状态 来源：[internal/database/transaction.go:25-35](internal/database/transaction.go), [database/schema.sql:1-10](database/schema.sql)
- **隔离性**: 并发事务之间相互隔离 来源：[config/database.yml:20-30](config/database.yml), [internal/database/transaction.go:40-50](internal/database/transaction.go)
- **持久性**: 事务提交后数据持久化存储 来源：[config/database.yml:35-45](config/database.yml), [internal/database/transaction.go:55-65](internal/database/transaction.go)

### 最终一致性
#### 事件溯源一致性
\`\`\`mermaid
graph TD
    A[业务操作] --> B[生成事件]
    B --> C[存储事件]
    C --> D[发布事件]
    D --> E[事件处理]
    E --> F[更新状态]
\`\`\`


来源：[internal/events/](internal/events/) 事件定义, [internal/eventstore/](internal/eventstore/) 事件存储, [config/pulsar.yml](config/pulsar.yml) 消息配置

#### 补偿事务机制
| 补偿类型 | 触发条件 | 补偿策略 | 实现方式 | 来源 |
|---------|----------|----------|----------|------|
| 操作失败 | 业务异常 | 回滚操作 | 事务回滚 | [internal/database/transaction.go](internal/database/transaction.go) |
| 超时失败 | 操作超时 | 重试机制 | 指数退避 | [internal/retry/](internal/retry/) 重试实现, [config/retry.yml](config/retry.yml) |
| 系统故障 | 服务不可用 | 降级处理 | 缓存返回 | [internal/circuitbreaker/](internal/circuitbreaker/) 熔断器, [config/circuitbreaker.yml](config/circuitbreaker.yml) |

## 数据安全分析

### 数据加密
| 加密方式 | 加密算法 | 密钥长度 | 应用场景 | 来源 |
|----------|----------|----------|----------|------|
| HTTPS | TLS 1.3 | 256位 | API通信 | [config/ssl.yml](config/ssl.yml), [nginx/nginx.conf](nginx/nginx.conf) |
| 存储加密 | AES-256 | 256位 | 敏感数据 | [internal/crypto/](internal/crypto/) 加密实现, [config/crypto.yml](config/crypto.yml) |
| 密码哈希 | bcrypt | - | 用户密码 | [internal/auth/password.go](internal/auth/password.go), [config/auth.yml](config/auth.yml) |

### 数据脱敏
| 数据类型 | 脱敏方式 | 脱敏规则 | 应用场景 | 来源 |
|----------|----------|----------|----------|------|
| 手机号 | 部分遮蔽 | 138****1234 | 日志、显示 | [internal/masking/phone.go](internal/masking/phone.go), [config/masking.yml](config/masking.yml) |
| 邮箱 | 部分遮蔽 | user***@domain.com | 日志、显示 | [internal/masking/email.go](internal/masking/email.go), [config/masking.yml](config/masking.yml) |
| 身份证 | 部分遮蔽 | 110****1234 | 日志、显示 | [internal/masking/idcard.go](internal/masking/idcard.go), [config/masking.yml](config/masking.yml) |

## 数据监控和分析

### 数据流监控
| 指标类型 | 指标名称 | 阈值 | 告警级别 | 监控方式 | 来源 |
|----------|----------|------|----------|----------|------|
| 流量监控 | API请求量 | >10000 QPS | 警告 | Prometheus | [config/monitoring.yml](config/monitoring.yml), [internal/metrics/](internal/metrics/) |
| 延迟监控 | API响应时间 | >1000ms | 警告 | APM工具 | [config/apm.yml](config/apm.yml), [internal/tracing/](internal/tracing/) |
| 错误监控 | API错误率 | >5% | 警告 | 日志分析 | [config/logging.yml](config/logging.yml), [internal/logger/](internal/logger/) |
| 消息监控 | 消息处理量 | >5000 msg/s | 警告 | 消息队列监控 | [config/pulsar.yml](config/pulsar.yml), [internal/mq/](internal/mq/) |

### 数据分析
| 分析类型 | 数据源 | 处理方式 | 输出结果 | 应用场景 | 来源 |
|---------|--------|----------|----------|----------|------|
| 实时分析 | 流式数据 | 流处理 | 实时指标 | 监控面板 | [internal/streaming/](internal/streaming/) 流处理, [config/streaming.yml](config/streaming.yml) |
| 批量分析 | 历史数据 | 批处理 | 统计报告 | 业务报表 | [internal/batch/](internal/batch/) 批处理, [config/batch.yml](config/batch.yml) |
| 预测分析 | 历史数据 | 机器学习 | 预测模型 | 业务预测 | [internal/ml/](internal/ml/) 机器学习, [config/ml.yml](config/ml.yml) |

## 总结

### 关键数据流特征
- **主要数据流模式**: 同步/异步/批量/实时 来源：[internal/](internal/) 代码分析, [config/](config/) 配置文件
- **核心集成方式**: API集成/消息集成/数据库集成 来源：[internal/integration/](internal/integration/) 集成代码, [config/](config/) 配置文件
- **数据一致性保证**: ACID/最终一致性/补偿事务 来源：[internal/database/transaction.go](internal/database/transaction.go) 事务代码, [config/database.yml](config/database.yml) 配置文件
- **安全防护措施**: 加密/脱敏/访问控制 来源：[internal/security/](internal/security/) 安全代码, [config/security.yml](config/security.yml) 配置文件

来源：[internal/](internal/) 内部实现分析, [config/](config/) 配置文件分析, [api/](api/) 接口定义
\`\`\`\`

## 输出文件命名
\`${workspace}${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.DATA_FLOW_INTEGRATION_TASK_FILE}\`
注意：如果${workspace}${WIKI_OUTPUT_DIR}目录不存在，则创建。
`
