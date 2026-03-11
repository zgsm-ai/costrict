# Security Review Agent

> 基于 Claude Code 的代码安全审计技能
> 支持模式: quick / standard / deep

> **执行入口**: 本文件由 SKILL.md Execution Controller 的 Step 2 触发加载。
> deep 模式下本文件为必读文档。本文件提供执行细节（怎么做），SKILL.md 提供执行控制流（做什么、什么顺序）。

---

---

## Trigger

当用户请求代码审计、安全审计、漏洞扫描、代码安全检查时触发此技能。常见触发词：

- "审计这个项目"
- "检查代码安全"
- "找出安全漏洞"
- "/audit"
- "/security-review"

---

## Core Philosophy

### 防幻觉规则 (Anti-Hallucination Rules) - 强制执行

> 文件验证机制，大幅减少误报

```
⚠️ 严禁幻觉行为 - 违反此规则的发现将被视为无效

1. 先验证文件存在，再报告漏洞
   ✗ 禁止基于"典型项目结构"猜测文件路径
   ✗ 禁止假设 config/database.py、app/api.py 等文件存在
   ✓ 必须使用 Read/Glob 工具确认文件存在后才能报告

2. 引用真实代码
   ✗ 禁止凭记忆或推测编造代码片段
   ✗ 禁止编造行号
   ✓ code_snippet 必须来自 Read 工具的实际输出
   ✓ 行号必须在文件实际行数范围内

3. 匹配项目技术栈
   ✗ Rust 项目不会有 .py 文件
   ✗ 前端项目不会有后端数据库配置
   ✓ 仔细观察识别到的技术栈信息

4. 知识库 ≠ 项目代码
   ✗ 知识库中的代码示例是通用示例，不是目标项目的代码
   ✗ 不要因为知识库说"这种模式常见"就假设项目中存在
   ✓ 必须在实际代码中验证后才能报告漏洞
```

**错误示例 (幻觉来源)**:
```
1. 查询 auth_bypass 知识 → 看到 JWT 示例
2. 没有在项目中找到 JWT 代码
3. 仍然报告 "JWT 认证绕过漏洞"  ← 这是幻觉！
```

**正确示例**:
```
1. 查询 auth_bypass 知识 → 了解认证绕过的概念
2. 使用 Read 工具读取项目的认证代码
3. 只有**实际看到**有问题的代码才报告漏洞
4. file_path 必须是你**实际读取过**的文件
```

**核心原则: 宁可漏报，不可误报。质量优于数量。**

---

### 激进扫描原则 (GO SUPER HARD)

```
核心信条:
- 真实漏洞需要深度挖掘，不要浅尝辄止
- 测试每个参数、每个端点、每个边界情况
- 组合低危漏洞构建高危攻击路径
- 只报告有实际影响的漏洞（能造成真实危害）
- 持续迭代直到穷尽所有攻击向量
```

### 攻击链思维 (Attack Chain First)

**攻击链发现方法** (不是记住已知链，而是学会构建新链):

```
对每个 Critical/High 漏洞，执行链式推导:
1. 前置条件 → 需要认证? → 有无认证绕过可串联?
2. 利用结果 → 信息泄露/代码执行/权限提升?
3. 结果转化 → 该结果能否作为下一个漏洞的输入?
4. 迭代延伸 → 重复 2-3 直到无法扩展
5. 整体评估 → 组合后的影响 > 单个漏洞的影响?

优先级: RCE > 任意文件读写 > 认证绕过 > 注入 > 信息泄漏
```

**常见链式模式** (启发，非穷举 → LLM 应基于发现构建新链):

| 起点类型 | 典型延伸路径 | 最终影响 |
|---------|-------------|---------|
| 认证绕过 | → 管理API/SSRF/文件上传/JDBC注入 → RCE/云接管 | 全系统沦陷 → ... |
| 信息泄露 | → 密钥获取 → Token伪造 → 认证绕过 → 功能滥用 | 权限提升 → ... |
| SSRF | → 云元数据/内网服务/Redis/数据库 → 凭据窃取/RCE | 内网渗透 → ... |
| 注入(SQL/命令) | → 数据外泄/文件写入/系统命令 → 持久化控制 | 数据+系统 → ... |
| 配置缺陷 | → CORS/Actuator/Debug端点 → 数据窃取/凭据暴露 | 信息泄露 → ... |
| 反序列化 | → Gadget Chain → RCE / 任意文件操作 | 服务器控制 → ... |

**⚠️ 真正高价值的攻击链往往是项目特有的，不在任何模板中。LLM 应基于实际发现动态构建，但每个起点最多延伸 3 层（避免无限递归）。**

### 审计工作原则

```
精确可利用性:
- 标注具体 文件路径:行号
- 判断可利用前提条件
- 如未验证可利用性，标注 [需验证]

最小上下文:
- 按功能域逐块审计
- 记录路径+结论
- 每块完成后勾选确认

反隧道视野 (Anti-Tunnel-Vision):
- 单一模块/攻击向量不得消耗 Phase 3 超过 30% 的时间
- 当同类文件 ≥3 个共享相同模式时，合并为 1 个发现 + 对比表，而非逐个深挖
- 每完成一个模块，强制问: "还有哪些攻击面我没碰过？"
- 广度覆盖率 < 60% 时禁止进入深度审计

Agent 同步纪律:
- Agent 必须在 Phase 1 完成后立即启动，不得等主线程深挖结束
- 报告必须等所有 Agent 完成后才能生成最终版
- Agent 未完成前仅输出"中间进度"，不写最终报告
```

---

## Scan Modes

| 模式     | 适用场景                 | 范围                         |
| -------- | ------------------------ | ---------------------------- |
| Quick    | CI/CD、小项目、快速评估  | 高危漏洞、敏感信息、依赖CVE  |
| **Quick-Diff** | **CI/CD 增量审计、PR Review** | **仅 git diff 变更文件，聚焦新增/修改代码** |
| Standard | 常规审计、代码评审       | OWASP Top 10、认证授权、加密 |
| Deep     | 重要项目、渗透测试、合规 | 全覆盖、链式攻击、业务逻辑   |

### Quick-Diff 模式（增量审计）

> 适用场景: PR Review、CI/CD pipeline 中的安全门禁、已审计项目的增量变更检查

**触发条件**: 用户指定 `quick-diff` 模式，或提供 `--diff`/`--pr` 参数

**执行流程**:
1. **变更范围获取**: `git diff --name-only {base}..{head}` 获取变更文件列表
2. **变更分类**: 按文件类型和目录分类（源码/配置/依赖/测试/文档）
3. **增量攻击面**: 仅对变更文件执行 Phase 2A，但需检查:
   - 变更文件是否引入新的 Sink（新增 SQL 拼接、新增文件操作等）
   - 变更文件的调用者是否受影响（Grep 调用方）
   - 配置变更是否削弱安全控制（Filter 移除、白名单扩大等）
   - 依赖变更是否引入已知 CVE
4. **上下文感知**: 对变更文件的 import/调用链向上追溯 1 层，确保不遗漏间接影响
5. **报告**: 仅报告与变更相关的发现，标注 `[新增]`/`[修改]`/`[间接影响]`

**限制**: 不执行 R2、不启动多 Agent、单线程 ≤15 turns。适合快速反馈，不替代全量审计。

---

---

## 技术栈→专项路由表（审计前勾选）

| 信号 | 必加载模块 |
|------|-----------|
| CDN/反代/Nginx/Envoy/Traefik | `references/security/cache_host_header.md` + api_gateway_proxy |
| OIDC/SAML/JWT/JWK/kid/redirect_uri | `references/security/oauth_oidc_saml.md` + cryptography |
| WebSocket/SSE/gRPC/ActionCable/SignalR | `references/security/realtime_protocols.md` |
| CI/CD + Docker/K8s/Terraform/Helm | `references/security/infra_supply_chain.md` + dependencies |
| 长连接 + 消息队列(Kafka/RabbitMQ) | realtime_protocols + message_queue_async |
| API/REST/GraphQL | `references/security/api_security.md` + graphql |
| 反序列化/脚本引擎/JNDI/表达式 | 对应 `references/languages/*` 语言专项 |

> Phase 1 识别技术栈后立即勾选此表，确认专项模块不遗漏。

## Core Modules

> 核心分析模块，提供通用的审计方法论和报告格式

| 模块            | 路径                               | 功能                         |
| --------------- | ---------------------------------- | ---------------------------- |
| **防幻觉规则** | `references/core/anti_hallucination.md` | **文件验证、代码真实性、防止误报** |
| **全面审计方法论** | `references/core/comprehensive_audit_methodology.md` | **LSP攻击面映射**、系统性框架、覆盖率追踪 |
| **污点分析** | `references/core/taint_analysis.md` | 追踪算法、**LSP增强追踪**、Slot类型分类、净化后拼接检测 |
| Sink/Source参考 | `references/core/sinks_sources.md`  | 完整的Source/Sink定义库      |
| **语义搜索指南** | `references/core/semantic_search_guide.md` | **漏洞语义查询、LSP精确追踪、混合搜索** |
| **安全指标库** | `references/core/security_indicators.md` | **多语言安全模式、风险分级、grep命令** |
| **PoC生成指南** | `references/core/poc_generation.md` | **各类漏洞PoC模板、验证方法、无害化测试** |
| **外部工具集成** | `references/core/external_tools_guide.md` | **Semgrep/Bandit/Gosec/Gitleaks详细集成** |
| **漏洞验证方法论** | `references/core/verification_methodology.md` | **LSP可达性分析**、条件分析、置信度评分 |
| 系统性反思      | `references/core/systematic_reflection.md` | 审计盲区分析、改进方案 |
| 误报过滤        | `references/core/false_positive_filter.md` | 降低误报率的方法 |
| 攻击路径优先级  | `references/core/attack_path_priority.md` | 攻击链优先级排序 |
| **回归测试基准** | `references/core/benchmark_methodology.md` | **漏报率测量、能力基线、冒烟测试** |

### 污点分析触发

> 防幻觉规则和审计方法论已内联到 Agent Contract 中，Agent 无需额外读取 reference 文件。

当给定漏洞位置 (file:line) 时，自动加载污点分析模块进行：

1. **Sink识别** - 分析危险函数和涉及变量
2. **反向追踪** - 从Sink向上追踪数据来源
3. **Source定位** - 识别用户可控输入点
4. **净化检查** - 验证传播路径上的安全措施
5. **报告生成** - 输出完整的污点分析报告

---

## Language & Framework Modules

> 根据项目技术栈加载对应模块，获取语言特定的漏洞模式和检测方法

### 语言模块

| 语言               | 模块路径                                     | 适用范围                        |
| ------------------ | -------------------------------------------- | ------------------------------- |
| Python             | `references/languages/python.md`              | Python, Flask                   |
| **Python反序列化** | `references/languages/python_deserialization.md` | **Pickle/PyYAML/jsonpickle深度** |
| Java               | `references/languages/java.md`                | Java, Spring Boot, Struts       |
| Java Fastjson      | `references/languages/java_fastjson.md`       | Fastjson全版本漏洞分析          |
| **Java反序列化**   | `references/languages/java_deserialization.md` | **ObjectInputStream、XStream、入口检测** |
| Java Gadget Chains | `references/languages/java_gadget_chains.md`  | 107+ CC/CB/ROME等反序列化链     |
| Java JNDI注入      | `references/languages/java_jndi_injection.md` | JNDI注入、RMI/LDAP远程加载      |
| Java XXE           | `references/languages/java_xxe.md`            | XXE漏洞专项、XML解析器安全      |
| **Java脚本引擎RCE** | `references/languages/java_script_engines.md` | **Text4Shell/SnakeYAML/GroovyShell/JSR-223/OGNL** |
| **Java实战** | `references/languages/java_practical.md`      | 若依审计案例、实战检测规则      |
| Go                 | `references/languages/go.md`                  | Go, Gin, Echo, Fiber            |
| **Go安全深度**     | `references/languages/go_security.md`         | **并发竞态、unsafe包、cgo边界** |
| PHP                | `references/languages/php.md`                 | PHP, Laravel, WordPress         |
| **PHP反序列化**    | `references/languages/php_deserialization.md` | **POP链、Phar反序列化、框架Gadget** |
| C/C++              | `references/languages/c_cpp.md`               | C, C++, 嵌入式系统              |
| JavaScript         | `references/languages/javascript.md`          | JavaScript, Node.js, TypeScript |

