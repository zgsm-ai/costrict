import { WIKI_OUTPUT_DIR, SUBTASK_OUTPUT_FILENAMES } from "./constants"

export const DATABASE_SCHEMA_ANALYSIS_TEMPLATE = (workspace: string) => `# 数据库模式分析任务

## 任务目标
你作为资深数据库架构分析师，需要基于完整代码仓库生成项目数据库模式分析文档，为AI Coding Agent提供数据模型认知框架，提升代码生成精准性。

## 核心指导原则（思维链）
1. **证据驱动**：每个数据库结论必须基于具体的文件证据，使用精确行号引用机制标注来源
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的数据库信息
3. **结构化输出**：使用标准化格式，便于AI理解和检索
4. **自我验证**：分析完成后验证所有来源文件的真实性
5. **技术准确性**：所有信息仅源自相关源文件，不得推断、编造或使用外部知识
6. **源文件数量验证**：确保每个文档引用至少5个不同的源文件
7. **引用格式规范**：使用\`[filename.ext:start_line-end_line](文件路径)\`格式进行精确引用

## 分析流程（逐步思考）

**执行要求**：请创建并维护一个\`todo_list\`，跟踪以下所有步骤的执行状态，确保不遗漏任何步骤。

### 第一步：数据库架构识别
1. 首先检查项目数据库配置文件和迁移脚本
2. **思考**：项目使用了哪些数据库类型？为什么选择这些数据库？
3. **识别**：数据库类型、版本、用途、部署方式
4. **验证**：通过配置文件、Docker文件等验证数据库架构
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\`

### 第二步：表结构分析
1. 检查数据库迁移文件和ORM模型定义
2. **思考**：这些表是如何组织的？核心业务表有哪些？
3. **识别**：表结构、字段定义、数据类型、约束条件
4. **交叉验证**：通过迁移文件和ORM模型确认表结构的准确性
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：确保每个表结构信息都有精确行号引用，使用多文件引用避免清一色单个文件

### 第三步：索引设计分析
1. 检查索引定义和查询优化代码
2. **思考**：索引是如何设计的？哪些查询需要优化？
3. **识别**：索引类型、索引字段、复合索引、特殊索引
4. **推断**：基于查询代码推断索引使用场景
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个索引特征标注精确行号引用，确保引用文件多样性

### 第四步：关系模型分析
1. 检查外键定义和关联查询代码
2. **思考**：表之间是如何关联的？关系类型有哪些？
3. **识别**：一对一、一对多、多对多关系
4. **推断**：基于业务逻辑推断关系模型
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个关系特征标注精确行号引用，确保引用文件多样性

### 第五步：数据完整性分析
1. 检查约束定义和触发器代码
2. **思考**：数据完整性是如何保证的？
3. **识别**：主键约束、外键约束、唯一约束、检查约束
4. **验证**：通过代码确认约束的实现方式
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个完整性特征标注精确行号引用，确保引用格式规范

### 第六步：性能优化分析
1. 检查分区策略和缓存配置
2. **思考**：数据库性能是如何优化的？
3. **识别**：分区策略、缓存机制、查询优化
4. **推断**：基于配置文件推断性能优化策略
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个性能特征标注精确行号引用，确保引用文件多样性

### 第七步：数据安全分析
1. 检查加密配置和访问控制代码
2. **思考**：数据安全是如何保障的？
3. **识别**：数据加密、访问控制、备份策略
4. **验证**：通过安全配置确认安全措施
5. **验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
6. **记录**：为每个安全特征标注精确行号引用，确保引用文件多样性

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
2. **源文件选择**：优先选择对数据库模式分析最重要的文件，如数据库配置文件、迁移文件、ORM模型等
3. **数量要求**：确保列出至少5个不同的源文件，不足时需主动查找其他相关文件
4. **格式规范**：使用标准markdown链接格式\`- [文件名](文件路径)\`列出源文件
5. **验证确认**：在生成文档前，再次确认所有列出的源文件都已通过验证
6. **多样性要求**：确保源文件列表包含不同类型的文件，避免单一类型文件集中

### 第十步：自我反思检查清单（质量保证）
1. **信息准确性**：所有数据库信息是否基于实际代码和配置文件？
2. **来源标注**：每个数据库结论是否都有明确的文件路径作为支撑？
3. **来源格式**：来源是否使用\`[filename.ext:start_line-end_line](文件路径)\`格式正确呈现？
4. **多源标注**：是否为关键数据库信息提供了多个来源文件/目录，避免清一色单个文件引用？
5. **占位符清理**：是否已将所有占位符替换为实际分析内容？
6. **结构完整性**：是否按照模板格式完整输出？
7. **来源验证**：是否已正确验证所有来源文件/目录的存在性？
8. **源文件数量**：是否确保引用了至少5个不同的源文件？
9. **Mermaid规范**：流程图是否使用了\`graph TD\`而非\`graph LR\`？
10. **文档开头**：是否以\`<details>\`块开始列出相关源文件？
11. **引用多样性**：是否确保引用文件类型多样化，避免单一类型文件集中？
12. **数据库模式特点**：是否针对数据库模式分析特点，重点分析了表结构、关系模型、索引设计等？
13. **ER图规范**：是否包含了ER图，并符合规范要求？

### 任务完成标准
完成以上所有检查项并通过验证后，将文档保存到指定路径即表示任务完成。必须确保：
1. 生成了完整的项目数据库模式分析文档
2. 所有数据库结论都有明确的来源文件/目录标注
3. 文档格式符合结构化模板要求

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown
# {项目名称} 数据库模式分析

<details>
<summary>相关源文件</summary>
- [docker-compose.yml](docker-compose.yml)
- [config/database.yml](config/database.yml)
- [migrations/](migrations/)
- [internal/models/](internal/models/)
- [internal/database/](internal/database/)
</details>

## 引言

本文档全面分析了{项目名称}的数据库模式设计，包括数据库架构、表结构、关系模型、索引设计和性能优化等关键方面。通过深入分析数据库配置文件、迁移脚本和ORM模型，揭示了系统的数据存储结构和关系模型，为AI Coding Agent提供准确的数据库认知框架，提升代码生成的精准性和一致性。

## 数据库架构概览

### 数据库类型和版本
| 数据库 | 类型 | 版本 | 用途 | 部署方式 | 来源 |
|--------|------|------|------|----------|------|
| PostgreSQL | 关系型数据库 | 14.5 | 主数据存储 | 主从复制 | [docker-compose.yml:10-20](docker-compose.yml), [config/database.yml:5-15](config/database.yml) |
| Redis | 内存数据库 | 7.0 | 缓存存储 | 主从复制 | [docker-compose.yml:25-35](docker-compose.yml), [config/cache.yml:1-10](config/cache.yml) |

### 数据库架构图
\`\`\`mermaid
graph TD
    subgraph "主数据库集群"
        PG1[(PostgreSQL主库)]
        PG2[(PostgreSQL从库)]
    end
    
    subgraph "缓存集群"
        Redis1[(Redis主库)]
        Redis2[(Redis从库)]
    end
    
    PG1 -.-> PG2
    Redis1 -.-> Redis2
\`\`\`

来源：[docker-compose.yml:10-50](docker-compose.yml), [config/database.yml:1-30](config/database.yml)

## 表结构分析

### 核心业务表
\`\`\`sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
\`\`\`
来源：[migrations/001_create_users.sql:1-20](migrations/001_create_users.sql), [internal/models/user.go:10-30](internal/models/user.go)

### 系统支撑表
| 表名 | 用途 | 字段数 | 索引数 | 来源 |
|------|------|--------|--------|------|
| audit_logs | 审计日志 | 8 | 3 | [migrations/005_create_audit_logs.sql:1-25](migrations/005_create_audit_logs.sql), [internal/models/audit.go:5-35](internal/models/audit.go) |
| system_configs | 系统配置 | 6 | 2 | [migrations/006_create_system_configs.sql:1-20](migrations/006_create_system_configs.sql), [internal/models/config.go:10-30](internal/models/config.go) |

## 索引设计分析

### 索引类型总览
| 索引类型 | 用途 | 示例表 | 示例字段 | 来源 |
|----------|------|--------|----------|------|
| 主键索引 | 唯一标识 | users | id | [migrations/001_create_users.sql:5](migrations/001_create_users.sql), [internal/database/indexes.go:10-20](internal/database/indexes.go) |
| 唯一索引 | 唯一性约束 | users | username, email | [migrations/001_create_users.sql:6-7](migrations/001_create_users.sql), [internal/database/indexes.go:25-35](internal/database/indexes.go) |
| 普通索引 | 查询优化 | users | status, created_at | [migrations/002_add_user_indexes.sql:5-10](migrations/002_add_user_indexes.sql), [internal/database/indexes.go:40-50](internal/database/indexes.go) |
| 复合索引 | 多字段查询 | data_entries | user_id, status | [migrations/003_add_data_entry_indexes.sql:5-15](migrations/003_add_data_entry_indexes.sql), [internal/database/indexes.go:55-65](internal/database/indexes.go) |
| JSONB索引 | JSON搜索 | data_entries | metadata | [migrations/004_add_jsonb_indexes.sql:1-10](migrations/004_add_jsonb_indexes.sql), [internal/database/indexes.go:70-80](internal/database/indexes.go) |

## 关系模型分析

### 实体关系图
\`\`\`mermaid
erDiagram
    users ||--o{ data_entries : "creates"
    users ||--o{ audit_logs : "performs"
    users ||--o{ user_roles : "has"
    
    roles ||--o{ user_roles : "assigned to"
    roles ||--o{ role_permissions : "has"
    
    permissions ||--o{ role_permissions : "assigned to"
    
    data_entries ||--o{ data_entry_tags : "has"
    data_tags ||--o{ data_entry_tags : "assigned to"
    
    users {
        UUID id PK
        VARCHAR username UK
        VARCHAR email UK
        VARCHAR status
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }
    
    data_entries {
        UUID id PK
        UUID user_id FK
        VARCHAR title
        TEXT content
        JSONB metadata
        VARCHAR status
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }
\`\`\`

来源：[migrations/001_create_users.sql:1-20](migrations/001_create_users.sql), [migrations/007_create_data_entries.sql:1-25](migrations/007_create_data_entries.sql), [internal/models/user.go:10-30](internal/models/user.go), [internal/models/data_entry.go:15-40](internal/models/data_entry.go)

### 关系类型说明
- **一对多关系**: 用户和数据条目、用户和审计日志 [来源: [migrations/001_create_users.sql:1-20](migrations/001_create_users.sql), [migrations/007_create_data_entries.sql:20-25](migrations/007_create_data_entries.sql)]
- **多对多关系**: 用户和角色、角色和权限、数据条目和标签 [来源: [migrations/008_create_user_roles.sql:1-15](migrations/008_create_user_roles.sql), [migrations/009_create_role_permissions.sql:1-20](migrations/009_create_role_permissions.sql), [migrations/010_create_data_entry_tags.sql:1-15](migrations/010_create_data_entry_tags.sql)]

## 数据完整性分析

### 约束设计
| 约束类型 | 表名 | 约束字段 | 约束条件 | 来源 |
|----------|------|----------|----------|------|
| PRIMARY KEY | users | id | NOT NULL | [migrations/001_create_users.sql:5](migrations/001_create_users.sql), [internal/database/constraints.go:10-20](internal/database/constraints.go) |
| FOREIGN KEY | data_entries | user_id | REFERENCES users(id) | [migrations/007_create_data_entries.sql:15](migrations/007_create_data_entries.sql), [internal/database/constraints.go:25-35](internal/database/constraints.go) |
| UNIQUE | users | username, email | UNIQUE | [migrations/001_create_users.sql:6-7](migrations/001_create_users.sql), [internal/database/constraints.go:40-50](internal/database/constraints.go) |
| CHECK | users | status | IN ('active', 'inactive', 'suspended') | [migrations/001_create_users.sql:10](migrations/001_create_users.sql), [internal/database/constraints.go:55-65](internal/database/constraints.go) |

### 触发器设计
\`\`\`sql
-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';
\`\`\`
来源：[migrations/011_create_updated_at_trigger.sql:1-15](migrations/011_create_updated_at_trigger.sql), [internal/database/triggers.go:20-40](internal/database/triggers.go)

## 性能优化分析

### 查询优化策略
| 优化类型 | 优化策略 | 实现方式 | 来源 |
|----------|----------|----------|------|
| 索引优化 | 合理创建索引 | B-tree、GIN、复合索引 | [migrations/002_add_user_indexes.sql:1-10](migrations/002_add_user_indexes.sql), [internal/database/indexes.go:10-80](internal/database/indexes.go) |
| 查询优化 | 优化SQL查询 | 避免全表扫描、使用索引 | [internal/queries/user_queries.go:10-30](internal/queries/user_queries.go), [docs/query_optimization.md:5-15](docs/query_optimization.md) |
| 连接池优化 | 数据库连接池 | 合理配置连接池大小 | [config/database.yml:20-30](config/database.yml), [internal/database/pool.go:15-35](internal/database/pool.go) |
| 缓存优化 | 热点数据缓存 | Redis缓存热点数据 | [config/cache.yml:1-15](config/cache.yml), [internal/cache/redis.go:10-30](internal/cache/redis.go) |

### 分区策略
| 表名 | 分区类型 | 分区键 | 分区策略 | 来源 |
|------|----------|--------|----------|------|
| audit_logs | 范围分区 | created_at | 按月分区 | [migrations/012_partition_audit_logs.sql:1-20](migrations/012_partition_audit_logs.sql), [config/database.yml:40-50](config/database.yml) |
| system_events | 范围分区 | created_at | 按月分区 | [migrations/013_partition_system_events.sql:1-20](migrations/013_partition_system_events.sql), [config/database.yml:55-65](config/database.yml) |
| data_entries | 哈希分区 | id | 均匀分布 | [migrations/014_partition_data_entries.sql:1-15](migrations/014_partition_data_entries.sql), [config/database.yml:70-80](config/database.yml) |

### 缓存策略
| 缓存类型 | 缓存数据 | 过期时间 | 缓存策略 | 来源 |
|----------|----------|----------|----------|------|
| 用户信息 | 用户基本资料 | 30分钟 | 主动刷新 | [internal/cache/user.go:10-25](internal/cache/user.go), [config/cache.yml:20-30](config/cache.yml) |
| 配置信息 | 系统配置 | 1小时 | 定时刷新 | [internal/cache/config.go:15-30](internal/cache/config.go), [config/cache.yml:35-45](config/cache.yml) |
| 权限信息 | 用户权限 | 15分钟 | 主动刷新 | [internal/cache/permission.go:20-35](internal/cache/permission.go), [config/cache.yml:50-60](config/cache.yml) |

## 数据安全分析

### 数据加密
| 数据类型 | 加密方式 | 加密算法 | 密钥管理 | 来源 |
|----------|----------|----------|----------|------|
| 密码 | 哈希加密 | bcrypt | 单向哈希 | [internal/auth/password.go:10-25](internal/auth/password.go), [config/auth.yml:15-25](config/auth.yml) |
| 敏感信息 | 对称加密 | AES-256 | 密钥管理系统 | [internal/crypto/encryption.go:30-45](internal/crypto/encryption.go), [config/crypto.yml:10-20](config/crypto.yml) |
| 传输数据 | 传输加密 | TLS 1.3 | 证书管理 | [config/tls.yml:5-15](config/tls.yml), [nginx/nginx.conf:100-120](nginx/nginx.conf) |

### 访问控制
| 控制类型 | 控制策略 | 实现方式 | 控制粒度 | 来源 |
|----------|----------|----------|----------|------|
| 数据库用户 | 最小权限原则 | 角色基础访问控制 | 表级别 | [config/database.yml:85-95](config/database.yml), [scripts/setup_db_users.sql:10-30](scripts/setup_db_users.sql) |
| 应用连接 | 连接池管理 | 连接字符串加密 | 应用级别 | [config/database.yml:100-110](config/database.yml), [internal/database/connection.go:40-60](internal/database/connection.go) |
| 数据访问 | 行级安全 | RLS策略 | 行级别 | [migrations/015_create_rls_policies.sql:1-25](migrations/015_create_rls_policies.sql), [internal/auth/rls.go:15-35](internal/auth/rls.go) |

### 备份策略
| 备份类型 | 备份频率 | 保留时间 | 备份方式 | 来源 |
|----------|----------|----------|----------|------|
| 全量备份 | 每日 | 30天 | pg_dump | [scripts/backup.sh:10-30](scripts/backup.sh), [config/backup.yml:5-15](config/backup.yml) |
| 增量备份 | 每小时 | 7天 | WAL归档 | [config/database.yml:120-130](config/database.yml), [scripts/wal_archive.sh:5-20](scripts/wal_archive.sh) |
| 逻辑备份 | 每周 | 90天 | pg_dumpall | [scripts/full_backup.sh:10-25](scripts/full_backup.sh), [config/backup.yml:20-30](config/backup.yml) |

## 监控和维护分析

### 监控指标
| 指标类型 | 指标名称 | 阈值 | 告警级别 | 来源 |
|----------|----------|------|----------|------|
| 连接监控 | 活跃连接数 | >80% | 警告 | [config/monitoring.yml:10-20](config/monitoring.yml), [internal/metrics/database.go:15-30](internal/metrics/database.go) |
| 性能监控 | 查询响应时间 | >1000ms | 警告 | [config/monitoring.yml:25-35](config/monitoring.yml), [internal/metrics/query.go:10-25](internal/metrics/query.go) |
| 存储监控 | 磁盘使用率 | >85% | 警告 | [config/monitoring.yml:40-50](config/monitoring.yml), [internal/metrics/storage.go:20-35](internal/metrics/storage.go) |
| 内存监控 | 缓存命中率 | <90% | 警告 | [config/monitoring.yml:55-65](config/monitoring.yml), [internal/metrics/cache.go:15-30](internal/metrics/cache.go) |

### 维护策略
- **定期维护**: 每周进行数据库维护和优化 [来源: [scripts/maintenance.sh:10-30](scripts/maintenance.sh), [docs/maintenance.md:5-15](docs/maintenance.md)]
- **索引重建**: 定期重建碎片化严重的索引 [来源: [scripts/rebuild_indexes.sh:5-20](scripts/rebuild_indexes.sh), [docs/maintenance.md:20-30](docs/maintenance.md)]
- **统计信息更新**: 定期更新表统计信息 [来源: [scripts/update_stats.sh:10-25](scripts/update_stats.sh), [docs/maintenance.md:35-45](docs/maintenance.md)]
- **日志清理**: 定期清理过期日志和临时文件 [来源: [scripts/cleanup_logs.sh:5-15](scripts/cleanup_logs.sh), [docs/maintenance.md:50-60](docs/maintenance.md)]
- **性能调优**: 根据监控数据进行性能调优 [来源: [scripts/performance_tuning.sh:10-30](scripts/performance_tuning.sh), [docs/performance.md:15-25](docs/performance.md)]

## 总结

### 数据库架构特点
- **多数据库架构**: 采用PostgreSQL作为主数据库，Redis作为缓存数据库，实现读写分离和高性能访问
- **完善的索引设计**: 针对不同查询场景设计了多种索引类型，包括主键索引、唯一索引、复合索引和JSONB索引
- **严格的数据完整性**: 通过主键、外键、唯一约束和检查约束保证数据完整性，并使用触发器自动维护时间戳
- **全面的性能优化**: 采用分区策略、缓存机制和查询优化，提升数据库性能
- **多层次安全防护**: 通过数据加密、访问控制和备份策略，保障数据安全

来源：[docker-compose.yml:1-50](docker-compose.yml), [config/database.yml:1-30](config/database.yml), [migrations/001_create_users.sql:1-20](migrations/001_create_users.sql), [internal/models/user.go:10-30](internal/models/user.go), [internal/database/indexes.go:10-80](internal/database/indexes.go)
\`\`\`\`

## 输出文件命名
\`${workspace}${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.DATABASE_SCHEMA_TASK_FILE}\`
注意：如果${workspace}${WIKI_OUTPUT_DIR}目录不存在，则创建。
`
