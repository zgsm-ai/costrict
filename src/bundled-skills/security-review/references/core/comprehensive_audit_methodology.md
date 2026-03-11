# 全面审计方法论 - 避免遗漏的系统性框架

> 基于真实审计遗漏案例总结的方法论改进
> 核心原则：**假设越少，验证越多，遗漏越少**

---

## 审计遗漏的根本原因

### 三大致命假设

| 假设 | 后果 | 正确做法 |
|------|------|----------|
| 核心模块最重要 | 漏掉插件/扩展中的漏洞 | **扫描所有模块，无一例外** |
| 有防护就安全 | 漏掉不完整的防护 | **验证防护的每一项配置** |
| 某路径不可达 | 漏掉隐藏的入口点 | **穷举所有入口点** |

### 方法论缺陷

```
❌ 错误：广度优先变成深度优先
   - 看到一个点就深入，忽略其他点
   - 正确：先建立完整攻击面，再逐点深入

❌ 错误：依赖经验和直觉
   - 没有可重复、可验证的流程
   - 正确：使用检查清单，逐项勾选

❌ 错误：发现防护就跳过
   - 认为有防护 = 安全
   - 正确：验证防护是否完整、是否可绕过
```

---

## Phase 0: 攻击面测绘（必须100%完成）

### 0.1 模块/插件完整清单

**强制步骤：列出所有代码模块**

```bash
# Java/Maven 项目
find . -name "pom.xml" | head -50
cat pom.xml | grep -A2 "<module>"

# Gradle 项目
find . -name "build.gradle" | head -50

# Node.js 项目
find . -name "package.json" -not -path "*/node_references/*" | head -50

# Go 项目
find . -name "go.mod" | head -50

# Python 项目
find . -name "setup.py" -o -name "pyproject.toml" | head -50
```