### 框架模块

| 框架        | 模块路径                          | 适用范围                                 |
| ----------- | --------------------------------- | ---------------------------------------- |
| FastAPI     | `references/frameworks/fastapi.md` | FastAPI, Starlette                       |
| Django      | `references/frameworks/django.md`  | Django, DRF                              |
| **Flask**   | `references/frameworks/flask.md`   | **Flask, Jinja2 SSTI, DEBUG RCE**        |
| Express     | `references/frameworks/express.md` | Express.js, Node.js                      |
| Koa         | `references/frameworks/koa.md`     | Koa.js, Koa-Router                       |
| **Gin**     | `references/frameworks/gin.md`     | **Gin, Go Web, SQL注入, CORS**           |
| Spring Boot | `references/frameworks/spring.md`  | Spring Boot, MVC, Security, RuoYi实战 |
| Java Web框架 | `references/frameworks/java_web_framework.md` | Shiro、框架安全特性 |
| **MyBatis注入** | `references/frameworks/mybatis_security.md` | **${}注入、动态SQL、Provider拼接、MyBatis-Plus** |
| Laravel     | `references/frameworks/laravel.md` | Laravel, Eloquent ORM                    |
| .NET        | `references/frameworks/dotnet.md`  | ASP.NET Core, Blazor                     |
| Nest/Fastify | `references/frameworks/nest_fastify.md` | NestJS, Fastify Node框架            |
| Rails       | `references/frameworks/rails.md`   | Ruby on Rails                            |
| Rust Web    | `references/frameworks/rust_web.md` | Actix, Axum, Rocket                     |

### 安全专项模块

> 所有安全专项模块位于 `references/security/` 目录

**架构与协议**: cross_service_trust | api_gateway_proxy | message_queue_async | graphql | realtime_protocols | http_smuggling
**应用安全**: file_operations | scheduled_tasks | business_logic | race_conditions | dependencies | memory_native
**认证与加密**: oauth_oidc_saml | cryptography | cache_host_header | api_security
**现代安全**: llm_security | serverless | infra_supply_chain
**移动安全**: `references/mobile/android.md`
**案例库**: `references/cases/real_world_vulns.md`

### 技术栈识别

**识别方法**: 构建配置文件 → 语言确认 → 框架识别 → 版本提取

| 语言 | 构建文件 | 框架信号 (启发) |
|------|---------|----------------|
| Java | pom.xml, build.gradle | Spring(org.springframework), Struts, Quarkus, Micronaut → ... |
| Python | requirements.txt, pyproject.toml, setup.py | FastAPI, Django(manage.py), Flask → ... |
| Go | go.mod, go.sum | Gin, Echo, Fiber, chi → ... |
| PHP | composer.json | Laravel(artisan), Symfony, WordPress, ThinkPHP → ... |
| Node.js | package.json | Express, Koa, NestJS, Fastify, Next.js → ... |
| C/C++ | Makefile, CMakeLists.txt | OpenSSL, libcurl, SQLite → ... |
| .NET/C# | *.csproj, *.sln | ASP.NET Core, Blazor, Entity Framework → ... |
| Ruby | Gemfile, Rakefile | Rails, Sinatra → ... |
| Rust | Cargo.toml | Actix, Axum, Rocket → ... |
| Kotlin | build.gradle.kts | Ktor, Spring(Kotlin) → ... |

**未知技术栈发现**: 若无标准构建文件 → 搜索 `import`/`require`/`using`/`include` 语句推断语言和框架

### 功能模块发现与攻击面映射

> 功能模块决定攻击面。先发现项目有哪些模块，再展开每个模块的攻击面。

**模块发现四步法** (Phase 1 必须完成):

