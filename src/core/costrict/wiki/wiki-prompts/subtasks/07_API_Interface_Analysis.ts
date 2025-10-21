import {
	WIKI_OUTPUT_DIR,
	SUBTASK_OUTPUT_FILENAMES,
	COMMON_REFERENCE_FORMAT,
	COMMON_DIVERSITY_REQUIREMENT,
    COMMON_CORE_PRINCIPLES,
    COMMON_FILE_VERIFICATION,
    EXECUTE_REQUIREMENT,
    COMMON_OUTPUT_FILE_NAMING,
    COMMON_FILE_OUTPUT,
    COMMON_DOCUMENT_HEADER_FORMAT,
    COMMON_SELF_CHECK_BASE,
    COMMON_TASK_COMPLETION_STANDARD,
} from "../common/constants"

export const API_INTERFACE_ANALYSIS_TEMPLATE = (workspace: string) => `# API接口分析任务

## 任务目标
你作为资深API架构分析师，需要基于完整代码仓库生成项目API接口分析文档，为AI Coding Agent提供API接口认知框架，提升代码生成精准性。

${COMMON_CORE_PRINCIPLES}

## 分析流程（逐步思考）

${EXECUTE_REQUIREMENT}

### 第一步：API架构识别
1. 首先检查项目中的API架构文件和配置
2. **思考**：项目采用了哪些API架构模式？为什么选择这些架构？
3. **识别**：API架构模式、设计原则、技术栈
4. **验证**：通过配置文件、代码注释等验证API架构推断

### 第二步：API分类分析
1. 检查API路由定义和控制器代码
2. **思考**：API是如何分类组织的？不同类别的API有什么特点？
3. **识别**：按功能分类、按HTTP方法分类
4. **统计**：各类API的数量、访问频率、安全级别
5. **记录**：确保每个API分类信息都有精确行号引用，使用多文件引用避免清一色单个文件

### 第三步：核心API接口分析
1. 检查核心业务API的定义和实现
2. **思考**：哪些是核心API接口？它们是如何实现业务价值的？
3. **识别**：API端点、请求/响应格式、认证方式、错误处理
4. **交叉验证**：通过API文档和测试用例确认接口定义
5. **记录**：确保每个API接口信息都有精确行号引用，使用多文件引用确保来源多样性

### 第四步：数据模型分析
1. 检查API请求和响应的数据模型定义
2. **思考**：API是如何定义和组织数据的？数据模型有哪些特点？
3. **识别**：请求模型、响应模型、数据验证规则
4. **验证**：通过模型定义和API实现确认数据模型的准确性
5. **记录**：为每个数据模型特征标注精确行号引用，确保引用文件多样性

### 第五步：错误处理分析
1. 检查错误码定义和错误处理代码
2. **思考**：API是如何处理错误和异常的？错误处理策略是什么？
3. **识别**：错误码体系、错误响应格式、错误处理策略
4. **评估**：基于错误处理代码评估错误处理的完整性
5. **记录**：为每个错误处理特征标注精确行号引用，确保引用格式规范

### 第六步：安全控制分析
1. 检查认证、权限和输入验证代码
2. **思考**：API是如何保障安全性的？有哪些安全控制措施？
3. **识别**：认证机制、权限控制、输入验证
4. **验证**：通过安全配置和代码实现确认安全措施
5. **记录**：为每个安全特征标注精确行号引用，确保引用文件多样性

### 第七步：性能优化分析
1. 检查缓存配置和限流控制代码
2. **思考**：API是如何优化性能的？有哪些性能优化策略？
3. **识别**：缓存策略、限流控制、压缩优化
4. **推断**：基于配置文件推断性能优化策略
5. **记录**：为每个性能特征标注精确行号引用，确保引用文件多样性

### 第八步：API文档分析
1. 检查API文档和版本控制配置
2. **思考**：API是如何文档化和管理的？版本控制策略是什么？
3. **识别**：API文档、版本控制、兼容性策略
4. **验证**：通过文档和配置确认API管理策略
5. **记录**：为每个文档特征标注精确行号引用，确保引用格式规范

${COMMON_FILE_OUTPUT}

${COMMON_DOCUMENT_HEADER_FORMAT}

${COMMON_SELF_CHECK_BASE}
11. **引用多样性**：是否确保引用文件类型多样化，避免单一类型文件集中？
12. **API接口特点**：是否针对API接口分析特点，重点分析了接口定义、参数规范、返回格式等？
13. **序列图规范**：是否包含了API接口序列图，并符合规范要求？

${COMMON_TASK_COMPLETION_STANDARD}

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown
# {项目名称} API接口分析

<details>
<summary>相关源文件</summary>
- [api/:1-100](api/) - API定义文件目录
- [internal/routes/:1-50](internal/routes/) - 路由定义目录
- [internal/handlers/:1-80](internal/handlers/) - 处理器实现目录
- [internal/middleware/:1-60](internal/middleware/) - 中间件实现目录
- [config/:1-40](config/) - 配置文件目录
</details>

## 引言

本文档全面分析了{项目名称}的API接口设计，包括API架构模式、接口分类、核心接口定义、数据模型、错误处理、安全控制和性能优化等关键方面。通过深入分析API定义文件、路由配置和处理器实现，揭示了系统的API设计思路和实现原理，为AI Coding Agent提供准确的API接口认知框架，提升代码生成的精准性和一致性。

## API架构概览

### API架构模式
\`\`\`mermaid
graph TD
    subgraph "API网关层"
        GW[API网关]
        LB[负载均衡器]
    end
    
    subgraph "路由层"
        R1[路由管理器]
        R2[中间件链]
        R3[请求处理器]
    end
    
    subgraph "业务层"
        S1[Management服务]
        S2[Collector服务]
        S3[IDM服务]
    end
    
    subgraph "数据层"
        D1[数据访问层]
        D2[缓存层]
        D3[消息层]
    end
    
    GW --> LB --> R1 --> R2 --> R3
    R3 --> S1 & S2 & S3
    S1 & S2 & S3 --> D1 & D2 & D3
\`\`\`

来源：[api/:1-100](api/) API定义分析, [internal/routes/:1-50](internal/routes/) 路由定义, [docker-compose.yml:10-30](docker-compose.yml) 服务依赖关系, [config/:1-40](config/) 配置文件分析

### API架构特点
- **RESTful架构**: 遵循REST设计原则 来源：[api/:1-100](api/) API定义, [internal/handlers/:1-80](internal/handlers/) 处理器实现
- **分层架构**: 清晰的层次结构 来源：[internal/routes/:1-50](internal/routes/) 路由定义, [internal/middleware/:1-60](internal/middleware/) 中间件实现
- **中间件模式**: 可插拔的中间件处理 来源：[internal/middleware/:1-60](internal/middleware/) 中间件实现, [config/middleware.yml:1-30](config/middleware.yml) 中间件配置
- **统一响应**: 统一的响应格式和错误处理 来源：[internal/handlers/response.go:1-40](internal/handlers/response.go) 响应处理, [internal/middleware/error.go:1-50](internal/middleware/error.go) 错误处理

## API接口分类分析

### 按功能分类
| 分类 | 接口数量 | 主要功能 | 访问频率 | 安全级别 | 来源 |
|------|----------|----------|----------|----------|------|
| 用户管理 | {数量} | 用户注册、登录、管理 | 高 | 高 | [api/user.yaml](api/user.yaml), [internal/handlers/user.go](internal/handlers/user.go), [internal/routes/user.go](internal/routes/user.go) |
| 数据管理 | {数量} | 数据CRUD操作 | 高 | 中 | [api/data.yaml](api/data.yaml), [internal/handlers/data.go](internal/handlers/data.go), [internal/routes/data.go](internal/routes/data.go) |
| 系统配置 | {数量} | 配置管理 | 中 | 高 | [api/config.yaml](api/config.yaml), [internal/handlers/config.go](internal/handlers/config.go), [internal/routes/config.go](internal/routes/config.go) |
| 审计日志 | {数量} | 日志查询 | 低 | 高 | [api/audit.yaml](api/audit.yaml), [internal/handlers/audit.go](internal/handlers/audit.go), [internal/routes/audit.go](internal/routes/audit.go) |
| 健康检查 | {数量} | 系统状态检查 | 中 | 低 | [api/health.yaml](api/health.yaml), [internal/handlers/health.go](internal/handlers/health.go), [internal/routes/health.go](internal/routes/health.go) |

### 按HTTP方法分类
| HTTP方法 | 接口数量 | 主要用途 | 幂等性 | 安全性 | 来源 |
|----------|----------|----------|--------|--------|------|
| GET | {数量} | 数据查询 | 是 | 安全 | [api/:1-100](api/) API定义, [internal/routes/:1-50](internal/routes/) 路由定义, [internal/handlers/:1-80](internal/handlers/) 处理函数 |
| POST | {数量} | 数据创建 | 否 | 不安全 | [api/:1-100](api/) API定义, [internal/routes/:1-50](internal/routes/) 路由定义, [internal/handlers/:1-80](internal/handlers/) 处理函数 |
| PUT | {数量} | 数据更新 | 是 | 不安全 | [api/:1-100](api/) API定义, [internal/routes/:1-50](internal/routes/) 路由定义, [internal/handlers/:1-80](internal/handlers/) 处理函数 |
| DELETE | {数量} | 数据删除 | 是 | 不安全 | [api/:1-100](api/) API定义, [internal/routes/:1-50](internal/routes/) 路由定义, [internal/handlers/:1-80](internal/handlers/) 处理函数 |
| PATCH | {数量} | 部分更新 | 否 | 不安全 | [api/:1-100](api/) API定义, [internal/routes/:1-50](internal/routes/) 路由定义, [internal/handlers/:1-80](internal/handlers/) 处理函数 |

## 核心API接口详细分析

### {业务模块}API

#### {具体接口名称}
| 属性 | 值 | 来源 |
|------|----|-----|
| URL | {实际URL} | [internal/routes/:1-50](internal/routes/) 路由定义, [api/:1-100](api/) API文档 |
| HTTP方法 | {实际方法} | [internal/routes/:1-50](internal/routes/) 路由定义, [api/:1-100](api/) API文档 |
| 功能描述 | {接口功能描述} | [internal/handlers/:1-80](internal/handlers/) 处理函数, [api/:1-100](api/) API文档 |
| 认证要求 | {认证要求} | [internal/middleware/auth.go:1-40](internal/middleware/auth.go), [api/:1-100](api/) API文档 |
| 权限要求 | {权限要求} | [internal/middleware/permission.go:1-40](internal/middleware/permission.go), [api/:1-100](api/) API文档 |

**请求参数**:
\`\`\`json
{
  "param1": "value1",
  "param2": "value2"
}
\`\`\`
来源：[internal/models/request.go:1-50](internal/models/request.go) 请求模型定义, [api/:1-100](api/) API文档

**响应示例**:
\`\`\`json
{
  "code": 200,
  "message": "Success",
  "data": {
    "field1": "value1",
    "field2": "value2"
  }
}
\`\`\`
来源：[internal/models/response.go:1-50](internal/models/response.go) 响应模型定义, [api/:1-100](api/) API文档

**错误码**:
| 错误码 | HTTP状态码 | 描述 | 来源 |
|--------|------------|------|------|
| 400 | 400 | 请求参数错误 | [internal/errors/:1-50](internal/errors/) 错误定义, [api/:1-100](api/) API文档 |
| 401 | 401 | 未授权访问 | [internal/errors/:1-50](internal/errors/) 错误定义, [api/:1-100](api/) API文档 |
| 404 | 404 | 资源不存在 | [internal/errors/:1-50](internal/errors/) 错误定义, [api/:1-100](api/) API文档 |

## API接口序列图分析

### 用户认证序列图
\`\`\`mermaid
sequenceDiagram
    participant C as 客户端
    participant API as API网关
    participant Auth as 认证服务
    participant DB as 数据库
    
    C->>+API: 登录请求
    API->>+Auth: 验证用户凭证
    Auth->>+DB: 查询用户信息
    DB-->>-Auth: 返回用户数据
    Auth-->>-API: 返回认证结果
    API-->>-C: 返回认证令牌
\`\`\`

来源：[internal/handlers/auth.go:1-50](internal/handlers/auth.go) 认证处理, [internal/middleware/auth.go:1-40](internal/middleware/auth.go) 认证中间件, [internal/models/user.go:1-60](internal/models/user.go) 用户模型

### 数据处理序列图
\`\`\`mermaid
sequenceDiagram
    participant C as 客户端
    participant API as API网关
    participant Data as 数据服务
    participant Cache as 缓存
    participant DB as 数据库
    
    C->>+API: 数据处理请求
    API->>+Data: 转发请求
    Data->>+Cache: 查询缓存
    alt 缓存命中
        Cache-->>-Data: 返回缓存数据
    else 缓存未命中
        Data->>+DB: 查询数据库
        DB-->>-Data: 返回数据
        Data->>+Cache: 更新缓存
        Cache-->>-Data: 更新完成
    end
    Data-->>-API: 返回处理结果
    API-->>-C: 返回响应
\`\`\`

来源：[internal/handlers/data.go:1-50](internal/handlers/data.go) 数据处理, [internal/cache/:1-60](internal/cache/) 缓存实现, [internal/database/:1-70](internal/database/) 数据访问层

## 数据模型分析

### 请求模型
\`\`\`go
// 请求模型示例
type {RequestModelName} struct {
    Field1 string \`json:"field1" validate:"required"\`
    Field2 int    \`json:"field2" validate:"min=0"\`
    Field3 bool   \`json:"field3,omitempty"\`
}
\`\`\`
来源：[internal/models/request.go:1-50](internal/models/request.go) 请求模型定义, [internal/validators/:1-40](internal/validators/) 验证规则

### 响应模型
\`\`\`go
// 响应模型示例
type {ResponseModelName} struct {
    ID       string    \`json:"id"\`
    Name     string    \`json:"name"\`
    Status   string    \`json:"status"\`
    CreateAt time.Time \`json:"created_at"\`
}
\`\`\`
来源：[internal/models/response.go:1-50](internal/models/response.go) 响应模型定义, [internal/handlers/:1-80](internal/handlers/) 处理函数

## 错误处理分析

### 错误码定义
| 错误码 | HTTP状态码 | 描述 | 来源 |
|--------|------------|------|------|
| 200 | 200 | 请求成功 | [internal/errors/codes.go:1-50](internal/errors/codes.go), [api/:1-100](api/) API文档 |
| 201 | 201 | 资源创建成功 | [internal/errors/codes.go:1-50](internal/errors/codes.go), [api/:1-100](api/) API文档 |
| 400 | 400 | 请求参数错误 | [internal/errors/codes.go:1-50](internal/errors/codes.go), [api/:1-100](api/) API文档 |
| 401 | 401 | 未授权访问 | [internal/errors/codes.go:1-50](internal/errors/codes.go), [api/:1-100](api/) API文档 |
| 403 | 403 | 禁止访问 | [internal/errors/codes.go:1-50](internal/errors/codes.go), [api/:1-100](api/) API文档 |
| 404 | 404 | 资源不存在 | [internal/errors/codes.go:1-50](internal/errors/codes.go), [api/:1-100](api/) API文档 |
| 409 | 409 | 资源冲突 | [internal/errors/codes.go:1-50](internal/errors/codes.go), [api/:1-100](api/) API文档 |
| 422 | 422 | 数据验证失败 | [internal/errors/codes.go:1-50](internal/errors/codes.go), [api/:1-100](api/) API文档 |
| 500 | 500 | 服务器内部错误 | [internal/errors/codes.go:1-50](internal/errors/codes.go), [api/:1-100](api/) API文档 |

### 错误响应格式
\`\`\`json
{
  "code": 400,
  "message": "Bad request",
  "error": "Invalid request parameters",
  "details": {
    "field": "username",
    "message": "Username is required"
  }
}
\`\`\`
来源：[internal/errors/handler.go:1-50](internal/errors/handler.go) 错误处理实现, [api/:1-100](api/) API文档

### 错误处理策略
- **统一错误处理**: 使用中间件统一处理错误 来源：[internal/middleware/error.go:1-50](internal/middleware/error.go) 错误处理中间件
- **错误日志记录**: 记录详细错误信息用于调试 来源：[internal/logger/error.go:1-40](internal/logger/error.go) 错误日志记录
- **用户友好提示**: 向用户提供友好的错误提示 来源：[internal/errors/messages.go:1-30](internal/errors/messages.go) 错误消息定义

## 安全控制分析

### 认证机制
| 认证方式 | 实现方式 | 使用场景 | 来源 |
|----------|----------|----------|------|
| JWT认证 | Bearer Token | API接口认证 | [internal/auth/jwt.go:1-50](internal/auth/jwt.go), [config/auth.yml:1-40](config/auth.yml) |
| API密钥 | API Key | 第三方集成 | [internal/auth/apikey.go:1-40](internal/auth/apikey.go), [config/auth.yml:1-40](config/auth.yml) |
| OAuth2 | OAuth2流程 | 用户授权 | [internal/auth/oauth2.go:1-60](internal/auth/oauth2.go), [config/auth.yml:1-40](config/auth.yml) |

### 权限控制
| 控制类型 | 控制策略 | 实现方式 | 来源 |
|----------|----------|----------|------|
| RBAC | 基于角色的访问控制 | 权限中间件 | [internal/auth/rbac.go:1-50](internal/auth/rbac.go), [internal/middleware/permission.go:1-40](internal/middleware/permission.go) |
| 资源权限 | 细粒度资源权限 | 资源检查器 | [internal/auth/resource.go:1-40](internal/auth/resource.go), [internal/middleware/resource.go:1-40](internal/middleware/resource.go) |
| 接口权限 | 接口级别权限控制 | 路由权限配置 | [internal/auth/route.go:1-40](internal/auth/route.go), [config/permissions.yml:1-30](config/permissions.yml) |

### 输入验证
| 验证类型 | 验证策略 | 实现方式 | 来源 |
|----------|----------|----------|------|
| 参数验证 | 请求参数格式和类型验证 | 验证中间件 | [internal/validators/:1-40](internal/validators/) 验证器, [internal/middleware/validation.go:1-40](internal/middleware/validation.go) |
| 业务验证 | 业务规则和约束验证 | 业务层验证 | [internal/services/:1-60](internal/services/) 业务服务, [internal/validators/business.go:1-40](internal/validators/business.go) |
| 安全验证 | SQL注入、XSS等安全验证 | 安全过滤器 | [internal/security/:1-50](internal/security/) 安全模块, [internal/middleware/security.go:1-40](internal/middleware/security.go) |

## 性能优化分析

### 缓存策略
| 缓存类型 | 缓存数据 | 过期时间 | 缓存策略 | 来源 |
|----------|----------|----------|----------|------|
| 用户信息 | 用户基本资料 | 30分钟 | 主动刷新 | [internal/cache/user.go:1-40](internal/cache/user.go), [config/cache.yml:1-50](config/cache.yml) |
| 配置信息 | 系统配置 | 1小时 | 定时刷新 | [internal/cache/config.go:1-40](internal/cache/config.go), [config/cache.yml:1-50](config/cache.yml) |
| API响应 | 查询结果 | 5分钟 | 被动刷新 | [internal/cache/api.go:1-40](internal/cache/api.go), [config/cache.yml:1-50](config/cache.yml) |
| 权限信息 | 用户权限 | 15分钟 | 主动刷新 | [internal/cache/permission.go:1-40](internal/cache/permission.go), [config/cache.yml:1-50](config/cache.yml) |

### 限流控制
| 限流类型 | 限流策略 | 限流阈值 | 实现方式 | 来源 |
|----------|----------|----------|----------|------|
| 请求限流 | 基于IP和用户的请求限流 | 1000/分钟 | 限流中间件 | [internal/middleware/ratelimit.go:1-40](internal/middleware/ratelimit.go), [config/ratelimit.yml:1-30](config/ratelimit.yml) |
| 并发控制 | 最大并发连接数控制 | 1000 | 连接池管理 | [internal/server/server.go:1-50](internal/server/server.go), [config/server.yml:1-30](config/server.yml) |
| 熔断保护 | 服务熔断和快速失败 | 错误率>50% | 熔断器 | [internal/circuitbreaker/:1-50](internal/circuitbreaker/) 熔断器实现, [config/circuitbreaker.yml:1-30](config/circuitbreaker.yml) |
| 降级处理 | 核心功能降级处理 | 负载>80% | 降级中间件 | [internal/middleware/degradation.go:1-40](internal/middleware/degradation.go), [config/degradation.yml:1-30](config/degradation.yml) |

## API文档分析

### Swagger/OpenAPI文档
| 文档类型 | 文档内容 | 维护方式 | 来源 |
|----------|----------|----------|------|
| 接口定义 | 完整的API接口定义 | 代码注释生成 | [api/swagger.yaml:1-100](api/swagger.yaml), [internal/docs/swagger.go:1-50](internal/docs/swagger.go) |
| 数据模型 | 请求和响应数据模型 | 代码注释生成 | [api/swagger.yaml:1-100](api/swagger.yaml), [internal/docs/swagger.go:1-50](internal/docs/swagger.go) |
| 错误处理 | 错误码和错误响应定义 | 手动维护 | [api/swagger.yaml:1-100](api/swagger.yaml), [docs/errors.md:1-40](docs/errors.md) |
| 示例代码 | 接口调用示例代码 | 手动维护 | [api/examples/:1-60](api/examples/) 示例代码, [docs/examples.md:1-50](docs/examples.md) |

### 版本控制
| 版本策略 | 版本管理方式 | 兼容性策略 | 来源 |
|----------|--------------|------------|------|
| URL版本 | URL路径包含版本号 | 向后兼容 | [internal/routes/version.go:1-40](internal/routes/version.go), [config/version.yml:1-30](config/version.yml) |
| 头部版本 | HTTP头部指定版本 | 向后兼容 | [internal/middleware/version.go:1-40](internal/middleware/version.go), [config/version.yml:1-30](config/version.yml) |
| 废弃通知 | 接口废弃和迁移通知 | 提前通知 | [api/deprecation/:1-40](api/deprecation/) 废弃通知, [docs/migration.md:1-50](docs/migration.md) |

## 总结

### API设计特点
- **RESTful设计**: 遵循REST设计原则，提供清晰的资源表示和操作 来源：[api/:1-100](api/) API定义, [internal/handlers/:1-80](internal/handlers/) 处理器实现
- **统一响应格式**: 所有API使用统一的响应格式和错误处理机制 来源：[internal/handlers/response.go:1-50](internal/handlers/response.go) 响应处理, [internal/middleware/error.go:1-50](internal/middleware/error.go) 错误处理
- **完善的认证授权**: 实现JWT认证和RBAC权限控制，保障API安全 来源：[internal/auth/:1-60](internal/auth/) 认证授权代码, [config/auth.yml:1-40](config/auth.yml) 权限配置
- **全面的性能优化**: 通过缓存、限流、熔断等措施提升API性能 来源：[internal/cache/:1-60](internal/cache/) 缓存配置, [internal/middleware/ratelimit.go:1-40](internal/middleware/ratelimit.go) 限流配置, [internal/circuitbreaker/:1-50](internal/circuitbreaker/) 熔断配置
- **完整的API文档**: 提供Swagger/OpenAPI文档和示例代码，便于API使用 来源：[api/swagger.yaml:1-100](api/swagger.yaml) API文档, [api/examples/:1-60](api/examples/) 示例代码

来源：[api/:1-100](api/) API定义分析, [internal/routes/:1-50](internal/routes/) 路由定义, [internal/handlers/:1-80](internal/handlers/) 处理器实现, [config/:1-40](config/) 配置文件分析
\`\`\`\`

${COMMON_OUTPUT_FILE_NAMING(workspace, SUBTASK_OUTPUT_FILENAMES.API_INTERFACE_TASK_FILE)}
`
