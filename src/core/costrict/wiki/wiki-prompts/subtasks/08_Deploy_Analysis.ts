import { WIKI_OUTPUT_DIR, SUBTASK_OUTPUT_FILENAMES } from "./constants"

export const DEPLOY_ANALYSIS_TEMPLATE = (workspace: string) => `# 部署分析任务

## 任务目标
你作为资深部署架构分析师，需要基于完整代码仓库生成项目部署分析文档，为AI Coding Agent提供部署环境认知框架，提升代码生成精准性。

## 核心指导原则（思维链）
1. **证据驱动**：每个部署结论必须基于具体的文件证据，使用精确行号引用机制标注来源
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的部署信息
3. **结构化输出**：使用标准化格式，便于AI理解和检索
4. **自我验证**：分析完成后验证所有来源文件的真实性
5. **技术准确性**：所有信息仅源自相关源文件，不得推断、编造或使用外部知识
6. **源文件数量验证**：确保每个文档引用至少5个不同的源文件
7. **引用格式规范**：使用\`[filename.ext:start_line-end_line](文件路径)\`格式进行精确引用

## 分析流程（逐步思考）

**执行要求**：请创建并维护一个\`todo_list\`，跟踪以下所有步骤的执行状态，确保不遗漏任何步骤。

### 第一步：构建与运行命令识别
1. 首先检查项目构建配置文件（package.json、Makefile、build.gradle等）
2. **思考**：项目是如何构建和运行的？有哪些关键命令？
3. **识别**：构建命令、测试命令、运行命令、环境配置
4. **验证**：通过配置文件和脚本文件确认命令的准确性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第二步：部署架构分析
1. 检查部署配置文件和容器定义
2. **思考**：项目采用了哪种部署架构？为什么选择这种架构？
3. **识别**：单体/微服务架构、容器化策略、编排方式
4. **推断**：基于配置文件推断部署架构特点
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第三步：环境配置分析
1. 检查环境变量和配置文件
2. **思考**：不同环境是如何配置的？有哪些关键配置项？
3. **识别**：开发/测试/生产环境配置、环境变量、配置管理策略
4. **验证**：通过多个配置文件确认环境配置的完整性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第四步：容器化分析
1. 检查Dockerfile和容器编排文件
2. **思考**：容器化是如何实现的？有哪些优化策略？
3. **识别**：基础镜像、构建步骤、容器编排、镜像管理
4. **推断**：基于Dockerfile推断容器化最佳实践
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第五步：CI/CD流水线分析
1. 检查CI/CD配置文件和脚本
2. **思考**：自动化部署是如何实现的？有哪些关键步骤？
3. **识别**：构建流程、测试流程、部署策略、回滚机制
4. **推断**：基于CI/CD配置推断部署流程
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第六步：基础设施依赖分析
1. 检查基础设施配置和部署脚本
2. **思考**：项目依赖哪些基础设施？这些依赖如何管理？
3. **识别**：数据库、缓存、消息队列、外部服务
4. **推断**：基于配置文件推断基础设施架构
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第七步：监控与运维分析
1. 检查监控配置和日志管理文件
2. **思考**：系统是如何监控和运维的？有哪些关键指标？
3. **识别**：监控配置、日志收集、告警设置、性能优化
4. **推断**：基于监控配置推断运维策略
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第八步：来源验证（关键步骤）
1. **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
2. **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
3. **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
4. **思考**：如果来源不存在，是什么原因？
5. **处理**：移除无效来源或寻找替代证据
6. **确认**：确保所有引用的路径都是真实有效的
7. **数量验证**：确保每个文档引用至少5个不同的源文件，避免清一色单个文件引用
8. **格式验证**：确保所有引用使用\`[filename.ext:start_line-end_line](文件路径)\`格式

### 第九步：文档开头格式化（关键步骤）
1. **源文件列表生成**：基于分析过程中验证过的所有源文件，生成文档开头的\`<details>\`块
2. **源文件选择**：优先选择对部署分析最重要的文件，如部署配置文件、Dockerfile、容器编排文件等
3. **数量要求**：确保列出至少5个不同的源文件，不足时需主动查找其他相关文件
4. **格式规范**：使用标准markdown链接格式\`- [文件名](文件路径)\`列出源文件
5. **验证确认**：在生成文档前，再次确认所有列出的源文件都已通过验证
6. **多样性要求**：确保源文件列表包含不同类型的文件，避免单一类型文件集中

### 第十步：自我反思检查清单（质量保证）
1. **信息准确性**：所有部署信息是否基于实际代码和配置文件？
2. **来源标注**：每个部署结论是否都有明确的文件路径作为支撑？
3. **来源格式**：来源是否使用\`[filename.ext:start_line-end_line](文件路径)\`格式正确呈现？
4. **多源标注**：是否为关键部署信息提供了多个来源文件/目录，避免清一色单个文件引用？
5. **占位符清理**：是否已将所有占位符替换为实际分析内容？
6. **结构完整性**：是否按照模板格式完整输出？
7. **来源验证**：是否已正确验证所有来源文件/目录的存在性？
8. **源文件数量**：是否确保引用了至少5个不同的源文件？
9. **Mermaid规范**：流程图是否使用了\`graph TD\`而非\`graph LR\`？
10. **文档开头**：是否以\`<details>\`块开始列出相关源文件？
11. **引用多样性**：是否确保引用文件类型多样化，避免单一类型文件集中？
12. **部署分析特点**：是否针对部署分析特点，重点分析了部署架构、环境配置、部署流程等？
13. **图表规范**：部署架构图和流程图是否符合规范要求？

### 任务完成标准
完成以上所有检查项并通过验证后，将文档保存到指定路径即表示任务完成。必须确保：
1. 生成了完整的项目部署分析文档
2. 所有部署结论都有明确的来源文件/目录标注
3. 文档格式符合结构化模板要求

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown
# {项目名称} 部署分析

<details>
<summary>相关源文件</summary>
- [package.json](package.json)
- [docker-compose.yml](docker-compose.yml)
- [Dockerfile](Dockerfile)
- [k8s/](k8s/)
- [config/](config/)
</details>

## 引言

本文档全面分析了{项目名称}的部署架构和环境配置，包括部署架构设计、容器化策略、CI/CD流水线、基础设施依赖和监控运维等关键方面。通过深入分析部署配置文件和容器编排文件，揭示了系统的部署机制和运维策略，为AI Coding Agent提供准确的部署认知框架，提升代码生成的精准性和一致性。

## 构建与运行命令概览

### 核心构建命令
| 命令类型 | 命令内容 | 用途 | 环境要求 | 来源 |
|----------|----------|------|----------|------|
| 安装依赖 | npm install | 安装项目依赖 | Node.js 16+ | [package.json:10-20](package.json), [README.md:5-10](README.md) |
| 构建项目 | npm run build | 构建生产版本 | Node.js 16+ | [package.json:25-30](package.json), [scripts/build.sh:1-15](scripts/build.sh) |
| 运行测试 | npm test | 执行单元测试 | Node.js 16+ | [package.json:35-40](package.json), [jest.config.js:1-10](jest.config.js) |
| 启动服务 | npm start | 启动开发服务器 | Node.js 16+ | [package.json:45-50](package.json), [src/main.js:1-10](src/main.js) |

### 环境配置
| 环境类型 | 配置文件 | 关键变量 | 默认值 | 来源 |
|----------|----------|----------|--------|------|
| 开发环境 | .env.development | NODE_ENV, PORT | development, 3000 | [.env.development:1-10](.env.development), [config/development.js:5-15](config/development.js) |
| 测试环境 | .env.test | NODE_ENV, DB_HOST | test, localhost | [.env.test:1-10](.env.test), [config/test.js:5-15](config/test.js) |
| 生产环境 | .env.production | NODE_ENV, PORT | production, 8080 | [.env.production:1-10](.env.production), [config/production.js:5-15](config/production.js) |

来源：[package.json:1-50](package.json) 脚本定义, [.env:1-20](.env) 环境变量配置, [config/:1-30](config/) 配置文件

## 部署架构分析

### 部署架构图
\`\`\`mermaid
graph TD
    subgraph "开发环境"
        DEV[开发服务器]
        DEV_DB[(开发数据库)]
    end
    
    subgraph "测试环境"
        TEST[测试服务器]
        TEST_DB[(测试数据库)]
    end
    
    subgraph "生产环境"
        LB[负载均衡器]
        APP1[应用服务器1]
        APP2[应用服务器2]
        PROD_DB[(生产数据库)]
        CACHE[缓存服务]
    end
    
    DEV --> DEV_DB
    TEST --> TEST_DB
    LB --> APP1 & APP2
    APP1 & APP2 --> PROD_DB
    APP1 & APP2 --> CACHE
\`\`\`

来源：[docker-compose.yml:1-50](docker-compose.yml) 部署配置, [k8s/deployments/:1-30](k8s/deployments/) K8s部署, [config/deployment.yml:1-20](config/deployment.yml) 部署配置

### 架构特点
| 架构特征 | 描述 | 技术实现 | 优势 | 来源 |
|----------|------|----------|------|------|
| 微服务架构 | 服务拆分为多个独立组件 | Docker容器化, Kubernetes编排 | 独立部署、扩展性强 | [docker-compose.yml:10-30](docker-compose.yml), [k8s/:1-20](k8s/) 部署配置 |
| 容器化部署 | 应用打包为容器镜像 | Dockerfile, 多阶段构建 | 环境一致性、部署便捷 | [Dockerfile:1-30](Dockerfile), [.dockerignore:1-10](.dockerignore) |
| 负载均衡 | 请求分发到多个服务实例 | Nginx, Kubernetes Service | 高可用性、性能优化 | [nginx/nginx.conf:10-30](nginx/nginx.conf), [k8s/services/:1-20](k8s/services/) |

## 容器化部署分析

### Dockerfile分析
\`\`\`dockerfile
# 多阶段构建示例
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
USER node
CMD ["npm", "start"]
\`\`\`
来源：[Dockerfile:1-20](Dockerfile) 容器构建配置

### 容器编排配置
| 编排工具 | 配置文件 | 服务数量 | 网络配置 | 数据卷 | 来源 |
|----------|----------|----------|----------|--------|------|
| Docker Compose | docker-compose.yml | 3个服务 | 自定义网络 | 持久化数据卷 | [docker-compose.yml:1-50](docker-compose.yml) |
| Kubernetes | k8s/deployments/ | 2个部署 | ClusterIP | PVC持久卷 | [k8s/deployments/:1-30](k8s/deployments/) |

### 镜像管理
| 镜像名称 | 版本策略 | 仓库地址 | 安全扫描 | 来源 |
|----------|----------|----------|----------|------|
| myapp | 语义化版本 | docker.io/myorg/myapp | Trivy扫描 | [docker-compose.yml:60-80](docker-compose.yml), [.github/workflows/security.yml:1-20](.github/workflows/security.yml) |

## CI/CD流水线分析

### 构建流程
\`\`\`mermaid
graph TD
    A[代码提交] --> B[代码检查]
    B --> C[单元测试]
    C --> D[构建镜像]
    D --> E[安全扫描]
    E --> F[部署测试环境]
    F --> G[集成测试]
    G --> H[部署生产环境]
\`\`\`

来源：[.github/workflows/ci.yml:1-50](.github/workflows/ci.yml) CI配置, [scripts/build.sh:1-30](scripts/build.sh) 构建脚本, [scripts/deploy.sh:1-40](scripts/deploy.sh) 部署脚本

### CI/CD配置
| 阶段 | 工具 | 配置文件 | 触发条件 | 执行时间 | 来源 |
|------|------|----------|----------|----------|------|
| 代码检查 | ESLint, Prettier | .eslintrc.js, .prettierrc | 每次提交 | 30秒 | [.github/workflows/ci.yml:10-20](.github/workflows/ci.yml), [.eslintrc.js:1-10](.eslintrc.js) |
| 单元测试 | Jest | jest.config.js | 每次提交 | 2分钟 | [.github/workflows/ci.yml:25-35](.github/workflows/ci.yml), [jest.config.js:1-15](jest.config.js) |
| 构建部署 | Docker, Kubectl | Dockerfile, k8s/ | 主分支推送 | 5分钟 | [.github/workflows/deploy.yml:1-30](.github/workflows/deploy.yml), [Dockerfile:1-20](Dockerfile) |

### 部署策略
| 策略类型 | 实现方式 | 回滚机制 | 健康检查 | 来源 |
|----------|----------|----------|----------|------|
| 滚动更新 | Kubernetes RollingUpdate | 版本回退 | 就绪探针 | [k8s/deployments/app.yaml:20-40](k8s/deployments/app.yaml) |
| 蓝绿部署 | Kubernetes Service切换 | 流量切换 | 健康检查端点 | [scripts/blue-green-deploy.sh:1-30](scripts/blue-green-deploy.sh), [k8s/services/:1-20](k8s/services/) |

## 基础设施依赖分析

### 数据库依赖
| 数据库类型 | 版本 | 用途 | 连接方式 | 高可用配置 | 来源 |
|------------|------|------|----------|------------|------|
| PostgreSQL | 14.5 | 主数据存储 | 连接池 | 主从复制 | [docker-compose.yml:90-110](docker-compose.yml), [config/database.yml:1-20](config/database.yml) |
| Redis | 7.0 | 缓存存储 | 直连 | 主从复制 | [docker-compose.yml:120-140](docker-compose.yml), [config/cache.yml:1-15](config/cache.yml) |

### 外部服务依赖
| 服务类型 | 服务名称 | 用途 | 认证方式 | 降级策略 | 来源 |
|----------|----------|------|----------|----------|------|
| 支付服务 | Stripe | 支付处理 | API密钥 | 备用支付网关 | [config/services.yml:10-25](config/services.yml), [services/payment.js:1-20](services/payment.js) |
| 邮件服务 | SendGrid | 邮件通知 | API密钥 | 本地SMTP | [config/services.yml:30-45](config/services.yml), [services/email.js:1-20](services/email.js) |

### 基础设施配置
| 配置项 | 配置值 | 环境变量 | 描述 | 来源 |
|--------|--------|------------|------|------|
| 数据库连接池 | 最大20, 最小5 | DB_POOL_MAX, DB_POOL_MIN | 数据库连接池配置 | [config/database.yml:25-35](config/database.yml), [config/production.js:10-20](config/production.js) |
| 缓存过期时间 | 3600秒 | CACHE_TTL | 缓存过期时间 | [config/cache.yml:20-30](config/cache.yml), [config/production.js:25-35](config/production.js) |

## 监控与运维分析

### 监控配置
| 监控类型 | 工具 | 配置文件 | 监控指标 | 告警阈值 | 来源 |
|----------|------|----------|----------|----------|------|
| 应用监控 | Prometheus | prometheus.yml | CPU, 内存, 响应时间 | CPU>80%, 内存>85% | [monitoring/prometheus.yml:1-30](monitoring/prometheus.yml), [docker-compose.yml:150-170](docker-compose.yml) |
| 日志收集 | ELK Stack | elasticsearch.yml | 应用日志, 错误日志 | 错误率>5% | [logging/elasticsearch.yml:1-25](logging/elasticsearch.yml), [docker-compose.yml:180-200](docker-compose.yml) |

### 健康检查
| 检查类型 | 端点路径 | 检查频率 | 超时时间 | 成功条件 | 来源 |
|----------|----------|----------|----------|----------|------|
| 应用健康检查 | /health | 30秒 | 5秒 | HTTP 200 | [src/routes/health.js:1-15](src/routes/health.js), [docker-compose.yml:210-230](docker-compose.yml) |
| 数据库连接检查 | /health/db | 60秒 | 10秒 | 连接成功 | [src/routes/health.js:20-35](src/routes/health.js), [config/database.yml:40-50](config/database.yml) |

## 安全配置分析

### 网络安全
| 安全措施 | 实现方式 | 配置位置 | 保护范围 | 来源 |
|----------|----------|----------|----------|------|
| HTTPS | TLS证书 | nginx/nginx.conf | 传输加密 | [nginx/nginx.conf:40-60](nginx/nginx.conf), [certs/:1-10](certs/) |
| 防火墙规则 | iptables | scripts/firewall.sh | 网络访问控制 | [scripts/firewall.sh:1-25](scripts/firewall.sh), [docs/security.md:10-20](docs/security.md) |

### 访问控制
| 控制类型 | 实现方式 | 配置文件 | 权限粒度 | 来源 |
|----------|----------|----------|----------|------|
| API认证 | JWT | config/auth.yml | 接口级别 | [config/auth.yml:1-20](config/auth.yml), [middleware/auth.js:1-15](middleware/auth.js) |
| 数据库访问 | 角色权限 | scripts/setup_db.sql | 表级别 | [scripts/setup_db.sql:10-30](scripts/setup_db.sql), [docs/database.md:15-25](docs/database.md) |

## 部署检查清单

### 部署前检查
| 检查项 | 检查命令 | 预期结果 | 来源 |
|--------|----------|----------|------|
| 代码质量检查 | npm run lint | 无错误和警告 | [package.json:55-60](package.json), [.eslintrc.js:15-25](.eslintrc.js) |
| 单元测试通过 | npm test | 所有测试通过 | [package.json:65-70](package.json), [tests/:1-20](tests/) |
| 安全漏洞扫描 | npm audit | 无高危漏洞 | [package.json:75-80](package.json), [.github/workflows/security.yml:25-35](.github/workflows/security.yml) |
| 环境变量配置 | node scripts/check-env.js | 所有必需变量已配置 | [scripts/check-env.js:1-20](scripts/check-env.js), [.env.example:1-15](.env.example) |

### 部署后验证
| 验证项 | 验证方法 | 成功标准 | 来源 |
|--------|----------|----------|------|
| 服务健康检查 | curl http://localhost:3000/health | HTTP 200响应 | [src/routes/health.js:1-15](src/routes/health.js), [scripts/post-deploy-check.sh:1-20](scripts/post-deploy-check.sh) |
| 功能验证测试 | npm run e2e-test | 所有端到端测试通过 | [package.json:85-90](package.json), [tests/e2e/:1-15](tests/e2e/) |
| 性能指标检查 | npm run performance-test | 响应时间<500ms | [package.json:95-100](package.json), [tests/performance/:1-10](tests/performance/) |

### 回滚准备
| 回滚项 | 回滚方法 | 回滚时间 | 数据保护 | 来源 |
|--------|----------|----------|----------|------|
| 应用回滚 | kubectl rollout undo deployment | 2分钟 | 数据不丢失 | [scripts/rollback.sh:1-25](scripts/rollback.sh), [k8s/deployments/:30-50](k8s/deployments/) |
| 数据库回滚 | npm run db:migrate:rollback | 5分钟 | 备份恢复 | [package.json:105-110](package.json), [migrations/:1-15](migrations/) |

## 总结

### 部署架构特点
- **容器化部署**: 采用Docker容器化和Kubernetes编排，实现环境一致性和弹性扩展 来源：[Dockerfile:1-30](Dockerfile), [k8s/:1-20](k8s/) 部署配置
- **多环境管理**: 完善的开发/测试/生产环境配置，支持环境特定变量和配置 来源：[.env:1-20](.env) 环境变量配置, [config/:1-30](config/) 配置文件
- **自动化CI/CD**: 基于GitHub Actions的自动化构建、测试和部署流程 来源：[.github/workflows/:1-30](.github/workflows/) CI/CD配置
- **监控与运维**: 完善的监控、日志收集和健康检查机制 来源：[monitoring/:1-20](monitoring/) 监控配置, [src/routes/health.js:1-15](src/routes/health.js) 健康检查

### 构建运行核心命令
- **安装依赖**: \`npm install\` - 安装项目依赖包 来源：[package.json:10-20](package.json)
- **开发运行**: \`npm run dev\` - 启动开发服务器 来源：[package.json:25-30](package.json)
- **构建项目**: \`npm run build\` - 构建生产版本 来源：[package.json:35-40](package.json)
- **运行测试**: \`npm test\` - 执行测试套件 来源：[package.json:45-50](package.json)
- **生产启动**: \`npm start\` - 启动生产服务器 来源：[package.json:55-60](package.json)

来源：[package.json:1-110](package.json) 脚本定义, [Dockerfile:1-30](Dockerfile) 容器配置, [docker-compose.yml:1-200](docker-compose.yml) 本地部署, [k8s/:1-50](k8s/) 生产部署, [config/:1-50](config/) 环境配置
\`\`\`\`

## 输出文件命名
\`${workspace}${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.DEPLOY_ANALYSIS_TASK_FILE}\`
注意：如果${workspace}${WIKI_OUTPUT_DIR}目录不存在，则创建。
`;