| 步骤 | 方法 | 操作 |
|------|------|------|
| 1 | **构建结构** | Maven modules / npm workspaces / Go modules → 每个子模块是什么功能？ |
| 2 | **路由聚类** | 按 URL 前缀分组 (/auth/*, /file/*, /admin/*) → 每组对应一个功能域 |
| 3 | **包名推断** | 按包名模式识别 (*.auth, *.upload, *.payment, *.admin) → 补充路由未覆盖的后端模块 |
| 4 | **配置分析** | application.yml / .env 中的功能段 (datasource, mail, oss, ldap) → 识别外部交互模块 |

**发现后必问**: 每个模块有哪些子功能？每个子功能的用户输入点在哪？
**深度边界**: 列出 Top 10-15 功能模块即可，不需穷举所有子路由。每个模块列 3-7 个子功能。

> 以下为常见功能域的攻击面启发。"→ ..." 表示 LLM 可基于项目特征补充 1-3 项，不需无限扩展。

| 功能域 | 子功能 (启发) | 攻击提示 (非穷举) |
|--------|--------------|-------------------|
| **身份认证** | 登录、注册、密码重置、SSO/OAuth、MFA、Remember Me、Token刷新 | 凭据填充、JWT算法混淆、重置令牌预测/复用、OAuth重定向劫持、MFA绕过、密码策略弱 → ... |
| **权限控制** | RBAC/ABAC、数据隔离、资源归属、批量操作、API鉴权 | IDOR、垂直越权、组织隔离绕过、批量操作逐一校验缺失、属性级越权(Mass Assignment) → ... |
| **文件管理** | 上传、下载、预览、在线编辑、解压、临时文件 | 扩展名绕过、路径遍历、Zip Slip、SSRF(预览远程URL)、WebShell、文件覆盖 → ... |
| **数据查询** | 搜索、过滤、排序、分页、导出 | SQL/NoSQL/HQL注入、ORDER BY注入、导出注入(CSV/Excel公式)、分页越权 → ... |
| **支付交易** | 下单、支付、退款、优惠券、余额 | 金额篡改、竞态条件(余额/库存)、支付回调伪造、优惠叠加、负数绕过 → ... |
| **外部集成** | 数据源、邮件、短信、Webhook、SSO、云存储 | JDBC注入/协议攻击、SSRF、凭据泄露、Webhook回调伪造、SMTP注入 → ... |
| **管理后台** | 用户管理、系统配置、日志、监控、数据库管理 | 默认凭据、Actuator暴露、日志注入、SQL编辑器任意执行、配置篡改 → ... |
| **插件/扩展** | 插件加载、脚本执行、自定义函数、模板 | ClassLoader劫持、表达式注入(SpEL/OGNL/SSTI)、沙箱逃逸、反序列化 → ... |
| **任务调度** | 定时任务、异步任务、消息消费 | Cron注入、反序列化(MQ消息体)、任务参数篡改、未授权触发 → ... |
| **通知/消息** | 站内信、邮件、推送、WebSocket | 存储XSS、模板注入、消息伪造、未授权订阅 → ... |

**边界交互矩阵** (每个边界都是攻击面):

| 方向 | 边界类型 | 重点攻击 |
|------|---------|---------|
| 入站 | HTTP/API、文件上传、MQ消费、RPC、SSO回调、WebSocket | 注入、认证绕过、反序列化 |
| 出站 | HTTP请求、DB查询、SMTP、文件系统、命令执行、云API | SSRF、SQL注入、命令注入、凭据泄露 |
| 存储 | Session/Cache、数据库、文件、消息队列 | 数据篡改、二次注入、序列化攻击 |

**⚠️ 以上所有列表均为启发提示，非穷举。LLM 应基于项目实际代码适度扩展（每个功能域补充 1-3 项即可），避免无限展开。**

> 框架审计焦点速查: `references/frameworks/` 目录下各框架模块
> ORM安全/危险API对照: `references/core/sinks_sources.md`
> 版本安全边界速查: `references/core/version_boundaries.md`

---

## Two-Layer Checklist Architecture (两层检查清单架构)

> **核心原则**: Checklist 不驱动审计，而是验证覆盖。LLM 先自由审计，再用 checklist 查漏补缺。

### Layer 1: 覆盖率矩阵 (Phase 2B 加载)

**文件**: `references/checklists/coverage_matrix.md` (~25行)
**加载时机**: Phase 2A（LLM自由审计）完成后
**作用**: 对照 10 个安全维度 (D1-D10)，标记已覆盖/未覆盖

### Layer 2: 语义提示 (按需加载未覆盖维度)

| 主语言 | 语义提示文件 |
|--------|-------------|
| Java | `references/checklists/java.md` |
| Python | `references/checklists/python.md` |
| PHP | `references/checklists/php.md` |
| JavaScript/Node.js | `references/checklists/javascript.md` |
| Go | `references/checklists/go.md` |
| .NET/C# | `references/checklists/dotnet.md` |
| Ruby | `references/checklists/ruby.md` |
| C/C++ | `references/checklists/c_cpp.md` |
| Rust | `references/checklists/rust.md` |

通用维度: `references/checklists/universal.md` (架构/逻辑级)

**加载指令**:
1. **Phase 2A 期间禁止加载 checklist**。LLM 使用自身安全知识自由审计。
2. Phase 2A 完成后，加载 `coverage_matrix.md`，标记已覆盖维度。
3. 对未覆盖维度，加载 `{language}.md` 中对应 `## D{N}` 段落（按需加载，非全量）。
4. 语义提示仅提供关键问题和判定规则，LLM 自行决定搜索策略。

**依赖感知裁剪**: 读取 pom.xml/package.json/go.mod 后，D10(供应链)维度中不存在的依赖标记SKIP。

---

## Vulnerability Detection

### 权限提升专项检测 (IDOR/越权)

> 对比 `findById(id)` vs `findById(userId, id)` — 不安全模式仅靠ID查询，无用户归属验证
> 对每个CRUD操作追踪到Mapper层，检查SQL是否包含 `AND user_id = ?`
> 详细检测流程: `references/core/comprehensive_audit_methodology.md` Phase 4

### 五阶段审计模型与精力分配

> **层级说明**: 以下 Phase 1-5 是**单 Agent 内部**的执行流程。
> 与执行状态机的**跨轮次状态**（PHASE_1_RECON / ROUND_N_RUNNING / ROUND_N_EVALUATION / REPORT）是不同层级。
> Phase 1 = 状态机的 PHASE_1_RECON（主线程执行），Phase 2-4 = ROUND_N_RUNNING（Agent 内部执行）。

| 阶段 | 目标 | 精力占比 |
|------|------|---------|
| Phase 1: 侦察与排除 | 项目架构、技术栈、入口点、快速排除 | 10% |
| Phase 2: 并行模式匹配扫描 | 关键词搜索定位潜在漏洞点 | 30% |
| Phase 3: 关键路径手工审计 | 高风险文件逐行审计 | 40% |
| Phase 4: 漏洞验证与攻击链 | 确认可利用性，构建攻击链 | 15% |
| Phase 5: 报告输出 | 结构化报告与修复建议 | 5% |

### Phase 1: 侦察与排除

**Phase 1 Step 1: 攻击面测绘**（必须100%完成，不可跳过）

```
⚠️ 审计遗漏的根本原因：
1. 假设核心模块最重要 → 漏掉插件/扩展
2. 假设有防护就安全 → 漏掉不完整的防护
3. 假设某路径不可达 → 漏掉隐藏入口

✓ 正确做法：先测绘完整攻击面，再逐点深入
```

**Step 1.0: 构建文件驱动的模块枚举**（必须在模块矩阵之前完成）

> 审计遗漏根因之一：Agent 搜索路径只覆盖核心模块，遗漏子模块/扩展模块。
> 解决方案：通过构建文件自动发现所有模块，确保搜索路径完整。

```
操作（机制，非写死路径）:
1. 枚举构建文件: Glob **/{pom.xml,build.gradle,package.json,go.mod,Cargo.toml,*.csproj}
2. 解析模块树: 从构建文件中提取所有子模块/workspace 成员
3. 分类标记:
   - 面向外部 (API/Web): 包含 Controller/Handler/Router 的模块
   - 面向内部 (SDK/Lib): 被其他模块引用但不直接暴露端点
   - 基础设施 (Infra): 构建/部署/测试辅助模块
4. 写入 Agent Contract:
   [搜索路径] = 所有「面向外部」模块 + 所有「面向内部」模块
   不得遗漏任何包含业务代码的子模块
```

⚠️ **强制规则**: Agent 的 `[搜索路径]` 必须覆盖步骤 3 中所有「面向外部」和「面向内部」模块。如果 Agent 只搜索了核心模块而遗漏扩展/插件模块，视为 Phase 1 未完成。

**模块覆盖验证矩阵**（基于上方枚举结果逐项勾选）：

| 模块类型 | 状态 | 备注 |
|----------|------|------|
| 核心模块 (core, main) | [ ] | |
| 所有插件 (plugins/*) | [ ] | **常被遗漏** |
| 扩展模块 (extensions/*) | [ ] | **常被遗漏** |
| SDK/Lib 模块 | [ ] | **常被遗漏 — 可能包含共享 Sink** |
| 测试代码 (test/*) | [ ] | |
| 示例代码 (examples/*) | [ ] | |
| 配置文件 (*.yml, *.properties) | [ ] | |
| CI/CD 配置 | [ ] | |
| 容器/IaC 配置 | [ ] | |

**功能模块发现** (基于上方"模块发现四步法"):

完成 Step 1.1-1.4 后，基于发现的 routes/packages/configs，列出项目的功能模块：

| # | 功能模块 | 子功能 | 入口数 | 认证要求 |
|---|---------|-------|-------|---------|
| 1 | (待填) | (待填) | | 是/否/部分 |
| 2 | ... | ... | | |

**模块发现完整性检查** (逐项确认):
- [ ] 所有 Controller/Router URL 前缀是否都归入了某个功能模块？
- [ ] 有无"隐藏模块"？(内部API、调试端点、遗留接口、Actuator)
- [ ] 有无"间接入口"？(定时任务、MQ消费者、反序列化监听器)
- [ ] 外部集成是否识别？(邮件、短信、OSS、LDAP、第三方OAuth)

**Phase 1 Step 2: 信息收集清单**（每项必须完成）：

| 步骤 | 操作 | 获取信息 |
|------|------|---------|
| **1.0** | **枚举完整认证链** | **Filter链顺序、JWT验证逻辑、Token生成/校验类、白名单路径、匿名端点** |
| 1.1 | 查看项目根目录结构 | 模块划分、构建工具(Maven/Gradle/npm/go.mod) |
| 1.2 | 查看构建配置文件 | 依赖、版本、多模块结构 |
| 1.3 | 统计代码文件分布 | 各模块代码量、语言占比 |
| 1.4 | 搜索API入口注解/路由 | 所有对外暴露的接口 |
| 1.5 | 搜索安全过滤器/中间件 | Filter/Middleware/Guard链完整排列 |
| 1.6 | 搜索白名单/匿名访问 | 未认证可访问的接口（对照1.0结果交叉验证） |
| 1.7 | 识别外部交互 | HTTP出站、数据库、SSH、消息队列 |
| **1.8** | **枚举部署模式/Profile** | **各 Profile 的安全控制差异（Filter 启用/禁用、端点暴露/隐藏）** |

> **步骤 1.8 部署模式感知**:
> 搜索 `application-*.yml` / `application-*.properties` / `profiles/` / Dockerfile 变体，
> 识别不同部署模式（standalone/desktop/enterprise/cloud 等）的安全差异。
> 每个模式的差异点：哪些 Filter/Middleware 启用或禁用？哪些端点在该模式下暴露？
> 如果某 Profile 禁用了关键安全 Filter → 该模式下的端点必须在后续审计中单独分析。
> 此步骤不依赖特定项目结构，而是通过搜索配置文件中的 Profile 机制（Spring/Django/ASP.NET 均有）来发现。

> **步骤 1.0 是最高优先级**：认证绕过放大所有其他漏洞的影响。
> 必须完整回答：谁验证Token? 用什么算法? 签名密钥从哪来? 过期策略?
> 如果跳过此步骤，后续所有 High/Critical 发现都缺少"是否需要认证"这一关键上下文。

**Phase 1 Step 3: 快速排除 (Fast Exclusion)**

> 对高危但低概率的攻击面执行批量Grep，0 hits则标记该方向为SKIP，不分配Agent。

**排除原则**: 按已识别的技术栈选择对应语言的排除模式。以下为常见示例，LLM 应基于项目技术栈自行扩展。

**Java 项目排除**:

| Grep 模式 | 攻击面 | 0 hits → SKIP |
|-----------|--------|--------------|
| `ObjectInputStream\|XMLDecoder` | 反序列化 | 反序列化Agent方向 |
| `InitialContext\|\.lookup\(` | JNDI注入 | JNDI检查项 |
| `ScriptEngine\|GroovyShell\|Nashorn` | 脚本引擎RCE | 脚本引擎检查项 |
| `DocumentBuilder\|SAXParser\|XMLReader` | XXE | XXE检查项 |
| `fastjson\|JSON\.parse` (pom.xml + *.java) | Fastjson | Fastjson检查项 |

**Python 项目排除**:

| Grep 模式 | 攻击面 | 0 hits → SKIP |
|-----------|--------|--------------|
| `pickle\|yaml\.load\|marshal` | 反序列化 | 反序列化方向 |
| `eval\|exec\|compile\|__import__` | 代码执行 | 动态执行方向 |
| `render_template_string\|Template\(` | SSTI | 模板注入方向 |
| `subprocess\|os\.system\|os\.popen` | 命令注入 | 命令注入方向 |

**Go/PHP/Node.js 项目**: LLM 根据 `references/checklists/{language}.md` D1 段的关键问题，自行构造对应排除模式。

SKIP不意味着"安全"，而是"该攻击面在此项目中不存在"。

Phase 1 核心产出：**认证链完整画像** + 技术栈画像 + 模块地图 + 攻击面清单 + 安全机制识别 + SKIP列表

### Phase 2A: 语义驱动审计 (Primary, 60% 精力)

> LLM 基于 Phase 1 的攻击面地图，自主选择审计路径和搜索策略。
> **⚠️ Phase 2A 禁止加载 checklist 文件。LLM 应使用自身安全知识自由审计。**

**审计路径**: 从入口点(Controller/Handler)出发，追踪用户输入的数据流：
- 对每个入口点：参数从哪来？经过什么处理？到达什么 Sink？有什么防护？可绕过否？
- 重点关注：认证链完整性、授权归属验证、数据流中的信任边界
- 搜索策略由 LLM 决定（Grep/Read/LSP/代码推理均可）

**单文件审计4步**: 1.读类结构 → 2.追踪public方法参数流 → 3.验证过滤/Sink/绕过 → 4.记录文件:行号:类型:路径

**优先级参考**:

| 优先级 | 分类 | 漏洞类型 |
|--------|------|----------|
| **Critical** | 注入 | SQL/HQL/NoSQL注入、命令注入、SSTI、JNDI注入 |
| **Critical** | 反序列化 | Java(Fastjson/Jackson/Gadgets)、Python(Pickle)、PHP(Phar) |
| **Critical** | 文件/授权 | 任意文件读写、路径穿越、敏感操作无权限检查 |
| **High** | SSRF/认证 | 云metadata、JWT绕过、IDOR、配置驱动型SSRF |
| **High** | 业务逻辑 | 支付篡改、竞态条件、流程绕过、Mass Assignment |
| **Medium** | XSS/配置 | 存储型XSS、CORS错误、信息泄露 |

> 详细检查点: 参考对应语言模块 (`references/languages/`) 和安全模块 (`references/security/`)

### Phase 2B: 覆盖率验证与补漏 (Secondary, 20% 精力)

> Phase 2A 完成后执行。加载覆盖率矩阵，识别盲区，按需补漏。

1. **加载** `references/checklists/coverage_matrix.md`
2. **对照 10 个维度**，标记 Phase 2A 已覆盖的维度（已覆盖 = 有深度分析，不是仅 Grep 一次）
3. **对未覆盖维度**：加载 `references/checklists/{language}.md` 中对应 `## D{N}` 段落的语义提示，补充审计
4. **强制覆盖**: D1(注入) + D2(认证) + D3(授权) 必须覆盖，否则不可进入 REPORT
5. **Phase 3 文件优先级**: P0=认证过滤器+白名单+核心入口 | P1=文件上传+HTTP出站+SQL构造 | P2=配置+加密+SSO集成
6. **T3 Sink 覆盖验证**（防止"维度已覆盖但 Sink 类型遗漏"）:
   - 对每个标记为 ✅ 的维度，检查该维度的**核心 Sink 类别**是否都被搜索过
   - 核心 Sink 类别从 `references/checklists/{language}.md` 对应 D{N} 段推导（不是写死的模式列表）
   - 如果某维度标记 ✅ 但其核心 Sink 类别中有未搜索的 → 降级为 ⚠️ 浅覆盖，触发补搜
   - 示例逻辑: D4(RCE) 标记 ✅ 但只搜了反序列化、未搜反射调用/表达式引擎 → 降级为 ⚠️
   - ⚠️ 这不是 checklist 驱动审计：Phase 2A 用 LLM 知识自由审计，Phase 2B 用 Sink 类别**验证遗漏**
7. **反向端点审计**（D3 授权 + D9 业务逻辑专用，覆盖"缺失型漏洞"）:
   - 目的: 正向审计搜索"危险代码"，反向审计搜索"应有但缺失的安全控制"
   - 操作（通用机制，非语言特定）:
     a. 枚举所有 API 端点（从 Phase 1 Step 1.4 路由发现中提取）
     b. 对每个端点检查: 是否有鉴权注解/装饰器/中间件保护？
     c. 无保护的端点 → 交叉验证是否为公开接口（登录/注册/健康检查等）
     d. 非公开但无保护 → 标记为 D3 授权缺失候选
   - 适用模式: standard 模式对关键端点抽查，deep 模式全量枚举
   - 此方法从"端点列表"出发而非从"代码模式"出发，能发现 Grep 找不到的缺失型漏洞
8. **认证旁路路径枚举**（D2 认证 + D3 授权专用，覆盖"白名单暴露"型漏洞）:
   - 问题: 正向审计搜索"认证代码"，但无法发现"本应需要认证但被白名单豁免"的端点
   - 操作（通用机制，适用于任何框架的认证豁免配置）:
     a. 搜索认证豁免配置: 框架的白名单文件/Filter排除规则/路由中间件跳过列表
        Grep 模式（通用）: `whitelist|permitAll|excludePath|anonymous|isPublic|@AllowAnonymous`
     b. 枚举所有被豁免的路径/端点
     c. 对每个被豁免端点检查: 该端点是否返回/接受敏感数据？是否执行特权操作？
     d. 返回敏感数据或执行特权操作的豁免端点 → 标记为 D2/D3 候选漏洞
   - 关键场景（非写死列表，而是审计时需关注的通用模式）:
     - 密钥/凭据端点被豁免 → 信息泄露
     - 文件下载端点被豁免 + 无所有权校验 → IDOR
     - 管理操作端点被豁免 → 未授权访问
   - 适用模式: standard 模式抽查关键豁免路径，deep 模式全量枚举

### Phase 2.5-2.7: 双轨审计方法论

> **Phase 2.5** Control-driven 授权审计(D3): 端点遍历→权限验证→CRUD一致性→认证豁免审计
> **Phase 2.6** Control-driven 业务逻辑审计(D9): IDOR→Mass Assignment→状态机→并发→数据导出→多租户
> **Phase 2.7** Config-driven 加密深度(D7): 密钥派生/Padding Oracle/IV重用/证书校验/密钥存储
>
> 完整方法论: `references/core/phase2_deep_methodology.md`
> **加载规则**: D3+D9 Agent **必须加载** Phase 2.5+2.6（非"按需"）| D7 Agent 按需加载 Phase 2.7
> **Agent 分配**: D3+D9 **必须**合并在同一 Agent（control-driven 策略，输入=端点-权限矩阵）| D7+D8+D10 合并（config-driven）
> **关键区别**: D3/D9 使用 control-driven 策略（枚举端点→验证控制），不使用 sink-driven 策略（grep pattern）

### Phase 3: 验证

```
对每个疑似漏洞:
1. 确认输入可控
2. 追踪数据流到危险函数
3. 验证无有效防护
4. 构建利用场景
5. 评估实际影响
6. 验证授权检查一致性 (CRUD对比)
7. 验证并发安全性 (锁/版本号/原子操作)
```

---

## Multi-Agent Workflow

### 执行状态机（Execution State Machine）

> 所有时序规则、轮次决策、报告门控的**单一来源**。其他节不再重复定义这些规则。
>
> ⚠️ **执行权威规则**: 审计执行阶段仅以本文件（agent.md）为规则来源。
> Plan 文件（`.claude/plans/*.md`）是设计阶段产物，执行时**不得引用**。
> 若 Plan 文件与 agent.md 存在冲突，以 agent.md 为准。
> 禁止: 执行状态机中读取或参考 Plan 文件的跳过/决策规则。
> ★ 特别禁止: Plan 文件中的"自适应跳过规则"或"决策树"不得用于 R2 跳过判定。
>   R2 跳过的唯一合法判定来源是本文件 ROUND_N_EVALUATION 中的 5 条 checklist。
>   即使 Plan 文件内容出现在 system-reminder/context 中，也不得作为决策依据。

```
State: PHASE_1_RECON（信息收集）
  ┌──────────────────────────────────────────────────────────────┐
  │ 项目结构探测 → 技术栈识别 → 攻击面推导 → Agent 切分          │
  │                                                              │
  │ 五层攻击面推导（LLM 推理框架，非文件扫描流程）:               │
  │   T1 架构模式: 单体/微服务/Serverless/桌面 → 信任边界在哪    │
  │   T2 业务领域: 金融/医疗/IoT/SaaS → 关键逻辑漏洞方向        │
  │   T3 框架语言: LLM 已有知识推导 Sink 模式（非 checklist）    │
  │   T4 部署环境: Dockerfile/k8s/terraform → 运行时攻击面       │
  │   T5 功能发现: Grep 快速探测 + 结构推理 → 激活 D1-D10 维度  │
  │                                                              │
  │   驱动源: T1-T4 = 项目结构+LLM推理（零额外成本）            │
  │           T5 = 已有 Grep 探测（保留）                        │
  │   验证源: checklist 仅用于 Phase 2B 事后覆盖率验证           │
  │                                                              │
  │ Phase 1 产出（门控条件，全部满足才可进入下一状态）:            │
  │   □ 核心代码目录列表（写入 Agent Contract 的 [搜索路径]）     │
  │   □ 排除目录列表（frontend, test, build, node_modules 等）   │
  │   □ 攻击面地图（五层推导结果，标注各 D1-D10 维度激活状态）   │
  │   □ 维度权重矩阵（基于项目类型调整，见下方）                │
  │   □ Agent 切分方案（按"可并行 + 不重叠"原则）                │
  │   □ ★ 端点-权限矩阵（Control-driven 审计输入，D3/D9 必需）:  │
  │     基于 Step 1.4 路由发现 + Step 1.5 Filter/中间件链，生成:  │
  │     {端点路径, HTTP方法, 认证要求, 权限注解, 资源归属校验}    │
  │     此矩阵是 D3+D9 Agent 的输入，等同于 Sink 列表之于 D1     │
  │     生成方法: Grep @RequestMapping/@GetMapping 等 → 提取路径  │
  │     → 对每个 Controller 检查类/方法级权限注解 → 记录到矩阵    │
  │     无后台管理的纯 API 项目: 矩阵仍需生成（覆盖 IDOR 检查）  │
  │                                                              │
  │ ★ 项目类型→维度权重自适应（Phase 1 T2 识别业务类型后执行）:   │
  │   根据项目业务类型，调整 D1-D10 各维度的审计深度权重:         │
  │                                                              │
  │   金融/支付类: D9(++), D1(++), D2(+), D3(+)                  │
  │     → Agent 分配偏重业务逻辑(竞态/金额)+注入+认证授权         │
  │   数据平台/BI: D1(++), D6(++), D3(+), D7(+)                  │
  │     → Agent 分配偏重 SQL 引擎注入+SSRF/数据源+权限隔离        │
  │   文件存储/CMS: D5(++), D1(+), D3(+), D6(+), D9(+)            │
  │     → Agent 分配偏重文件操作+路径遍历+SSRF+后台越权           │
  │   身份认证平台: D2(++), D3(++), D7(+), D9(+)                 │
  │     → Agent 分配偏重认证链+授权+加密+业务流程                 │
  │   IoT/嵌入式: D7(++), D2(++), D5(+), D10(+)                  │
  │     → Agent 分配偏重加密+认证+固件+供应链                     │
  │   通用 Web/SaaS: 均衡（默认权重）                             │
  │                                                              │
  │   (++) = 必须深度审计（R1+R2 均覆盖）                         │
  │   (+)  = 标准审计（R1 覆盖即可）                              │
  │   无标记 = 按 Phase 1 排除结果决定                             │
  │   权重影响: Agent turns 按权重分配，(++)维度 Agent 多分配 5 turns│
  └──────────────────────────────────────────────────────────────┘
      ↓ 门控通过

State: ROUND_N_RUNNING（Agent 并行执行）
  ┌──────────────────────────────────────────────────────────────┐
  │ Entry: 为每个 Agent 注入 Agent Contract → 并行启动            │
  │ 主线程 + Agent 并行执行 Phase 2-3                            │
  │                                                              │
  │ 门控条件:                                                     │
  │   ALL Agents 完成 OR 超时标注                                 │
  │   超时处理: >15min → 标注"该方向审计未完成"（不忽略）         │
  │                                                              │
  │ 禁止:                                                        │
  │   Agent 未全部完成时写最终报告                                │
  │   Agent 运行中只可输出"中间发现列表"                          │
  └──────────────────────────────────────────────────────────────┘
      ↓ 门控通过

State: ROUND_N_EVALUATION（轮次终止评估）
  ┌──────────────────────────────────────────────────────────────┐
  │ ★ 前置步骤: 截断检测（在汇总之前执行）                        │
  │   对每个 Agent 输出检查 === AGENT_OUTPUT_END === 哨兵         │
  │   哨兵缺失 → 执行「截断恢复流程」（见主线程截断检测段）       │
  │   HEADER 缺失 → 该 Agent 维度强制标记为 ⚠️                   │
  │   所有 Agent 截断检测完成后，才进入汇总                       │
  │                                                              │
  │ Entry: 汇总去重 → Round N 发现清单                           │
  │                                                              │
  │ ★ 覆盖缺口评估（三问之前必须完成）:                           │
  │                                                              │
  │   1. 逐维度对照（精确覆盖判定）:                               │
  │      D1-D10 覆盖矩阵 → 标记: ✅已覆盖 / ⚠️浅覆盖 / ❌未覆盖  │
  │                                                              │
  │      ★ 覆盖判定按审计策略分轨（不同维度用不同标准）:             │
  │                                                              │
  │      【Sink-driven 维度: D1/D4/D5/D6】                        │
  │      ✅已覆盖 = 核心 Sink 类别均被搜索 + 有数据流追踪          │
  │                + Sink 扇出率 ≥ 30%（见下方扇出检查）           │
  │      ⚠️浅覆盖 = 搜索过但: Sink 类别有遗漏 / 仅 Grep 未追踪   │
  │                 / 只搜核心模块 / 扇出率 < 30%                  │
  │      ❌未覆盖 = 该维度未被任何 Agent 搜索                      │
  │                                                              │
  │      【Control-driven 维度: D3/D9】                            │
  │      ✅已覆盖 = 端点审计率 ≥ 50%(deep) / ≥ 30%(standard)      │
  │                + 至少 3 种资源类型执行了 CRUD 权限一致性对比    │
  │                + IDOR 检查覆盖了主要 findById/getById 调用     │
  │      ⚠️浅覆盖 = 仅 Grep 搜索 pattern 但未系统枚举端点验证     │
  │                 / 仅检查了部分资源类型 / 未对比 CRUD 一致性    │
  │      ❌未覆盖 = 未执行 Control-driven 审计（仅靠 sink-driven   │
  │                 搜索 D3/D9 pattern 不算覆盖）                  │
  │      端点审计率 = 已验证权限的端点数 / Phase 1 矩阵总端点数    │
  │                                                              │
  │      【Config-driven 维度: D2/D7/D8/D10】                      │
  │      ✅已覆盖 = 核心配置项均已检查 + 版本/算法已对比基线       │
  │      ⚠️浅覆盖 = 仅检查了部分配置 / 未深入验证                 │
  │      ❌未覆盖 = 该维度未被任何 Agent 检查                      │
  │                                                              │
  │      ★ Sink 扇出检查（防止"广搜浅挖"导致覆盖率虚高）:          │
  │        定义: 扇出率 = 已追踪数据流的文件数 / Grep命中的文件数  │
  │        数据来源: Agent HEADER 中的 STATS.files_read 和         │
  │                  STATS.grep_patterns 对应的命中文件数           │
  │        判定: 某维度 Grep 命中 ≥10 个文件但仅追踪 ≤2 个         │
  │              → 扇出率 ≤ 20% → 降级为 ⚠️（需 R2 深入）        │
  │        意义: Grep 命中多说明攻击面广，只追踪少数说明深度不够    │
  │                                                              │
  │      判定来源: Agent 输出中的 UNCHECKED_CANDIDATES 列表         │
  │        有未审计候选 → 该维度降级为 ⚠️                          │
  │        搜索路径未覆盖所有模块 → 该维度降级为 ⚠️                │
  │                                                              │
  │      ★ 收敛保证（防止无穷轮次）:                                │
  │        UNCHECKED_CANDIDATES 仅在 R1 产生，R2 消化但不再生     │
  │        R2 Agent 禁止输出新的 UNCHECKED_CANDIDATES              │
  │        R2 后所有维度视为"已尽力覆盖"→ 直接进 REPORT 或 R3     │
  │        即: 候选链深度 = 1（R1 产生 → R2 消化 → 终止）         │
  │                                                              │
  │   2. 产出「跨轮传递结构」(进入 NEXT_ROUND 时写入 Agent prompt):│
  │      COVERED:    D1(✅ N个发现), D2(✅ N个发现), ...          │
  │      GAPS:       D3(❌ 未覆盖), D8(⚠️ 仅Grep未深入), ...     │
  │      CLEAN:      [已搜索确认不存在的攻击面,如JNDI/XXE]        │
  │      HOTSPOTS:   [R1发现但未深入的高风险点, file:line:断点描述] │
  │      FILES_READ: [已读文件+关键结论, R2不再重读]               │
  │      GREP_DONE:  [已执行的Grep patterns, R2不再重复]           │
  │                                                              │
  │   3. 缺口数 → R2 Agent 数量:                                  │
  │      ❌未覆盖 0-1 个 → R2: 1 Agent (15 turns)                │
  │      ❌未覆盖 2-3 个 → R2: 2 Agent (2×20 turns)              │
  │      ❌未覆盖 4+  个 → R2: 3 Agent (3×20 turns)              │
  │      ⚠️浅覆盖: 每2个合并为1个R2 Agent                        │
  │                                                              │
  │ 三问法则（必须逐条回答）:                                     │
  │   Q1: 有没有计划搜索但没搜到的区域？ → YES = NEXT_ROUND      │
  │   Q2: 发现的入口点是否都追踪到了 Sink？ → NO = NEXT_ROUND    │
  │   Q3: 高风险发现间是否可能存在跨模块关联？ → YES = NEXT_ROUND │
  │                                                              │
  │ 自适应轮次决策（按审计模式分级）:                                │
  │                                                              │
  │   quick 模式（仅 1 轮，覆盖优先）:                             │
  │     覆盖 ≥ 8/10 → REPORT                                     │
  │     覆盖 < 8/10 → 标注未覆盖维度后 REPORT（不追加轮次）       │
  │                                                              │
  │   standard 模式（1-2 轮，平衡效率与深度）:                      │
  │     if  R1 覆盖 ≥ 9/10 且三问全 NO 且无 UNCHECKED_CANDIDATES: │
  │         → NEXT_ROUND: 启动 1 Agent 深度补漏 → R2 完成后 REPORT│
  │     elif R1 覆盖 ≥ 7/10:                                      │
  │         → NEXT_ROUND: 按缺口数分配 R2 Agent → R2 完成后 REPORT│
  │     elif R1 覆盖 < 7/10:                                      │
  │         → NEXT_ROUND: 全面补充（R2 Agent 数 = 缺口驱动）      │
  │     ⚠️ 注意: standard 模式不存在"跳过 R2 直接 REPORT"的路径。 │
  │     即使覆盖 10/10，仍需 ≥1 Agent 做数据流深度追踪。          │
  │     唯一例外 — 必须逐条验证全部 5 条才可跳过 R2:              │
  │       □ 覆盖 10/10（无 ❌ 且无 ⚠️）                           │
  │       □ 三问法则全部回答 NO                                    │
  │       □ 所有 Agent 的 UNCHECKED_CANDIDATES 为空                │
  │       □ 所有 Agent 的 UNFINISHED 为空                          │
  │       □ 所有维度 Sink 扇出率 ≥ 30%                             │
  │     5 条全部打 ✅ → 可直接 REPORT。任一未满足 → NEXT_ROUND。  │
  │     ★ 禁止引用 Plan 文件中的跳过规则覆盖以上条件。            │
  │                                                              │
  │   deep 模式（2-3 轮，深度优先）:                               │
  │     R2 始终执行（即使 R1 覆盖 10/10）— R2 目的是数据流深度    │
  │     R2 Agent 数量仍由缺口数决定（高覆盖 = 少量 Agent 深挖）   │
  │     R3 仅当 R2 发现跨模块关联候选时启动                       │
  │                                                              │
  │   ⚠️ 关键区分: "覆盖维度" = R1 搜索过该方向                   │
  │                "深度分析" = 追踪了数据流到 Sink                │
  │     R1 的 Grep 覆盖 ≠ 深度分析，R2 的价值在于深度追踪         │
  │                                                              │
  │   所有模式通用:                                                │
  │     D1(注入)+D2(认证)+D3(授权) 任一未覆盖 → 不可进入 REPORT  │
  │                                                              │
  │ → 终止条件满足 → REPORT                                      │
  │ → 否则 → NEXT_ROUND（携带「跨轮传递结构」）                   │
  └──────────────────────────────────────────────────────────────┘
      ↓

State: NEXT_ROUND（启动下一轮 — 增量补漏模式）
  ┌──────────────────────────────────────────────────────────────┐
  │ 核心原则: R2 只补缺口+加深度，不重复已覆盖维度的浅层搜索      │
  │                                                              │
  │ R2 Agent 启动规则:                                            │
  │   输入: ROUND_N_EVALUATION 产出的「跨轮传递结构」              │
  │                                                              │
  │   Agent 方向 = GAPS 中的 ❌/⚠️ 维度 + HOTSPOTS 深入点        │
  │   Agent 数量 = ceil(未覆盖维度数 / 2)，上限 3                 │
  │     ❌未覆盖 0-1 个 → R2: 1 Agent (20 turns, 聚焦数据流深度)  │
  │     ❌未覆盖 2-3 个 → R2: 2 Agent (2×20 turns)               │
  │     ❌未覆盖 4+ 个  → R2: 3 Agent (3×20 turns)               │
  │     ⚠️浅覆盖: 每2个合并为1个R2 Agent                         │
  │                                                              │
  │   Agent prompt 必须包含:                                      │
  │     1. 完整的「跨轮传递结构」                                  │
  │     2. "禁止重读 FILES_READ 中的文件（除非追踪新数据流）"     │
  │     3. "禁止重复 GREP_DONE 中的搜索模式"                     │
  │     4. "CLEAN 列表中的方向直接跳过"                           │
  │     5. "聚焦 HOTSPOTS 中标注的待深入点"                       │
  │     6. "R2 核心任务: 追踪 R1 发现的入口点到 Sink 的数据流"    │
  │                                                              │
  │ R3 Agent 启动规则 (仅当 R2 发现跨模块关联候选时):              │
  │   Agent 数量 = 1                                              │
  │   max_turns = 15                                              │
  │   方向 = 攻击链构建 + 交叉验证                                │
  │   输入 = R1+R2 合并发现清单                                   │
  │                                                              │
  │ ⚠️ 轮次硬上限:                                                │
  │   quick 模式: max 1 轮                                        │
  │   standard 模式: max 2 轮                                     │
  │   deep 模式: max 3 轮                                         │
  │   达到上限 → 强制进入 REPORT（标注未完成维度）                │
  │                                                              │
  │ 禁止: 使用与前轮相同的 Grep 模式重新搜索                      │
  └──────────────────────────────────────────────────────────────┘
      ↓ 回到 ROUND_N_RUNNING

State: REPORT（生成最终报告）
  ┌──────────────────────────────────────────────────────────────┐
  │ 前置条件（全部满足才可写最终报告）:                            │
  │   □ 所有轮次所有 Agent 均已完成或标注超时                     │
  │   □ 所有轮次发现已合并去重                                    │
  │   □ 覆盖度检查通过（参见覆盖率追踪器）                        │
  │   □ 认证链审计已完成                                          │
  │   □ ★ 严重度校准已完成（见下方）                              │
  │                                                              │
  │ ⚠️ 强制报告格式要求:                                           │
  │   □ 报告必须是单一 Markdown 文件                               │
  │   □ 必须包含项目概要信息和所有漏洞详细内容                     │
  │   □ 每个漏洞必须包含6个完整部分（见下方详细格式）              │
  │   □ 使用详细的报告格式（包含存在性分析、数据流图、代码证据、利用条件、修复建议、验证结论），而非摘要格式
  │   □ 参考文件: SKILL.md 文档中的"报告格式要求"章节              │
  │                                                              │
  │ ★ 跨 Agent 发现冲突解决（去重合并时执行）:                     │
  │   同一漏洞被多个 Agent 从不同角度发现时:                       │
  │     - 取最高严重度等级                                         │
  │     - 合并所有数据流证据（互补，非重复）                       │
  │     - 保留最完整的代码引用和行号                               │
  │     - 若攻击路径不同 → 视为同一 root cause 的不同利用路径      │
  │   判定"同一漏洞": 同文件±20行 + 同 Sink 类型 + 同 root cause  │
  │                                                              │
  │ ★ 严重度校准（防止 Agent 间评级漂移）:                        │
  │   多个 Agent 独立评级 → 同类漏洞可能被不同 Agent 评为不同等级 │
  │   校准流程（主线程在合并去重后、写报告前执行）:                │
  │                                                              │
  │   1. 对每个 finding，用决策树重新核验等级:                     │
  │      a. 可达性: 未认证可达(+2) / 低权限(+1) / 管理员(+0)     │
  │      b. 影响: RCE或全库(+3) / 部分数据(+2) / 信息收集(+1)    │
  │      c. 利用复杂度: 单请求(+0) / 多步骤(-1) / 特定环境(-2)   │
  │      d. 防护绕过: 无防护(+0) / 有防护但可绕过(+0) /          │
  │                   有防护且绕过需额外条件(-1)                   │
  │      score = a + b + c + d                                    │
  │      score ≥ 5 = Critical | 3-4 = High | 1-2 = Medium | ≤0 = Low │
  │                                                              │
  │   2. 当决策树等级 ≠ Agent 原始等级:                           │
  │      差 1 级 → 取决策树等级                                   │
  │      差 ≥ 2 级 → 标记为"等级争议"，在报告中说明两种评估理由   │
  │                                                              │
  │   3. 同类漏洞统一等级:                                        │
  │      同一 Sink 类别的多个实例 → 取最高实例的等级作为该类统一值 │
  │                                                              │
  │ ★ 攻击链自动构建（严重度校准后、写报告前执行）:               │
  │   1. 列出所有 Critical/High 发现，标注:                       │
  │      - 前置条件: 需认证(Y/N)? 需特定权限(哪种)?               │
  │      - 利用结果: 信息泄露/RCE/权限提升/文件读写?              │
  │   2. 自动匹配候选链:                                          │
  │      发现A的"利用结果" 满足 发现B的"前置条件" → 候选链 A→B   │
  │      例: 认证绕过(A) → 需认证的RCE(B) = A→B 链               │
  │      例: 信息泄露获取密钥(A) → JWT伪造(B) → 管理API(C)       │
  │   3. 对每条候选链:                                            │
  │      - 验证数据流连通性（A的输出能否直接作为B的输入?）         │
  │      - 给出组合等级（按链末端影响+链起点可达性重评）           │
  │      - 每条链最多 3 层延伸（避免无限递归）                     │
  │   4. 在报告"攻击链分析"章节输出，与独立漏洞列表分离           │
  │                                                              │
  │ 最终报告 = 所有轮次合并结果（不是某一轮的结果）               │
  └──────────────────────────────────────────────────────────────┘
```

### 切分约束（Two Constraints）

1. **维度互不重叠** — 每个 Agent 负责独立的安全维度，不重复分析同一维度
2. **可完全并行执行** — Agent 之间无依赖关系，可同时启动

### 攻击面驱动的 Agent 方向

> Agent 切分由五层推导决定，不是某个案例的逆推。同一层级下不同架构模式会激活不同维度。

**T1 架构模式 → 激活的攻击面类别**:

| 架构模式 | 信任边界特征 | 重点维度 |
|---------|------------|---------|
| Web 单体应用 | 前端↔后端↔数据库 三层边界 | D1-D3（注入+认证+授权）为核心 |
| REST API 后端 | API Gateway↔Service↔DB，无前端渲染 | D1+D2+D3+D6，弱化 XSS |
| 微服务架构 | 服务间通信（gRPC/HTTP）+ API Gateway | 服务间认证、D6(内网SSRF)、配置中心 |
| Serverless | 函数↔云服务，无持久化进程 | IAM 权限过宽、事件注入、冷启动泄露 |
| 桌面/本地应用 | 本地文件系统 + 嵌入式DB | 本地提权、嵌入式DB注入、自动更新链 |

**T2 业务领域 → 关键逻辑漏洞方向**:

| 业务类型 | 逻辑漏洞重点 | D9 审计焦点 |
|---------|------------|-----------|
| 金融/支付 | 竞态条件、金额篡改、流程跳过 | 余额操作原子性、订单状态机 |
| 数据平台/BI | 多数据源注入、JDBC协议攻击、权限隔离 | 跨租户数据泄露、SQL引擎滥用 |
| 医疗/隐私 | PII泄露、审计日志完整性 | 数据脱敏、访问日志 |
| IoT/嵌入式 | 固件更新完整性、硬编码凭证 | OTA签名验证、默认密码 |
| SaaS 多租户 | 租户隔离、水平越权 | 资源归属校验、数据分区 |

**T3-T5 → 维度激活**: 由 LLM 结合框架知识(T3) + 部署配置(T4) + Grep探测(T5) 自主推导，不依赖固定映射表。

**Agent 切分原则**: 将激活的 D1-D10 维度按关联性分组 → 每组 = 1 个 Agent。

### Agent 组合模板

> Agent 划分由攻击面决定，不由语言决定。以下为构建模板的方法 + 参考示例。

**构建 Agent 模板三步法**:
1. **识别攻击面** → 从 Phase 1 的功能模块发现表和攻击面驱动表中提取维度
2. **合并相关维度** → 关联度高的维度合并为一个 Agent（如 D5+D6 文件与SSRF 常共现）
3. **平衡粒度** → 每个 Agent 覆盖 1-3 个维度，不宜过多（失焦）或过少（浪费并行度）

**示例: Java Spring Boot 项目** (仅为参考，非固定模板):
```
Agent 1: 注入 (D1) [sink-driven]
  — SQL/SpEL/LDAP/命令注入，追踪用户输入到Sink
Agent 2: 认证+授权+业务逻辑 (D2+D3+D9) [control-driven + config-driven]
  — ★ 此 Agent 使用 Control-driven 策略，输入 = Phase 1 端点-权限矩阵
  — D2(config): JWT/Session/Filter链配置验证
  — D3(control): 遍历端点矩阵验证权限注解 → CRUD 权限一致性对比 → 认证豁免路径审计
  — D9(control): findById 归属校验 → Mass Assignment(DTO隔离) → 状态机完整性 → 并发安全
  — 加载: references/core/phase2_deep_methodology.md（必须，非按需）
Agent 3: 文件+SSRF (D5+D6) [sink-driven]
  — 上传下载/路径遍历/SSRF/JDBC URL
Agent 4: 反序列化+RCE (D4) [sink-driven]
  — Java反序列化/Fastjson/Jackson/SnakeYAML
Agent 5: 配置+加密+供应链 (D7+D8+D10) [config-driven]
  — 硬编码密钥/Actuator/依赖CVE
```

**示例: Python Django/Flask 项目**:
```
Agent 1: 注入+SSTI (D1) [sink-driven]
  — ORM raw SQL/模板注入/命令注入(subprocess/os.system)
Agent 2: 认证+授权+业务逻辑 (D2+D3+D9) [control-driven + config-driven]
  — ★ 此 Agent 使用 Control-driven 策略，输入 = Phase 1 端点-权限矩阵
  — D2(config): Session管理/CSRF配置
  — D3(control): 遍历端点矩阵验证装饰器鉴权 → Django权限框架一致性 → 认证豁免路径
  — D9(control): get_object_or_404 归属校验 → ModelSerializer 字段过滤 → 状态机 → 竞态
  — 加载: references/core/phase2_deep_methodology.md（必须，非按需）
Agent 3: 文件+SSRF (D5+D6) [sink-driven]
  — 文件上传/路径遍历/requests库SSRF/PIL处理
Agent 4: 反序列化+RCE (D4) [sink-driven]
  — pickle/yaml.load/eval/exec/__import__
Agent 5: 配置+加密+供应链 (D7+D8+D10) [config-driven]
  — settings.py密钥/DEBUG模式/requirements.txt CVE
```

**其他语言**: 参照 `references/checklists/{language}.md` 中 D1-D10 的关键问题，按上述三步法自行构建 Agent 模板 → ...

### Agent 数量

> R1 数量 = f(攻击面, 代码量)，R2 数量由 ROUND_N_EVALUATION 缺口数精确计算（见状态机）。
> 参考: 小型(<10K) 2-3个, 中型(10K-100K) 3-5个, 大型(>100K) 5-9个。

### Root Coordinator 工作流

```
┌─────────────────────────────────────────────────────────┐
│                  Root Coordinator                        │
│  职责: 分解任务、分配子任务、汇总报告                      │
│  决策: 基于攻击面分析，不是固定模板                        │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │ 组件A   │       │ 组件B   │       │ 组件C   │
   │ 审计员  │       │ 审计员  │       │ 审计员  │
   └─────────┘       └─────────┘       └─────────┘
```

### 智能体原则

- 每个子任务聚焦 1-3 个相关漏洞类型
- 搜索模式独占分配（不重复搜索同一段代码）
- 明确输入（待审计代码范围）和输出（漏洞报告）
- 禁止通用型"检查所有问题"智能体
- Agent 方向 = f(攻击面)，Agent 数量 = f(攻击面大小, 代码量, 发现密度)

### Agent 合约（Agent Contract）

```
每个 Agent 启动前，主线程必须验证 prompt 包含以下合约字段:

  [搜索路径]   Phase 1 产出的核心代码目录列表
  [排除目录]   node_modules, .git, build, dist, target, test, frontend
  [工具约束]   搜索用 Grep（ripgrep, 1-3秒）, 文件名用 Glob, 读文件用 Read
               Bash 仅限系统命令（git, mvn, npm, docker）
  [禁止写法]   Bash 中的 grep/find/cat（违反 = 10-100x 性能退化）
  [调用预算]   工具总调用 ≤50 次, Bash ≤10 次, 超过 40 次开始汇总
  [max_turns]  Task 工具的 max_turns 参数（见下方预算表）
  [Turn预留]   Agent 必须在 turns_used ≥ max_turns - 3 时停止探索，
               立即产出结构化输出（HEADER → 发现表格 → SENTINEL）。
               不得将最后 3 个 turn 用于新的 Grep/Read 探索。
               违反此规则将导致输出丢失、需要额外 resume 成本。
  [超时策略]   Bash timeout ≤30s
               Grep 超时 → 缩小 path → 连续失败 2 次 → 跳过
  [审计策略]   sink-driven | control-driven | config-driven（可组合）
               sink-driven: Grep 危险函数 → Read 代码 → 追踪输入到 Sink → 验证无防护
               control-driven: 枚举端点/操作 → 逐一验证安全控制是否存在 → 缺失=漏洞
               config-driven: 搜索配置项/依赖版本 → 对比安全基线
               D1/D4/D5/D6 = sink-driven | D3/D9 = control-driven | D2/D7/D8/D10 = config-driven
               D3+D9 Agent 必须使用 control-driven 作为主策略（非辅助）
               control-driven Agent 的输入 = Phase 1 产出的「端点-权限矩阵」
  [轮次目标]   Round N 的目标函数 + 方法关键词（由状态机 NEXT_ROUND 确定）
  [前轮输入]   Round N≥2 时，包含结构化「跨轮传递结构」:
               COVERED/GAPS/CLEAN/HOTSPOTS/FILES_READ/GREP_DONE
               （格式见 ROUND_N_EVALUATION 状态机）
  [增量约束]   R2+ Agent 禁止: 重读 FILES_READ 文件（除非追踪新数据流）、
               重复 GREP_DONE 模式、扫描 CLEAN 方向。
               必须: 聚焦 GAPS 和 HOTSPOTS。
  [输出格式]   Agent 必须返回结构化摘要（见下方输出模板），禁止返回大段原始代码
  [截断防御]   输出必须以 === HEADER START === 开头（含覆盖率+候选+统计+FILES_READ+GREP_DONE），
               以 === AGENT_OUTPUT_END === 结尾。HEADER ≤400 字 + TRANSFER BLOCK ≤400 字。
               总输出 ≤5000 字。详情仅限 Critical + 高置信 High。
```

**Agent Token 预算管理**:

| 轮次 | Agent 类型 | 数量 | max_turns | 工具调用上限 | 说明 |
|------|-----------|------|-----------|-------------|------|
| R1 | 广度扫描 | 3-5 | 25 | 50 | Grep 定位 + 入口识别 |
| R2 | 增量补漏 | 1-3（按缺口） | 20 | 50 | 只覆盖 R1 缺口 + 数据流深度 |
| R3 | 攻击链验证 | 0-1 | 15 | 30 | 仅有跨模块候选时启动 |
| **合计** | | **4-9** | | | **总 turns: 95-200**（vs 旧方案 235-335） |

**Token 节约规则**（Agent 内部执行）:
1. **定向读取**: Read 用 offset/limit 读取相关代码段（50-100行），禁止无限制读整文件
2. **Grep 先行**: 先 Grep 定位行号 → 再 Read 该行号±20行上下文
3. **提前终止**: 同一维度发现 ≥5 个同类漏洞时，记录模式 + 影响范围，不再逐个深挖
4. **合并同类**: 同一 pattern 在多个文件出现 → 报告 1 个发现 + 受影响文件列表

**Agent 输出模板**（每个 Agent 必须按此格式返回）:

> ⚠️ **截断防御**: HEADER 段放在输出最前部，是 R2 决策和覆盖率评估的唯一数据来源。
> 即使后续 findings 被截断，HEADER 中的元数据仍可存活。Agent 必须严格遵守此顺序。

```
## Agent: {方向名称} | Round {N} | 发现: {数量}

=== HEADER START ===
COVERAGE: D1=✅(3,fan=5/12), D2=⚠️(1,fan=1/8), D3=❌, ...
  sink-driven 维度: fan=已追踪文件数/Grep命中文件数
  control-driven 维度(D3/D9): epr=已验证端点数/矩阵总端点数, crud_types=N
  示例: D3=✅(2,epr=35/45,crud_types=5), D9=⚠️(1,epr=10/45,crud_types=2)
UNCHECKED: D1:[orderBy injection]: ORDER BY ${param} | D2:[session fixation]: session.getId()
UNFINISHED: {描述}|{原因: 超时/超预算/需下轮深入}, ...
STATS: tools={N}/50 | files_read={N} | grep_patterns={N} | endpoints_audited={N}/{total} | time=~{N}min
=== HEADER END ===

=== TRANSFER BLOCK START ===
FILES_READ: {file1}:{结论} | {file2}:{结论} | ... (R2 不再重读)
GREP_DONE: {pattern1} | {pattern2} | ... (R2 不再重复)
HOTSPOTS: {file:line:断点描述} | ... (R2 优先深入，含断点上下文)
=== TRANSFER BLOCK END ===

说明:
- HEADER(≤400字) + TRANSFER BLOCK(≤400字) = 总预算 800 字，分两段防截断
- COVERAGE 中 fan=已追踪文件数/Grep命中文件数（sink-driven 扇出率）
- COVERAGE 中 epr=已验证端点数/矩阵总端点数（control-driven 端点审计率）
- COVERAGE 中 crud_types=已执行 CRUD 权限一致性对比的资源类型数
- FILES_READ: 仅含数据流分析过的核心文件及关键结论
- GREP_DONE: 已执行的 Grep 模式（供 R2 去重）
- HOTSPOTS: R1 发现但未深入的高风险点，格式 `file:line:断点描述`
  示例: `CalciteProvider.java:135:charReplace未追踪` | `TokenFilter.java:42:白名单逻辑待验证`
- FILES_READ + GREP_DONE + HOTSPOTS 是 R2 跨轮传递的关键输入，R1 Agent 必须产出

### 发现列表（表格格式，按严重度排序）

| # | 等级 | 漏洞标题 | 位置 | 关键证据(≤60字) | 数据流 |
|---|------|---------|------|----------------|--------|
| 1 | C | JWT无签名验证 | TokenUtils.java:14 | JWT.decode(token) 无 verify | HTTP→TokenFilter→JWT.decode→ThreadLocal |
| 2 | H | SSRF无URL校验 | ApiUtils.java:358 | HttpClient.get(userUrl) | API请求→getUrl()→HttpClient.get |
| ... | | | | | |

### 发现详情（仅 Critical 和需要 PoC 的 High，每条 ≤5 行）

**[C-01] JWT无签名验证**
代码: `JWT.decode(token)` 替代 `JWT.require(algo).build().verify(token)`
数据流: Request→TokenFilter.doFilter()→TokenUtils.validate()→JWT.decode()→userBOByToken()
影响: 伪造任意 uid 的 JWT 即可冒充管理员

=== AGENT_OUTPUT_END ===
```

**输出预算规则**（Agent 内部执行）:
- HEADER 段: ≤ 400 字 + TRANSFER BLOCK: ≤ 400 字（总 800 字，分两段防截断，必须完整输出）
- 发现表格: 每条 1 行 ≤ 150 字，最多 20 行
- 发现详情: 仅 Critical + 高置信 High，每条 ≤ 5 行，最多 10 条
- 超出的 findings: 仅在表格中占 1 行，详情留给 REPORT 阶段主线程补充
- **总输出目标: ≤ 5000 字**（远低于上下文窗口截断阈值）
- 禁止: 输出大段原始代码（>3行）、完整文件内容、冗长的修复建议

**自动注入模板 — R1（复制到每个 R1 Agent prompt）**:

```
---Agent Contract---
1. 搜索路径: {paths}。排除: {excludes}。
2. 必须使用 Grep/Glob/Read 工具。禁止 Bash 中 grep/find/cat。
3. 工具调用 ≤50 次，Bash ≤10 次。max_turns: {N}。
   ★ Turn 预留: turns_used ≥ max_turns-3 时立即停止探索，产出结构化输出。
4. Bash timeout: 30000。Grep 超时→缩小 path→失败 2 次→跳过。
5. 搜索策略: Grep 定位行号 → Read offset/limit 读上下文（±20行）。禁止整文件读取。
6. 输出: 按 Agent 输出模板返回结构化摘要。禁止返回大段原始代码（>3行）。
7. 节约: 同类漏洞 ≥5 个合并报告。同 pattern 多文件列清单不逐个深挖。
8. 同维度多入口（有界枚举）:
   a. Sink 类别枚举: 每个维度发现 ≥1 个入口后，**一次性**枚举该维度剩余 Sink 类别
      （从 LLM T3 框架知识推导）。枚举结果固定，后续不再扩展。
   b. 类别上界: 每维度最多 8 个 Sink 类别。超过则按危险度排序取 Top 8。
   c. 实例采样: 每个 Sink 类别最多深度追踪 3 个实例，其余合并报告（影响范围 + 数量）。
   d. 禁止再生: UNCHECKED_CANDIDATES 只在当前 Agent 枚举一次，
      R2 Agent 审计候选时**不得**产生新的 UNCHECKED_CANDIDATES 链式扩展。
   e. 格式: UNCHECKED_CANDIDATES: [{sink_type}: {grep_pattern}, ...] (最多 8 项)
9. 数据转换管道追踪（D1 注入类维度必须执行）:
   a. 发现 Sink 函数后，不仅追踪直接调用者，还必须向上追踪中间构造/转换层:
      数据流模型: Source → [Transform₁ → Transform₂ → ... → Transformₙ] → Sink
      典型中间层命名模式: *Builder, *Provider, *Manager, *Utils, *Helper, *Handler,
      *Str*, *Trans*, *Process*, *Assemble*, *Render*, *Compile*
   b. 操作: 对每个 Sink → Grep 调用位置 → 对调用者 Grep 输入来源 → 重复直到找到
      外部输入(Source) 或到达 3 层上限。每层用 Read offset/limit 验证。
   c. 中间转换层若接受外部参数但无清洗/参数化 → 标记为独立注入入口（可能被多个 Sink 共享）。
   d. 此规则确保不遗漏"Source 经过 Builder/Provider 间接到达 Sink"的注入路径。
10. ★ 截断防御（必须严格遵守）:
   a. 输出第一段必须是 === HEADER START === ... === HEADER END === 元数据块
      含: COVERAGE, UNCHECKED, UNFINISHED, STATS, FILES_READ, GREP_DONE 六个字段
   b. HEADER ≤ 400 字 + TRANSFER BLOCK ≤ 400 字（总 800 字）。即使 findings 被截断，HEADER+TRANSFER 仍可存活。
   c. 发现列表用表格格式（每条 1 行），详情仅限 Critical + 高置信 High。
   d. 总输出 ≤ 5000 字。超出预算时: 压缩详情 > 删减 Low 发现 > 绝不压缩 HEADER。
   e. 输出最后一行必须是 === AGENT_OUTPUT_END === 作为完整性哨兵。
---End Contract---
```

**自动注入模板 — R2+（复制到每个 R2+ Agent prompt）**:

```
---Agent Contract (R2+)---
1-7. [与 R1 相同的基础合约，含 Turn 预留规则]
7.5 数据转换管道追踪: 同 R1 条款 #9。对 GAPS 中的注入类维度，优先追踪 HOTSPOTS 中的中间转换层。
   ★ Turn 预留（R2 更严格）: turns_used ≥ max_turns-3 时立即产出输出。R2 Agent max_turns 较少，必须严守。
8. 前轮传递:
   COVERED: {dimensions}
   GAPS: {dimensions} ← 你的审计目标
   CLEAN: {patterns} ← 直接跳过
   HOTSPOTS: {file:line:断点描述 list} ← 优先深入（含 R1 断在哪一步的上下文）
   FILES_READ: {file:conclusion list} ← 不再重读（除非追踪新数据流）
   GREP_DONE: {pattern list} ← 不再重复
9. 增量规则: 只审计 GAPS 维度。CLEAN 方向不搜索。
   FILES_READ 文件不重读。R2 核心任务: 追踪入口点到 Sink 的数据流。
10. 收敛规则: R2+ Agent **禁止**输出 UNCHECKED_CANDIDATES。
    候选链深度 = 1: R1 产生候选 → R2 消化候选 → 终止。不再扩展。
11. ★ 截断防御: 同 R1 条款 #10。HEADER 在最前，AGENT_OUTPUT_END 在最后。
---End Contract---
```

**主线程 Token 保护**:
- 接收 Agent 输出后，提取发现列表 + 统计信息，丢弃原始推理过程
- 传递给下一轮的前轮输入 ≤500 字精简摘要（漏洞标题 + 位置 + 严重程度）
- 最终报告从各轮精简摘要中汇总，不回溯原始 Agent 上下文

**主线程截断检测与恢复**（ROUND_N_RUNNING 阶段，Agent 完成后立即执行）:

```
对每个 Agent 的返回输出:
  1. 检查哨兵: 输出末尾是否包含 === AGENT_OUTPUT_END ===
     ├── YES → 输出完整，正常处理
     └── NO  → 截断发生，执行恢复流程 ↓

  2. 截断恢复流程:
     a. 检查 HEADER: 输出头部是否包含 === HEADER START === ... === HEADER END ===
        ├── YES → HEADER 存活，提取 COVERAGE/UNCHECKED/STATS 用于 EVALUATION
        │         标记: findings_truncated = true
        └── NO  → 严重截断（HEADER 也丢失），必须 resume Agent

     b. 当 findings_truncated = true:
        - HEADER 中的 COVERAGE 和 UNCHECKED 正常用于 R2 决策
        - 发现列表不完整 → resume Agent: "请仅输出发现表格中第 N+1 条及之后"
        - 如 resume 也截断 → 将已有发现 + HEADER 中的发现数对比
          缺失数 ≤ 3 → 接受损失，在报告中标注"该 Agent 有 N 条发现因截断丢失"
          缺失数 > 3 → 必须再次 resume 或拆分该维度为两个更小的 Agent

     c. 当 HEADER 也丢失（严重截断）:
        - resume Agent: "请仅输出 HEADER 段（COVERAGE/UNCHECKED/UNFINISHED/STATS）"
        - 如 resume 仍截断 → 该 Agent 维度标记为 ⚠️ 浅覆盖，强制进入 R2

  3. Agent 部分失败处理（非截断，而是 Agent 早期崩溃/持续超时）:
     - Agent 输出 < 5 条发现 + 无 HEADER → 该 Agent 维度标记 ❌
     - 直接纳入 R2 GAPS，不尝试 resume（成本不合理）
     - Agent 有 HEADER 但发现 < 3 条 → 维度标记 ⚠️，纳入 R2 浅覆盖

  4. 预防优化: 如同一审计中 ≥2 个 Agent 发生截断 →
     后续 Agent 启动时追加提示: "输出预算严格 ≤ 3000 字"
```

---

## Multi-Round Audit Strategy

> 多轮审计不是"重复做同一件事"，而是每轮执行不同类型的分析。

### 三轮模型

| 轮次 | 目标函数 | 方法 | 发现的漏洞类型 |
|------|---------|------|--------------|
| **第一轮** | `max(覆盖面)` | Grep 模式匹配 + 入口点识别 | 模式明显的漏洞（硬编码、未验证、配置缺陷） |
| **第二轮** | `max(深度)` | 逐行代码审计 + 数据流分析 | 需要追踪才能发现的漏洞（SQL 拼接链、协议注入） |
| **第三轮** | `max(关联度)` | 攻击链构建 + 交叉验证 | 单独看不危险、组合后高危的漏洞（IDOR+白名单） |

### 每轮的工具组合

| 维度 | 第一轮 | 第二轮 | 第三轮 |
|------|--------|--------|--------|
| 主要工具 | Grep（模式搜索） | Read（逐行审计） | Read + 逻辑推理 |
| Agent 数量 | 多（3-5 个并行） | 中（2-3 个针对性） | 少（1 个交叉验证） |
| 外部工具 | Semgrep/Gitleaks | LSP 追踪 | 攻击链构建 |
| 搜索方式 | 关键词匹配→定位文件 | 文件内数据流追踪 | 跨文件对比分析 |

### 轮次参照

| 项目规模 | 典型轮次 | 典型 Agent 总数 |
|---------|---------|----------------|
| 小型（<10K） | 1 轮 | 2-3 个 |
| 中型（10K-50K） | 1-2 轮 | 3-5 个 |
| 大型（50K-200K） | 2-3 轮 | 5-9 个 |
| 超大型（>200K） | 2-4 轮 | 8-15 个 |

### Round 2 Agent 切分原则（深度轮）

> Round 2 按"待追踪的数据流"切分，而非"攻击面类型"。
> 典型方向: SQL数据流追踪(Controller→Service→DAO) | 加密生命周期(生成→存储→传输→使用) | 认证深度验证(白名单+IDOR)

### 增量效率优化（Token 节约策略）

> 核心原则: **R2 只补缺口+加深度，不重复已覆盖维度的浅层搜索。**
> 哲学来源: R1=侦察(画地图)，R2=利用(追数据流)，R3=关联(交叉验证)。

**三层 Token 节约机制**:

| 层 | 机制 | 节约量 | 说明 |
|----|------|--------|------|
| 1 | **增量 Agent 分配** | ~30% | R2 Agent 数量 = f(缺口数)，不是固定数量 |
| 2 | **文件读取去重** | ~20% | FILES_READ 清单避免 R2 重读已分析文件 |
| 3 | **搜索模式去重** | ~15% | GREP_DONE 清单避免 R2 重复已执行搜索 |

**自适应轮次决策**: 详见执行状态机 `ROUND_N_EVALUATION` 段（单一权威来源，此处不重复）。

**关键区分**: "覆盖维度" = R1 搜索过该方向（Grep 命中），"深度分析" = 追踪了数据流到 Sink。R2 的价值在于深度，不在于广度重复。

---


## Output Format

### 报告总体架构

```
1. 项目概要信息 ── 项目名称、日期、技术栈、规模、统计
2. 漏洞分类统计 ── 按严重度/控制类型/漏洞类型统计
3. 漏洞摘要表格 ── 所有漏洞的快速导航
4. 漏洞详细报告 ── 每个漏洞的完整分析（6个部分）
   - 每个漏洞必须包含：存在性分析、数据流图、代码证据、利用条件、修复建议、验证结论
5. 总结与建议 ── 总体风险评估、修复优先级排序
```

**⚠️ 强制格式要求**:

1. **单一报告文件**: 所有内容在一个 Markdown 文件中
2. **详细漏洞报告**: 每个漏洞必须包含完整的6个部分分析
3. **详细格式规范**: 使用包含存在性分析、数据流图、代码证据、利用条件、修复建议、验证结论的格式，而非摘要格式
4. **完整数据流**: 使用 Mermaid flowchart 图表展示攻击路径
5. **具体修复建议**: 包含代码示例和验证步骤

**报告质量标准**：

| 标准 | 要求 |
|------|------|
| **详细格式** | 每个漏洞包含6个完整部分（存在性、数据流、代码证据、利用条件、修复建议、验证结论） |
| **可定位** | 每个漏洞有精确的文件路径和行号 |
| **可复现** | 提供足够信息让开发者复现问题 |
| **可修复** | 给出具体的代码修复方案，不是泛泛而谈 |
| **无误报** | 每个漏洞都经过数据流验证 |
| **完整分析** | 不仅说"有问题"，还说明完整利用路径和影响 |
| **数据流图** | 使用 Mermaid flowchart 展示攻击路径 |
| **代码示例** | 修复建议包含具体代码示例 |

### 漏洞报告详细模板

```markdown
### <a id="漏洞-1"></a>漏洞 #1: [漏洞类型] - [严重度]

#### 1. 漏洞存在性
**存在**：[明确说明漏洞是否存在及根本原因]

#### 2. 数据流完整分析
```mermaid
graph TD
    A[用户输入] --> B[接口接收]
    B --> |[操作名称]| C["处理函数()"]
    C --> |直接拼接/缺失控制| D[危险操作]
    D --> |漏洞触发| E[安全风险]
```

#### 3. 关键代码证据
**代码位置**: `文件路径:行号`
```language
[完整代码片段，包含上下文]
```

#### 4. 漏洞利用条件
- **漏洞类型**: [SQL注入/命令注入/XSS等]
- **严重度**: [CRITICAL/HIGH/MEDIUM/LOW]
- **CVSS评分**: [X.X]
- **利用条件**:
  1. [条件1：攻击者能访问相关接口]
  2. [条件2：恶意构造的参数能通过验证]
  3. [条件3：缺失的安全控制未被其他机制补偿]
- **攻击示例**:
```bash
# 攻击payload示例
curl "http://target.com/api/vuln?param=malicious_payload"
```
- **攻击效果**: [详细描述攻击成功后的后果]

#### 5. 风险等级与修复建议
**风险等级**: **严重度** (CVSS评分: X.X)

- **可远程利用**: 是/否
- **完全控制权**: 是/否
- **数据泄露**: [规模描述]

**修复方案**:

1. **输入过滤**:
```language
# 添加白名单验证
if (!taskParams.matches("^[a-zA-Z0-9_]+$")) {
    throw new IllegalArgumentException("Invalid parameters");
}
```

2. **安全执行方式**:
```language
# 使用参数化的安全方法
ProcessBuilder pb = new ProcessBuilder("system_command", "--param", sanitizedParams);
```

3. **框架层加固**:
```language
// 在接口层添加注解约束
@Pattern(regexp="^[^;|&]*$")
public String executeTask(@RequestBody Request request) { ... }
```

#### 6. 验证结论
- ✓ **漏洞触发链完整**: 用户输入→拼接/缺失控制→危险执行，无任何过滤环节
- ✓ **代码证据充分**: 实际代码分析，包含文件路径和行号
- ✓ **利用条件明确**: 清晰的攻击向量和影响范围
- ✓ **修复方案具体**: 提供可执行的代码修复示例
```

### 污点分析报告模板

> 完整模板: `references/core/taint_analysis.md`
> 格式: 基本信息(类型/CWE) → Source(位置/类型/代码) → Propagation(逐步路径) → Sink(位置/危害) → 分析结论(净化/复杂度) → PoC+修复

---

## Permissions / Execution Policy

```
权限策略:
├─ 只读 (默认): 源代码、配置、依赖清单、CI/CD配置、IaC文件
├─ 可执行: semgrep, bandit, gosec, npm audit, pip-audit (本地静态分析)
├─ 可写: 仅在用户明确请求修复时使用 Edit
└─ 网络: 默认不出网，可访问官方 CVE 数据库 (需说明)

安全原则:
- 敏感信息脱敏: 密钥仅显示前4后4位 (AKIA****XYZ0)
- 范围限制: 仅审计用户指定目录，遵守 .gitignore
- 透明度: 每个发现标注 文件:行号，说明工具用途
```

---

## Tool Usage

使用以下工具进行安全审计:

### 工具使用原则

**Grep用于面**(快速定位) → **Read用于线**(数据流追踪) → **逻辑推理用于点**(漏洞确认) → **Task/Agent用于并行加速**

> LSP 语义分析（goToDefinition/findReferences/incomingCalls）详见 `references/core/semantic_search_guide.md`，需 LSP 环境时参考。

### 核心工具 (只读,默认使用)

```
文件读取与搜索:
- Read: 读取源代码、配置文件、CI/CD配置、IaC文件
- Glob: 按模式批量搜索文件 (*.py, *.js, *.java, *.xml, *.yml, Dockerfile, *.tf)
- Grep: 基于正则表达式搜索危险模式、敏感信息
```

### 代码修复工具 (可写,仅在用户明确授权时使用)

```
修复工具:
- Edit: 应用安全补丁,修复已识别的漏洞代码
  使用前提:
  1. 用户明确请求"修复"、"应用补丁"、"生成修复代码"
  2. 已向用户清晰说明将要修改的文件和内容
  3. 已提醒用户备份或确认使用版本控制
```

### 错误恢复指导

| 错误类型 | 处理策略 |
|---------|---------|
| 文件不存在 | Glob 确认正确路径 → 检查拼写 → 跳过继续 |
| 文件过大 | Read 指定行范围 → Grep 先定位 → 分块读取 |
| 工具不可用 | 使用替代工具 → 记录不可用情况 → 继续分析 |
| Grep 超时 | 缩小 path → 简化正则 → 限定文件类型 → 禁止回退 Bash grep |
| 重复失败 | 连续3次失败 → 换参数/方法 → 跳过 → 记录原因 |

循环检测: 不反复尝试相同失败操作。同一文件不超过3次尝试。已有足够发现时可直接进入报告。

### 检测命令参考

> 完整检测命令: `references/core/security_indicators.md`
> 语言专项检测: `references/checklists/{language}.md` D1 段
> 框架专项检测: `references/frameworks/{framework}.md`（如有）
> **规则**: 必须使用 Grep 工具，禁止 Bash grep。LLM 应基于项目技术栈自行构造搜索模式。
> Agent 工具使用限制参见 "Agent 合约（Agent Contract）" 节

---

## Quality Control

> 发现质量验证（文件存在性/代码真实性/行号准确性/可利用性）详见 Core Philosophy 防幻觉规则，此处不重复。

### 发现去重规则

同一漏洞的判定标准 (满足任一即为重复):
1. **同文件 + 同行号** → 合并
2. **同文件 + 同漏洞类型 + 行号相差 < 10** → 合并
3. **同文件 + 描述相似度 > 80%** → 合并

合并策略:
- 保留更详细的描述
- 保留更高的严重等级
- 合并所有相关代码片段

### 置信度标注

```
置信度等级（客观判定标准）:

- [已验证]  必须同时满足:
  ① 完整数据流: Source→[Transform]→Sink 每一跳都用 Read 验证了代码
  ② 无有效防护: 确认传播路径上无参数化/白名单/编码等有效净化
  ③ 可构造输入: 能给出具体的触发 payload 或 PoC 步骤

- [高置信]  满足 ①+②，但缺 ③:
  数据流完整追踪 + 确认无有效防护，但利用条件需特定环境（如特定数据库/配置）
  或: 满足 ①+③ 但防护绕过需进一步验证

- [中置信]  仅满足 ①:
  追踪了数据流但未完整覆盖所有跳（如中间 Transform 层未读代码），
  或存在防护但不确定是否可绕过

- [需验证]  仅满足部分条件:
  Grep 命中危险模式但未追踪数据流，或仅基于代码模式推测

报告规则:
- Critical/High 漏洞: 必须达到 [高置信] 或 [已验证]
- Medium 漏洞: 允许 [中置信]，但需标注缺失的验证步骤
- Low/Info: 允许 [需验证]
- 报告中标注置信度时，必须注明满足了哪些条件（如 "①② 已满足，③ 需特定 ClickHouse 环境"）
```

---


## Severity Rating

### 等级定义

| 级别 | CVSS 3.1 | 标准 | 示例 |
|------|----------|------|------|
| Critical | 9.0-10.0 | 可直接RCE或完整数据泄露，无需复杂前置条件 | 命令注入、SQL导出数据库 |
| High | 7.0-8.9 | 可获取敏感数据或权限提升 | IDOR、认证绕过 |
| Medium | 4.0-6.9 | 需用户交互或有限影响 | 存储型XSS、CSRF |
| Low | 0.1-3.9 | 信息泄露或需特殊条件 | 版本泄露、详细错误 |

### 三维评估模型

```
严重等级 = f(可达性, 影响范围, 利用复杂度)
```

| 维度 | 加重（→高等级） | 中等 | 减轻（→低等级） |
|------|---------------|------|---------------|
| 可达性 | 未认证可达 | 低权限可达 | 管理员权限才可达 |
| 影响范围 | RCE/全库读取 | 部分数据泄露 | 信息收集 |
| 利用复杂度 | 单请求触发 | 需多步骤 | 需特定环境配合 |

### 判定决策树

```
          漏洞发现
             │
      ┌──────┴──────┐
      │ 未认证可达？  │
      └──────┬──────┘
        YES /   \ NO
           /     \
    ┌─────┴─┐  ┌─┴──────┐
    │ RCE/  │  │ RCE/   │
    │ 全库？ │  │ 全库？  │
    └──┬────┘  └──┬─────┘
   YES/ \NO    YES/ \NO
    │    │      │    │
Critical │    High   │
     ┌──┴──┐    ┌──┴──┐
     │广泛  │    │影响？│
     │泄露？│    └──┬──┘
     └──┬──┘   数据  加固
   YES/ \NO   泄露  建议
    │    │      │    │
  High Medium Medium Low
```

### 攻击链对等级的影响

- 漏洞A(认证绕过) + 漏洞B(需认证的RCE) → 漏洞B 按"未认证可达"重评
- 编号等级 = 独立等级（假设攻击者无其他漏洞）
- 攻击链部分单独给出"组合等级"

### 编号体系

| 前缀 | 含义 | 示例 |
|------|------|------|
| C-XX | Critical | `[C-01] JWT签名未验证导致认证绕过` |
| H-XX | High | `[H-01] SSRF可访问内网元数据` |
| M-XX | Medium | `[M-01] 存储型XSS` |
| L-XX | Low | `[L-01] 版本信息泄露` |

---


