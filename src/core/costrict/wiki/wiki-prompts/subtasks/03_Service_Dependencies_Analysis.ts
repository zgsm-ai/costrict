import {
	SUBTASK_OUTPUT_FILENAMES,
	COMMON_CORE_PRINCIPLES,
	COMMON_VERIFICATION_STEPS,
	COMMON_SELF_CHECK_BASE,
	COMMON_FILE_VERIFICATION,
	COMMON_DIVERSITY_REQUIREMENT,
	COMMON_FORMAT_VERIFICATION,
	COMMON_SOURCE_COUNT_VERIFICATION,
	COMMON_TASK_COMPLETION_STANDARD,
	COMMON_OUTPUT_FILE_NAMING,
    COMMON_REFERENCE_FORMAT,
    EXECUTE_REQUIREMENT,
    COMMON_FILE_OUTPUT,
    COMMON_DOCUMENT_HEADER_FORMAT
} from "../common/constants"

export const SERVICE_DEPENDENCIES_ANALYSIS_TEMPLATE = (workspace: string) => `# 服务依赖分析任务

## 任务目标
你作为资深系统架构分析师，需要基于完整代码仓库生成项目服务依赖分析文档，为AI Coding Agent提供项目依赖关系认知框架，提升代码生成精准性。

${COMMON_CORE_PRINCIPLES}

## 分析流程（逐步思考）

${EXECUTE_REQUIREMENT}

### 第一步：基础依赖识别
1. 首先检查项目依赖配置文件（package.json/go.mod/pom.xml/Cargo.toml等）
2. **思考**：这些配置文件能提供哪些基础依赖信息？
3. **提取**：直接依赖、间接依赖、版本约束

### 第二步：服务间调用依赖分析
1. 检查服务接口定义和调用代码
2. **思考**：服务间是如何通信的？同步还是异步？
3. **识别**：HTTP/gRPC调用、消息队列依赖、事件驱动架构
4. **交叉验证**：通过多个文件确认服务调用关系的准确性
6. **记录**：确保每个服务调用关系都有精确行号引用

### 第三步：数据依赖分析
1. 检查数据库配置和数据访问代码
2. **思考**：数据是如何在不同服务间流动的？
3. **识别**：数据库共享、缓存依赖、消息存储依赖
4. **推断**：基于代码结构和配置文件推导数据流图
6. **记录**：为数据依赖图提供精确的源文件引用，使用\`[filename.ext:start_line-end_line](文件路径)\`格式

### 第四步：配置依赖分析
1. 检查配置文件和环境变量定义
2. **思考**：哪些配置是服务间共享的？哪些是服务特有的？
3. **识别**：共享配置、服务特定配置、动态配置依赖
4. **验证**：通过多个配置文件确认配置依赖关系
6. **记录**：为每个配置依赖项标注精确行号引用，确保引用格式规范

### 第五步：第三方服务依赖分析
1. 检查外部API调用和集成代码
2. **思考**：项目依赖哪些外部服务？这些依赖的稳定性如何？
3. **识别**：支付服务、通信服务、存储服务等外部依赖
4. **评估**：分析外部依赖的可靠性和替代方案
6. **记录**：为每个外部依赖标注精确行号引用，使用多文件引用提供更全面的证据

### 第六步：基础设施依赖分析
1. 检查容器编排和部署配置
2. **思考**：服务是如何部署和运行的？依赖哪些基础设施？
3. **识别**：容器编排依赖、网络依赖、服务发现依赖
4. **推断**：基于部署文件推导基础设施架构图
6. **记录**：为每个基础设施依赖标注精确行号引用，确保引用文件多样性

${COMMON_FILE_OUTPUT}

${COMMON_DOCUMENT_HEADER_FORMAT}

${COMMON_SELF_CHECK_BASE}
11. **引用多样性**：是否确保引用文件类型多样化，避免单一类型文件集中？
12. **服务依赖特点**：是否针对服务依赖分析特点，重点分析了服务间调用关系、依赖链、接口定义等？

${COMMON_TASK_COMPLETION_STANDARD}

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown
# CoStrict 服务依赖分析

<details>
<summary>相关源文件</summary>
- [package.json](package.json)
- [docker-compose.yml](docker-compose.yml)
- [src/extension.ts](src/extension.ts)
- [src/core/analyzer/index.ts](src/core/analyzer/index.ts)
- [config/project.json](config/project.json)
</details>

## 引言

本文档全面分析了CoStrict项目的服务依赖关系，包括服务间调用关系、数据流向、接口定义和基础设施依赖等关键方面。通过深入分析代码结构和配置文件，揭示了系统的依赖关系和运行机制，为AI Coding Agent提供准确的依赖认知框架，提升代码生成的精准性和一致性。

## 依赖概览

### 核心依赖清单
| 依赖类型 | 依赖名称 | 版本 | 用途 | 依赖级别 | 来源 |
|---------|---------|------|------|----------|------|
| 数据库 | PostgreSQL | 14.5 | 主数据存储 | 强依赖 | [docker-compose.yml:1-10](docker-compose.yml), [config/database.yml:5-15](config/database.yml) |
| 缓存 | Redis | 7.0 | 会话缓存 | 强依赖 | [docker-compose.yml:15-25](docker-compose.yml), [config/cache.yml:1-10](config/cache.yml) |
| 消息队列 | Apache Pulsar | 2.10 | 异步消息 | 强依赖 | [docker-compose.yml:30-40](docker-compose.yml), [config/pulsar.yml:1-15](config/pulsar.yml) |

### 依赖关系总览
\`\`\`mermaid
graph TD
    subgraph "核心服务"
        A[Management] --> B[PostgreSQL]
        A --> C[Redis]
        A --> D[Pulsar]
    end
    
    subgraph "数据服务"
        E[Collector] --> B
        E --> D
        E --> F[Elasticsearch]
    end
    
    subgraph "外部服务"
        A --> G[支付API]
        E --> H[邮件API]
    end
\`\`\`

来源：[docker-compose.yml:1-50](docker-compose.yml), [internal/service/management.go](internal/service/management.go), [config/database.yml](config/database.yml)

## 服务间调用依赖

### HTTP服务调用
| 调用服务 | 被调用服务 | 接口路径 | 调用方式 | 依赖级别 | 超时设置 | 来源 |
|---------|-----------|----------|----------|----------|----------|------|
| Management | IDM | /api/v1/auth/validate | HTTP POST | 强依赖 | 5s | [internal/auth/client.go:10-20](internal/auth/client.go), [internal/handlers/auth.go:5-15](internal/handlers/auth.go) |
| Management | Collector | /api/v1/data/collect | HTTP GET | 弱依赖 | 10s | [internal/collector/client.go:15-25](internal/collector/client.go), [internal/handlers/data.go:8-18](internal/handlers/data.go) |

### gRPC服务调用
| 调用服务 | 被调用服务 | gRPC方法 | 调用频率 | 超时设置 | 依赖级别 | 来源 |
|---------|-----------|----------|----------|----------|----------|------|
| Management | IDM | GetUser | 高频 | 5s | 强依赖 | [proto/auth.proto:30-40](proto/auth.proto), [internal/auth/grpc_client.go:20-30](internal/auth/grpc_client.go) |
| Collector | Management | CollectData | 中频 | 10s | 强依赖 | [proto/data.proto:25-35](proto/data.proto), [internal/collector/grpc_client.go:15-25](internal/collector/grpc_client.go) |

### 消息队列依赖
#### 消息生产者
| 服务名称 | 主题(Topic) | 消息类型 | 发送频率 | QoS级别 | 依赖级别 | 来源 |
|---------|------------|----------|----------|----------|----------|------|
| Management | user-events | 用户事件 | 高频 | QoS 1 | 强依赖 | [internal/events/publisher.go:40-50](internal/events/publisher.go), [config/pulsar.yml:10-20](config/pulsar.yml) |
| Collector | data-events | 数据事件 | 中频 | QoS 0 | 强依赖 | [internal/events/publisher.go:55-65](internal/events/publisher.go), [config/pulsar.yml:25-35](config/pulsar.yml) |

#### 消息消费者
| 服务名称 | 订阅主题 | 消费方式 | 消费组 | 处理策略 | 依赖级别 | 来源 |
|---------|----------|----------|--------|----------|----------|------|
| IDM | user-events | 订阅 | idm-group | 顺序处理 | 强依赖 | [internal/events/consumer.go:30-40](internal/events/consumer.go), [config/pulsar.yml:40-50](config/pulsar.yml) |
| Management | data-events | 订阅 | mgmt-group | 并行处理 | 强依赖 | [internal/events/consumer.go:45-55](internal/events/consumer.go), [config/pulsar.yml:55-65](config/pulsar.yml) |

### 服务调用序列图
\`\`\`mermaid
sequenceDiagram
    participant M as Management
    participant I as IDM
    participant C as Collector
    participant DB as PostgreSQL
    
    M->>+I: 用户认证请求
    I->>DB: 验证用户信息
    DB-->>-I: 返回用户数据
    I-->>-M: 返回认证结果
    
    M->>+C: 数据收集请求
    C->>DB: 查询数据
    DB-->>-C: 返回数据
    C-->>-M: 返回收集结果
\`\`\`

来源：[internal/auth/client.go](internal/auth/client.go), [internal/collector/client.go](internal/collector/client.go), [internal/database/models.go](internal/database/models.go)

## 数据依赖分析

### 数据库依赖
| 服务名称 | 数据库 | 表名 | 操作类型 | 依赖级别 | 连接池配置 | 来源 |
|---------|--------|------|----------|----------|------------|------|
| Management | PostgreSQL | users | CRUD | 强依赖 | max=20, idle=5 | [internal/database/models.go](internal/database/models.go), [config/database.yml](config/database.yml) |
| Collector | PostgreSQL | data_logs | CRUD | 强依赖 | max=15, idle=3 | [internal/database/models.go](internal/database/models.go), [config/database.yml](config/database.yml) |
| IDM | PostgreSQL | auth_tokens | CRUD | 强依赖 | max=10, idle=2 | [internal/database/models.go](internal/database/models.go), [config/database.yml](config/database.yml) |

### 缓存依赖
| 服务名称 | 缓存类型 | 缓存键模式 | 过期时间 | 依赖级别 | 集群配置 | 来源 |
|---------|----------|------------|----------|----------|-----------|------|
| Management | Redis | session:* | 24h | 强依赖 | cluster-1 | [internal/cache/session.go](internal/cache/session.go), [config/cache.yml](config/cache.yml) |
| IDM | Redis | permission:* | 12h | 强依赖 | cluster-1 | [internal/cache/permission.go](internal/cache/permission.go), [config/cache.yml](config/cache.yml) |

### 消息存储依赖
| 服务名称 | 消息系统 | 主题/队列 | 用途 | 依赖级别 | 持久化配置 | 来源 |
|---------|----------|-----------|------|----------|------------|------|
| Management | Pulsar | user-events | 用户事件通知 | 强依赖 | 持久化 | [internal/events/publisher.go](internal/events/publisher.go), [config/pulsar.yml](config/pulsar.yml) |
| Collector | Pulsar | data-events | 数据事件处理 | 强依赖 | 持久化 | [internal/events/publisher.go](internal/events/publisher.go), [config/pulsar.yml](config/pulsar.yml) |

### 数据流图
\`\`\`mermaid
graph TD
    subgraph "服务层"
        A[Management] --> B[Collector]
        A --> C[IDM]
    end
    
    subgraph "数据层"
        B --> D[(PostgreSQL)]
        A --> D
        C --> D
        A --> E[(Redis)]
        C --> E
        B --> F[Pulsar]
        A --> F
    end
    
    subgraph "外部依赖"
        A --> G[支付API]
        B --> H[邮件API]
    end
\`\`\`

来源：[internal/database/models.go](internal/database/models.go), [internal/cache/session.go](internal/cache/session.go), [internal/events/publisher.go](internal/events/publisher.go), [config/database.yml](config/database.yml)

## 配置依赖分析

### 环境配置依赖
#### 共享配置项
| 配置项 | 默认值 | 使用服务 | 描述 | 依赖级别 | 来源 |
|--------|--------|----------|------|----------|------|
| APP_ENV | development | 所有服务 | 应用环境 | 强依赖 | [config/app.yml](config/app.yml), [.env.example](.env.example) |
| LOG_LEVEL | info | 所有服务 | 日志级别 | 强依赖 | [config/logging.yml](config/logging.yml), [.env.example](.env.example) |
| DATABASE_HOST | localhost | 所有服务 | 数据库主机 | 强依赖 | [config/database.yml](config/database.yml), [docker-compose.yml](docker-compose.yml) |

#### 服务特定配置
| 服务名称 | 配置项 | 默认值 | 描述 | 依赖级别 | 来源 |
|---------|--------|--------|------|----------|------|
| Management | MANAGEMENT_PORT | 8080 | 管理服务端口 | 强依赖 | [config/management.yml](config/management.yml), [cmd/management/main.go](cmd/management/main.go) |
| Collector | COLLECTOR_PORT | 9164 | 收集服务端口 | 强依赖 | [config/collector.yml](config/collector.yml), [cmd/collector/main.go](cmd/collector/main.go) |

### 动态配置依赖
| 服务名称 | 配置中心 | 配置路径 | 刷新策略 | 依赖级别 | 来源 |
|---------|----------|----------|----------|----------|------|
| Management | Consul | config/management | 热刷新 | 强依赖 | [internal/config/consul.go](internal/config/consul.go), [config/consul.yml](config/consul.yml) |
| Collector | Consul | config/collector | 热刷新 | 强依赖 | [internal/config/consul.go](internal/config/consul.go), [config/consul.yml](config/consul.yml) |

### 配置依赖流程图
\`\`\`mermaid
graph TD
    subgraph "配置中心"
        A[Consul] --> B[共享配置]
        A --> C[服务特定配置]
    end
    
    subgraph "服务层"
        D[Management] --> A
        E[Collector] --> A
        F[IDM] --> A
    end
    
    subgraph "配置文件"
        G[config/app.yml] --> B
        H[config/management.yml] --> C
        I[config/collector.yml] --> C
    end
\`\`\`

来源：[config/app.yml](config/app.yml), [config/management.yml](config/management.yml), [internal/config/consul.go](internal/config/consul.go), [config/consul.yml](config/consul.yml)

## 接口依赖分析

### API接口依赖
| 调用服务 | 被调用服务 | 接口路径 | HTTP方法 | 依赖级别 | 认证方式 | 来源 |
|---------|-----------|----------|----------|----------|----------|------|
| Management | IDM | /api/v1/auth/login | POST | 强依赖 | JWT | [internal/auth/client.go](internal/auth/client.go), [api/auth.yaml](api/auth.yaml) |
| Management | Collector | /api/v1/data/status | GET | 弱依赖 | JWT | [internal/collector/client.go](internal/collector/client.go), [api/data.yaml](api/data.yaml) |

### 接口版本依赖
| 接口路径 | 版本 | 兼容性 | 升级策略 | 依赖级别 | 来源 |
|----------|------|--------|----------|----------|------|
| /api/v1/auth/* | v1 | 向后兼容 | 渐进式升级 | 强依赖 | [api/auth.yaml](api/auth.yaml), [docs/api.md](docs/api.md) |
| /api/v2/auth/* | v2 | 新版本 | 并行运行 | 弱依赖 | [api/auth.yaml](api/auth.yaml), [docs/api.md](docs/api.md) |

### WebSocket依赖
| 服务名称 | 连接端点 | 用途 | 连接数限制 | 认证方式 | 依赖级别 | 来源 |
|---------|----------|------|-----------|----------|----------|------|
| Management | /ws/notifications | 实时通知 | 1000 | JWT | 强依赖 | [internal/websocket/notifications.go](internal/websocket/notifications.go), [config/websocket.yml](config/websocket.yml) |
| Collector | /ws/data-stream | 数据流传输 | 500 | JWT | 强依赖 | [internal/websocket/stream.go](internal/websocket/stream.go), [config/websocket.yml](config/websocket.yml) |

### 接口调用序列图
\`\`\`mermaid
sequenceDiagram
    participant Client as 客户端
    participant API as API网关
    participant Auth as 认证服务
    participant Data as 数据服务
    
    Client->>+API: 请求接口
    API->>+Auth: 验证令牌
    Auth-->>-API: 返回验证结果
    alt 验证成功
        API->>+Data: 转发请求
        Data-->>-API: 返回数据
        API-->>-Client: 返回响应
    else 验证失败
        API-->>-Client: 返回错误
    end
\`\`\`

来源：[internal/auth/client.go](internal/auth/client.go), [api/auth.yaml](api/auth.yaml), [internal/websocket/notifications.go](internal/websocket/notifications.go)

## 第三方服务依赖

### 外部API依赖
#### 支付服务依赖
| 服务名称 | 支付服务 | API端点 | 用途 | 依赖级别 | 备选方案 | 来源 |
|---------|----------|----------|------|----------|----------|------|
| Management | Stripe | /api/v1/charges | 支付处理 | 强依赖 | PayPal | [internal/payment/stripe.go](internal/payment/stripe.go), [config/payment.yml](config/payment.yml) |
| Management | PayPal | /v2/payments | 支付处理 | 备选依赖 | Stripe | [internal/payment/paypal.go](internal/payment/paypal.go), [config/payment.yml](config/payment.yml) |

#### 通信服务依赖
| 服务名称 | 服务类型 | API端点 | 用途 | 依赖级别 | 备选方案 | 来源 |
|---------|----------|----------|------|----------|----------|------|
| Management | Twilio | /2010-04-01/Accounts | 短信发送 | 强依赖 | 阿里云短信 | [internal/notification/sms.go](internal/notification/sms.go), [config/notification.yml](config/notification.yml) |
| Collector | SendGrid | /v3/mail/send | 邮件发送 | 强依赖 | 阿里云邮件 | [internal/notification/email.go](internal/notification/email.go), [config/notification.yml](config/notification.yml) |

### 云服务依赖
| 服务名称 | 云服务 | 服务类型 | 用途 | 依赖级别 | 备选方案 | 来源 |
|---------|--------|----------|------|----------|----------|------|
| Management | AWS RDS | PostgreSQL | 主数据库 | 强依赖 | 自建PostgreSQL | [docker-compose.yml](docker-compose.yml), [config/database.yml](config/database.yml) |
| Management | AWS ElastiCache | Redis | 缓存服务 | 强依赖 | 自建Redis | [docker-compose.yml](docker-compose.yml), [config/cache.yml](config/cache.yml) |

### 第三方服务调用流程
\`\`\`mermaid
graph TD
    subgraph "内部服务"
        A[Management] --> B[Collector]
    end
    
    subgraph "第三方服务"
        C[Stripe API]
        D[PayPal API]
        E[Twilio API]
        F[SendGrid API]
    end
    
    subgraph "云服务"
        G[AWS RDS]
        H[AWS ElastiCache]
    end
    
    A --> C
    A --> D
    A --> E
    B --> F
    A --> G
    A --> H
\`\`\`

来源：[internal/payment/stripe.go](internal/payment/stripe.go), [internal/notification/sms.go](internal/notification/sms.go), [config/payment.yml](config/payment.yml), [config/notification.yml](config/notification.yml)

## 基础设施依赖

### 容器编排依赖
#### Kubernetes依赖
| 服务名称 | K8s资源 | 命名空间 | 依赖级别 | 资源限制 | 来源 |
|---------|----------|----------|----------|----------|------|
| Management | Deployment | default | 强依赖 | cpu: 500m, memory: 512Mi | [k8s/deployments/management.yaml](k8s/deployments/management.yaml) |
| Collector | Deployment | default | 强依赖 | cpu: 300m, memory: 256Mi | [k8s/deployments/collector.yaml](k8s/deployments/collector.yaml) |

#### Helm依赖
| 服务名称 | Helm Chart | 版本 | 仓库 | 依赖级别 | 值文件 | 来源 |
|---------|------------|------|------|----------|--------|------|
| Management | management-chart | 1.0.0 | local | 强依赖 | values-prod.yml | [helm/management/Chart.yaml](helm/management/Chart.yaml), [helm/management/values-prod.yml](helm/management/values-prod.yml) |
| Collector | collector-chart | 1.0.0 | local | 强依赖 | values-prod.yml | [helm/collector/Chart.yaml](helm/collector/Chart.yaml), [helm/collector/values-prod.yml](helm/collector/values-prod.yml) |

### 网络依赖
#### 负载均衡依赖
| 服务名称 | 负载均衡器 | 端口 | 路由规则 | 依赖级别 | 健康检查 | 来源 |
|---------|------------|------|----------|----------|----------|------|
| Management | Nginx | 80 | /api/management/* | 强依赖 | HTTP: /health | [nginx/nginx.conf](nginx/nginx.conf), [k8s/ingress/management.yaml](k8s/ingress/management.yaml) |
| Collector | Nginx | 80 | /api/collector/* | 强依赖 | HTTP: /health | [nginx/nginx.conf](nginx/nginx.conf), [k8s/ingress/collector.yaml](k8s/ingress/collector.yaml) |

#### 服务发现依赖
| 服务名称 | 服务发现 | 注册方式 | 健康检查 | 依赖级别 | 配置参数 | 来源 |
|---------|----------|----------|----------|----------|----------|------|
| Management | Consul | 自动注册 | HTTP检查 | 强依赖 | interval: 10s | [internal/registry/consul.go](internal/registry/consul.go), [config/consul.yml](config/consul.yml) |
| Collector | Consul | 自动注册 | HTTP检查 | 强依赖 | interval: 10s | [internal/registry/consul.go](internal/registry/consul.go), [config/consul.yml](config/consul.yml) |

### 基础设施架构图
\`\`\`mermaid
graph TD
    subgraph "负载均衡层"
        A[Nginx] --> B[Management]
        A --> C[Collector]
    end
    
    subgraph "服务层"
        B --> D[PostgreSQL]
        B --> E[Redis]
        C --> D
        C --> F[Pulsar]
    end
    
    subgraph "服务发现"
        G[Consul] --> B
        G --> C
    end
    
    subgraph "容器编排"
        H[Kubernetes] --> B
        H --> C
        H --> G
    end
\`\`\`

来源：[k8s/deployments/management.yaml](k8s/deployments/management.yaml), [nginx/nginx.conf](nginx/nginx.conf), [internal/registry/consul.go](internal/registry/consul.go), [config/consul.yml](config/consul.yml)

## 依赖风险评估

### 单点故障风险
| 依赖项 | 风险等级 | 影响范围 | 缓解措施 | 依赖级别 | 来源 |
|--------|----------|----------|----------|----------|------|
| PostgreSQL | 高 | 所有服务 | 主从复制、连接池 | 强依赖 | [config/database.yml](config/database.yml), [docs/ha.md](docs/ha.md) |
| Redis | 中 | Management、IDM | 集群部署、降级策略 | 强依赖 | [config/cache.yml](config/cache.yml), [docs/ha.md](docs/ha.md) |
| Pulsar | 中 | Management、Collector | 持久化存储、重试机制 | 强依赖 | [config/pulsar.yml](config/pulsar.yml), [docs/ha.md](docs/ha.md) |

### 版本兼容性风险
| 依赖项 | 当前版本 | 最新版本 | 兼容性 | 升级建议 | 依赖级别 | 来源 |
|--------|----------|----------|--------|----------|----------|------|
| PostgreSQL | 14.5 | 15.2 | 部分兼容 | 计划升级 | 强依赖 | [docker-compose.yml](docker-compose.yml), [docs/upgrade.md](docs/upgrade.md) |
| Redis | 7.0 | 7.2 | 完全兼容 | 可升级 | 强依赖 | [docker-compose.yml](docker-compose.yml), [docs/upgrade.md](docs/upgrade.md) |

### 依赖风险评估图
\`\`\`mermaid
graph TD
    subgraph "高风险依赖"
        A[PostgreSQL] --> B[主从复制]
        A --> C[连接池]
    end
    
    subgraph "中风险依赖"
        D[Redis] --> E[集群部署]
        D --> F[降级策略]
        G[Pulsar] --> H[持久化存储]
        G --> I[重试机制]
    end
    
    subgraph "缓解措施"
        J[监控告警] --> A
        J --> D
        J --> G
        K[备份恢复] --> A
        L[容错设计] --> D
        L --> G
    end
\`\`\`

来源：[config/database.yml](config/database.yml), [config/cache.yml](config/cache.yml), [config/pulsar.yml](config/pulsar.yml), [docs/ha.md](docs/ha.md)

## 总结

### 关键依赖关系总结
- **强依赖项**：PostgreSQL、Redis、Pulsar为核心基础设施依赖，所有服务强依赖
- **服务间依赖**：Management服务依赖IDM进行认证，依赖Collector获取数据
- **外部依赖**：支付服务(Stripe/PayPal)和通信服务(Twilio/SendGrid)为关键外部依赖
- **基础设施依赖**：Kubernetes和Consul为容器编排和服务发现的核心依赖

来源：[docker-compose.yml](docker-compose.yml), [config/](config/) 配置文件分析, [internal/](internal/) 服务模块分析, [k8s/](k8s/) 部署配置
\`\`\`\`

${COMMON_OUTPUT_FILE_NAMING(workspace, SUBTASK_OUTPUT_FILENAMES.SERVICE_DEPENDENCIES_TASK_FILE)}
`