**验证清单**：
- [ ] 核心模块 (core)
- [ ] 所有插件 (plugins/*)
- [ ] 所有扩展 (extensions/*)
- [ ] 测试代码 (test/*, **/test/**)
- [ ] 示例代码 (examples/*, samples/*)
- [ ] 构建脚本 (build.gradle, pom.xml, Makefile)
- [ ] 配置文件 (application*.yml, *.properties, *.conf)
- [ ] CI/CD 配置 (.github/workflows/*, .gitlab-ci.yml, Jenkinsfile)
- [ ] 容器配置 (Dockerfile, docker-compose.yml, k8s/*.yaml)

### 0.2 入口点完整清单

**所有可能的入口点类型**：

| 入口类型 | 识别方法 | 检测命令 |
|----------|----------|----------|
| HTTP 端点 | @RequestMapping, @GetMapping, @PostMapping | `grep -rn "@.*Mapping\|@Path\|@Get\|@Post" --include="*.java"` |
| REST API | @RestController, JAX-RS | `grep -rn "@RestController\|@Path" --include="*.java"` |
| SOAP 端点 | @WebService, @WebMethod | `grep -rn "@WebService\|@WebMethod" --include="*.java"` |
| WebSocket | @ServerEndpoint, @OnMessage | `grep -rn "@ServerEndpoint\|@OnMessage" --include="*.java"` |
| 文件上传 | MultipartFile, @RequestParam("file") | `grep -rn "MultipartFile\|@RequestParam.*file" --include="*.java"` |
| 定时任务 | @Scheduled, Quartz, Timer | `grep -rn "@Scheduled\|CronTrigger\|Timer" --include="*.java"` |
| 消息队列 | @KafkaListener, @RabbitListener | `grep -rn "@KafkaListener\|@RabbitListener\|@JmsListener" --include="*.java"` |
| RPC | gRPC, Dubbo, Thrift | `grep -rn "grpc\|DubboService\|TProcessor" --include="*.java"` |
| 反序列化 | readObject, fromXML, parse | `grep -rn "readObject\|fromXML\|\.parse(" --include="*.java"` |
| 配置加载 | @Value, @ConfigurationProperties | `grep -rn "@Value\|@ConfigurationProperties" --include="*.java"` |

#### 0.2.1 LSP 增强入口点分析 (v2.4.0)

> 使用 LSP 进行精确的入口点枚举和调用关系分析

**LSP 入口点枚举流程**:

```
场景: 分析 UserController 的完整攻击面

Step 1: 列出 Controller 所有方法
└─ LSP documentSymbol(UserController.java, 1, 1)
   返回:
   ├─ getUser()        line 25
   ├─ createUser()     line 45
   ├─ updateUser()     line 68
   └─ deleteUser()     line 92

Step 2: 分析每个方法的调用链
└─ LSP outgoingCalls(UserController.java, 25, 10)
   返回 getUser() 调用的所有方法:
   ├─ UserService.findById()
   ├─ UserValidator.validate()
   └─ UserDao.query()

Step 3: 追踪到 Sink
└─ LSP outgoingCalls(UserDao.java, query方法行号, col)
   返回:
   └─ jdbcTemplate.query() ← SQL 执行点
```

**LSP vs Grep 入口点发现**:

| 方法 | 优点 | 缺点 |
|------|------|------|
| Grep `@Mapping` | 快速、覆盖广 | 匹配字符串/注释 |
| LSP documentSymbol | 精确、结构化 | 需逐文件分析 |
| **推荐组合** | Grep 找文件，LSP 分析内容 | - |

**推荐工作流**:

```bash
# Step 1: Grep 快速找到所有 Controller 文件
grep -rln "@Controller\|@RestController" --include="*.java"

# Step 2: 对每个 Controller 使用 LSP 分析
for controller in $(grep结果); do
    LSP documentSymbol $controller 1 1
done

# Step 3: LSP 追踪每个入口的调用链
LSP outgoingCalls $controller $method_line $col
```

**攻击面映射矩阵**:

```
┌─────────────────────────────────────────────────────────────┐
│  入口点          │  调用链                │  Sink 类型      │
├─────────────────────────────────────────────────────────────┤
│  GET /user/{id}  │  Controller→Service   │  SQL Query      │
│                  │  →DAO→jdbcTemplate    │                 │
├─────────────────────────────────────────────────────────────┤
│  POST /user      │  Controller→Validator │  SQL Insert     │
│                  │  →Service→DAO         │  + File Write   │
└─────────────────────────────────────────────────────────────┘
```

### 0.3 Content-Type 敏感入口

**必须追踪所有接受特定 Content-Type 的端点**：

```bash
# XML 入口 (XXE 风险)
grep -rn "application/xml\|text/xml\|consumes.*xml" --include="*.java"
grep -rn "produces.*xml" --include="*.java"

# JSON 入口 (反序列化风险)
grep -rn "application/json\|consumes.*json" --include="*.java"

# Form 入口 (CSRF、注入风险)
grep -rn "application/x-www-form-urlencoded\|multipart/form-data" --include="*.java"

# 自定义 Content-Type
grep -rn "Content-Type\|@Consumes\|consumes\s*=" --include="*.java"
```

### 0.4 第三方依赖清单

```bash
# Java - Maven
mvn dependency:tree > dependencies.txt 2>/dev/null || cat pom.xml | grep -A3 "<dependency>"

# Java - Gradle
gradle dependencies > dependencies.txt 2>/dev/null || cat build.gradle | grep "implementation\|compile"

# Node.js
npm list --all 2>/dev/null || cat package.json | jq '.dependencies, .devDependencies'

# Python
pip freeze 2>/dev/null || cat requirements.txt

# Go
go list -m all 2>/dev/null || cat go.mod
```

---

## Phase 1: 漏洞类型检查（每类必须有完整清单）

### 核心原则

```
⚠️ 重要：每种漏洞类型必须检查清单中的【所有项目】
⚠️ 重要：看到有防护代码不等于安全，必须验证防护的完整性
⚠️ 重要：缺少任何一项防护配置都可能导致漏洞可利用
```

### 1.1 XXE 完整检查清单

**必须搜索的所有 XML 解析器**：

| 解析器类 | 搜索命令 |
|----------|----------|
| DocumentBuilderFactory | `grep -rn "DocumentBuilderFactory" --include="*.java"` |
| SAXParserFactory | `grep -rn "SAXParserFactory" --include="*.java"` |
| XMLInputFactory | `grep -rn "XMLInputFactory" --include="*.java"` |
| TransformerFactory | `grep -rn "TransformerFactory" --include="*.java"` |
| Validator | `grep -rn "Validator\|SchemaFactory" --include="*.java"` |
| XMLReader | `grep -rn "XMLReader" --include="*.java"` |
| SAXReader (dom4j) | `grep -rn "SAXReader" --include="*.java"` |
| SAXBuilder (jdom) | `grep -rn "SAXBuilder" --include="*.java"` |
| Digester (Apache) | `grep -rn "Digester" --include="*.java"` |
| DomHelper | `grep -rn "DomHelper" --include="*.java"` |

**每个解析器必须验证的配置项**（缺一不可）：

```java
// 必须同时设置以下所有配置才算安全：

// 1. 禁用 DOCTYPE（最关键，很多审计会漏掉这一项！）
factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);

// 2. 禁用外部通用实体
factory.setFeature("http://xml.org/sax/features/external-general-entities", false);

// 3. 禁用外部参数实体
factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);

// 4. 禁用外部 DTD 加载
factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);

// 5. 禁用 XInclude
factory.setXIncludeAware(false);

// 6. 禁用实体引用扩展（可选但推荐）
factory.setExpandEntityReferences(false);
```

**XXE 检查验证矩阵**：

| 检查项 | 状态 | 备注 |
|--------|------|------|
| disallow-doctype-decl = true | [ ] | **最关键，常被遗漏** |
| external-general-entities = false | [ ] | |
| external-parameter-entities = false | [ ] | |
| load-external-dtd = false | [ ] | |
| XIncludeAware = false | [ ] | |
| ExpandEntityReferences = false | [ ] | |

**⚠️ 警告**：只设置 `FEATURE_SECURE_PROCESSING` 不够！必须显式禁用 DOCTYPE！

### 1.2 反序列化完整检查清单

**必须搜索的所有反序列化点**：

```bash
# Java 原生反序列化
grep -rn "ObjectInputStream\|readObject\|readUnshared" --include="*.java"

# XMLDecoder
grep -rn "XMLDecoder" --include="*.java"

# XStream
grep -rn "XStream\|fromXML" --include="*.java"

# JSON 库
grep -rn "ObjectMapper\|JSON\.parse\|Gson\|fastjson\|JsonParser" --include="*.java"

# YAML
grep -rn "SnakeYAML\|Yaml\.load\|YamlConfiguration" --include="*.java"

# Hessian/Dubbo
grep -rn "HessianInput\|Hessian2Input" --include="*.java"

# Kryo
grep -rn "Kryo\|\.readObject\|\.readClassAndObject" --include="*.java"
```

**每个反序列化点必须验证**：

- [ ] 输入来源是否用户可控
- [ ] 是否有类型白名单/黑名单
- [ ] 依赖中是否有危险 Gadget 链
- [ ] 是否使用了安全的替代方案

### 1.3 注入类完整检查清单

**SQL 注入**：
```bash
# MyBatis ${} 注入
grep -rn '\${' --include="*Mapper.xml"

# JDBC 拼接
grep -rn "createQuery\|createNativeQuery\|executeQuery.*+" --include="*.java"

# JPA 动态查询
grep -rn "CriteriaBuilder\|criteriaQuery" --include="*.java"
```

**命令注入**：
```bash
grep -rn "Runtime\.getRuntime\(\)\.exec\|ProcessBuilder\|Process\s" --include="*.java"
```

**LDAP 注入**：
```bash
grep -rn "DirContext\|LdapContext\|\.search\(" --include="*.java"
```

**XPath 注入**：
```bash
grep -rn "XPath\.evaluate\|XPathExpression" --include="*.java"
```

**表达式注入 (OGNL/SpEL/EL)**：
```bash
grep -rn "OgnlUtil\|ValueStack\|SpelExpressionParser\|ELProcessor" --include="*.java"
```

### 1.4 SSRF 完整检查清单

**必须搜索的所有 URL/网络请求点**：

```bash
grep -rn "URL\|URI\|HttpClient\|RestTemplate\|WebClient\|URLConnection\|OkHttp" --include="*.java"
```

**每个网络请求点必须验证**：

- [ ] 协议白名单（仅 http/https）
- [ ] 域名/IP 白名单
- [ ] 是否禁止内网地址 (10.x, 172.16-31.x, 192.168.x, 127.x)
- [ ] 是否禁止云 metadata (169.254.169.254, metadata.google.internal)
- [ ] 是否允许重定向（重定向可能绕过检查）

### 1.5 路径遍历完整检查清单

**必须搜索的所有文件操作点**：

```bash
grep -rn "new File\|Files\.\|FileInputStream\|FileOutputStream\|FileUtils" --include="*.java"
grep -rn "getOriginalFilename\|transferTo\|MultipartFile" --include="*.java"
```

**每个文件操作点必须验证**：

- [ ] 是否对路径进行规范化 (canonicalPath)
- [ ] 是否检查 `../` 和 `..\`
- [ ] 是否限制在允许的目录内
- [ ] 是否检查符号链接
- [ ] Zip/Tar 解压是否检查 Zip Slip

### 1.6 文件操作 CRUD 完整性检查（v2.5.0 新增）

> ⚠️ **审计盲区警示**: 必须覆盖文件的 Create/Read/Update/Delete 全部操作！
> 常见遗漏: 只审计上传/下载，忽略删除操作 (参考: litemall GitHub #564)

**CRUD 操作检测命令（多语言）**:

```bash
# ========== Java ==========
grep -rn "MultipartFile\|transferTo\|Files\.write" --include="*.java"      # Create
grep -rn "FileInputStream\|Files\.read\|FileUtils\.read" --include="*.java" # Read
grep -rn "Files\.write.*TRUNCATE\|FileWriter" --include="*.java"           # Update
grep -rn "Files\.delete\|FileUtils\.delete\|\.delete()" --include="*.java" # Delete ⚠️易遗漏

# ========== Python ==========
grep -rn "\.save\(\|open.*'w'\|shutil\.copy" --include="*.py"              # Create
grep -rn "open.*'r'\|\.read\(" --include="*.py"                            # Read
grep -rn "open.*'w'\|\.write\(" --include="*.py"                           # Update
grep -rn "os\.remove\|os\.unlink\|shutil\.rmtree" --include="*.py"         # Delete ⚠️易遗漏

# ========== Go ==========
grep -rn "os\.Create\|ioutil\.WriteFile" --include="*.go"                  # Create
grep -rn "os\.Open\|ioutil\.ReadFile" --include="*.go"                     # Read
grep -rn "os\.OpenFile.*O_WRONLY" --include="*.go"                         # Update
grep -rn "os\.Remove\|os\.RemoveAll" --include="*.go"                      # Delete ⚠️易遗漏

# ========== PHP ==========
grep -rn "move_uploaded_file\|file_put_contents" --include="*.php"         # Create
grep -rn "file_get_contents\|fread\|readfile" --include="*.php"            # Read
grep -rn "file_put_contents\|fwrite" --include="*.php"                     # Update
grep -rn "unlink\|rmdir" --include="*.php"                                 # Delete ⚠️易遗漏

# ========== Node.js ==========
grep -rn "fs\.writeFile\|createWriteStream" --include="*.js" --include="*.ts"  # Create
grep -rn "fs\.readFile\|createReadStream" --include="*.js" --include="*.ts"    # Read
grep -rn "fs\.writeFile\|fs\.truncate" --include="*.js" --include="*.ts"       # Update
grep -rn "fs\.unlink\|fs\.rm\|rimraf" --include="*.js" --include="*.ts"        # Delete ⚠️易遗漏
```

**文件 CRUD 覆盖验证矩阵**:

| 操作类型 | 发现入口点 | 已分析 | 有漏洞 | 安全 | 状态 |
|----------|-----------|--------|--------|------|------|
| Create (上传/写入) | _ | _ | _ | _ | [ ] |
| Read (下载/读取) | _ | _ | _ | _ | [ ] |
| Update (覆盖/修改) | _ | _ | _ | _ | [ ] |
| Delete (删除) | _ | _ | _ | _ | [ ] |

**⚠️ 重要**: 只有当所有 CRUD 操作都已检查，文件操作审计才算完成！

**每个文件删除操作必须验证**:

- [ ] 是否对路径进行规范化
- [ ] 是否检查路径遍历攻击 (`../`)
- [ ] 是否验证文件在允许的目录内
- [ ] 是否有权限验证（用户只能删除自己的文件）
- [ ] 是否有审计日志记录删除操作

---

## Phase 2: 数据流追踪（Source 到 Sink）

### 追踪原则

```
每个 Sink 点都必须：
1. 反向追踪到所有可能的 Source
2. 验证传播路径上的每一步是否有有效过滤
3. 确认过滤是否可以被绕过
```

### 追踪模板

```
[Source] 用户输入点
    ↓ 操作1 (是否有过滤？过滤是否完整？)
[中间节点1]
    ↓ 操作2 (是否有过滤？过滤是否完整？)
[中间节点2]
    ↓ 操作3 (是否有过滤？过滤是否完整？)
[Sink] 危险函数

验证结果：
- [ ] 所有路径都已追踪
- [ ] 所有过滤都已验证
- [ ] 所有绕过可能都已检查
```

---

## Phase 3: 防护验证（必须验证完整性）

### 防护验证原则

```
⚠️ 核心原则：看到防护代码 ≠ 安全

必须验证：
1. 防护是否覆盖所有配置项？
2. 防护是否覆盖所有代码路径？
3. 防护是否可以被绕过？
4. 防护是否在正确的位置？
```

### 常见防护不完整示例

**XXE 防护不完整**：
```java
// ❌ 不完整 - 只设置了部分特性
factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
// 漏掉了 disallow-doctype-decl = true

// ✅ 完整防护需要设置所有特性
```

**XSS 过滤器不完整**：
```java
// ❌ 不完整 - 只重写了部分方法
class XssFilter extends HttpServletRequestWrapper {
    @Override
    public String[] getParameterValues(String name) {
        // 有过滤
    }
    // 漏掉了 getParameter(), getHeader(), getQueryString()
}
```

**路径遍历检查不完整**：
```java
// ❌ 不完整 - 只检查了 Unix 路径
if (path.contains("../")) {
    throw new Exception();
}
// 漏掉了 Windows 路径 "..\", URL 编码 "%2e%2e%2f" 等
```

---

## Phase 4: 交叉验证

### 验证清单

- [ ] 每个高危发现都已尝试构造 PoC
- [ ] 检查了该漏洞类型的所有已知绕过方式
- [ ] 检查了相关的历史 CVE 是否完全修复
- [ ] 检查了是否有变体攻击的可能

---

## Audit Coverage Tracking (审计覆盖率追踪)

> 确保不遗漏任何入口点的系统性追踪机制

### 入口点覆盖矩阵

审计开始时，必须枚举所有入口点并逐一分析：

| 入口类型 | 发现数 | 已分析 | Safe | Vulnerable | 待验证 | 覆盖率 |
|----------|--------|--------|------|------------|--------|--------|
| HTTP 路由/端点 | _ | _ | _ | _ | _ | _% |
| 用户输入参数 | _ | _ | _ | _ | _ | _% |
| 文件上传处理 | _ | _ | _ | _ | _ | _% |
| 反序列化入口 | _ | _ | _ | _ | _ | _% |
| 定时任务/队列 | _ | _ | _ | _ | _ | _% |
| WebSocket 端点 | _ | _ | _ | _ | _ | _% |
| RPC/gRPC 接口 | _ | _ | _ | _ | _ | _% |
| **总计** | _ | _ | _ | _ | _ | _% |

### 覆盖率计算

```
单项覆盖率 = 已分析数 / 发现数 × 100%
总体覆盖率 = 总已分析数 / 总发现数 × 100%

覆盖率标准:
- 90%+ : 完整审计 (推荐)
- 80-90% : 标准审计 (可接受)
- <80% : 需说明未覆盖原因
```

### Sink 类型覆盖追踪

| Sink 类型 | 发现数 | 已验证 | Slot 类型检查 | 净化验证 | 状态 |
|-----------|--------|--------|---------------|----------|------|
| SQL 执行点 | _ | _ | [ ] | [ ] | _ |
| 命令执行点 | _ | _ | [ ] | [ ] | _ |
| 文件操作点 | _ | _ | [ ] | [ ] | _ |
| 反序列化点 | _ | _ | [ ] | [ ] | _ |
| 模板渲染点 | _ | _ | [ ] | [ ] | _ |
| SSRF 请求点 | _ | _ | [ ] | [ ] | _ |
| LDAP/XPath | _ | _ | [ ] | [ ] | _ |

### 数据流追踪覆盖

| Flow ID | Source | Sink | Slot Type | Post-Concat Check | Verdict |
|---------|--------|------|-----------|-------------------|---------|
| F-001 | _ | _ | _ | [ ] | _ |
| F-002 | _ | _ | _ | [ ] | _ |
| ... | ... | ... | ... | ... | ... |

### 完成标准

```
⚠️ 审计报告生成前必须满足:

1. 入口点覆盖
   - [ ] 所有 HTTP 端点已枚举
   - [ ] 所有入口点有明确的分析结论 (safe/vulnerable/待验证)
   - [ ] 覆盖率达到 80% 以上

2. Sink 分析覆盖
   - [ ] 所有高危 Sink 已验证
   - [ ] 每个 Sink 已标注 Slot 类型
   - [ ] 每个 Sink 的净化措施已验证

3. 数据流覆盖
   - [ ] 主要数据流已追踪
   - [ ] Post-Sanitization Concat 已检查

4. 文档覆盖
   - [ ] 每个 "待验证" 项说明阻塞原因
   - [ ] 未分析的入口点说明跳过理由
```

### 快速枚举命令

```bash
# 统计 HTTP 端点数量
grep -rn "@.*Mapping\|@Path\|@Get\|@Post\|@route\|@app\." --include="*.java" --include="*.py" | wc -l

# 统计 SQL 执行点
grep -rn "execute\|query\|createQuery" --include="*.java" --include="*.py" | wc -l

# 统计反序列化点
grep -rn "readObject\|parse\|load\|deserialize" --include="*.java" --include="*.py" | wc -l

# 统计文件操作点
grep -rn "new File\|open\|FileInputStream\|read\|write" --include="*.java" --include="*.py" | wc -l
```

### 覆盖追踪示例

```markdown
## 审计覆盖追踪报告

### 项目: example-app
### 审计日期: 2026-02-02

### 入口点覆盖

| 入口类型 | 发现数 | 已分析 | Safe | Vulnerable | 待验证 | 覆盖率 |
|----------|--------|--------|------|------------|--------|--------|
| HTTP 端点 | 45 | 43 | 38 | 3 | 2 | 95.6% |
| 用户输入参数 | 120 | 110 | 95 | 10 | 5 | 91.7% |
| 反序列化入口 | 3 | 3 | 1 | 2 | 0 | 100% |
| **总计** | 168 | 156 | 134 | 15 | 7 | 92.9% |

### 未覆盖说明

| 入口 | 跳过原因 |
|------|----------|
| /internal/health | 内部健康检查，无用户输入 |
| /metrics | Prometheus 指标端点，只读 |

### Slot 类型分析汇总

| Slot Type | 数量 | Safe | Vulnerable |
|-----------|------|------|------------|
| SQL-val | 25 | 23 | 2 |
| SQL-ident | 5 | 3 | 2 |
| CMD-argument | 3 | 2 | 1 |
| FILE-path | 8 | 7 | 1 |

### Post-Sanitization Concat 检查

- [x] 检查完成
- 发现 2 处净化后拼接问题 (已记录为漏洞)
```

---

## 审计完成检查清单

### 覆盖验证

- [ ] 所有模块都已扫描（包括 plugins、extensions、tests）
- [ ] 所有入口点都已识别
- [ ] 所有 Content-Type 敏感端点都已追踪
- [ ] 所有第三方依赖都已检查 CVE

### 深度验证

- [ ] 每种漏洞类型的检查清单都已完成
- [ ] 每个防护措施都已验证完整性
- [ ] 每条数据流都已追踪到源头
- [ ] 每个高危发现都有 PoC 或明确标注 [需验证]

### 文档验证

- [ ] 所有发现都有 文件:行号 的精确定位
- [ ] 所有发现都有利用条件说明
- [ ] 所有发现都有修复建议

---

## 经验教训总结

### 遗漏的本质

```
遗漏的本质不是技术能力问题，而是：

1. 假设太多，验证太少
   - 假设核心模块最重要 → 漏掉插件
   - 假设有防护就安全 → 漏掉不完整的防护
   - 假设某路径不可达 → 漏掉隐藏入口

2. 广度优先变成了深度优先
   - 应该先建立完整攻击面，再逐点深入
   - 实际做成了：看到一个点就深入，忽略了其他点

3. 缺乏系统化的检查清单
   - 依赖经验和直觉
   - 没有可重复、可验证的流程
```

### 改进承诺

```
✓ 先测绘，后深入 - 完成 Phase 0 后才开始 Phase 1
✓ 清单驱动 - 每种漏洞类型都使用完整检查清单
✓ 验证防护 - 看到防护代码不跳过，必须验证完整性
✓ 记录一切 - 每个检查项都有状态标记
```

---

**版本**: 1.0
**创建日期**: 2025-01-15
**基于案例**: Struts XXE 审计遗漏反思
