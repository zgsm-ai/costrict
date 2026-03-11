# 数据流分析方法论

> 版本: 1.0.0
> 核心理念: Source → [无净化] → Sink = 注入类漏洞
> 适用: 所有语言的代码安全审计

---

## 一、核心概念

### 1.1 核心公式

```
注入类漏洞 = Source → [无净化] → Sink

用户可控输入到达危险函数，中途无有效净化 = 漏洞
```

### 1.2 污点分析三要素

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Source     │    │  Propagation │    │    Sink      │
│   污点源     │ → │    传播      │ → │   汇聚点     │
│              │    │              │    │              │
│ 用户可控输入 │    │ 数据流经路径 │    │ 危险操作点   │
└──────────────┘    └──────────────┘    └──────────────┘
```

### 1.3 覆盖的漏洞类型

| 漏洞类型 | CWE | Sink特征 |
|----------|-----|----------|
| SQL注入 | 89 | 数据库执行 |
| XSS | 79 | HTML输出 |
| 命令注入 | 78 | 系统命令执行 |
| 路径遍历 | 22 | 文件系统操作 |
| SSRF | 918 | HTTP请求 |
| 反序列化 | 502 | 反序列化函数 |
| XXE | 611 | XML解析 |
| 表达式注入 | 917 | 表达式引擎 |
| LDAP注入 | 90 | LDAP查询 |
| XPath注入 | 643 | XPath查询 |

---

## 二、B1: Source识别

### 2.1 Source分类总览

| 类别 | 风险等级 | 说明 |
|------|----------|------|
| HTTP参数 | 高 | 最常见的用户输入 |
| HTTP头 | 高 | 常被忽视的输入点 |
| Cookie | 高 | 客户端可控 |
| 请求体 | 高 | JSON/XML/Form数据 |
| 文件上传 | 高 | 文件名和内容 |
| 路径参数 | 高 | URL路径变量 |
| 数据库数据 | 中 | 二阶注入Source |
| 环境变量 | 低 | 特定场景可控 |

### 2.2 各语言Source速查

#### Java Source

```java
// HTTP参数
request.getParameter("name")
request.getParameterValues("names")
request.getParameterMap()

// HTTP头
request.getHeader("X-Forwarded-For")
request.getHeaders("Accept")

// Cookie
request.getCookies()
cookie.getValue()

// 请求体
@RequestBody Object body
request.getInputStream()
request.getReader()

// 文件上传
MultipartFile.getOriginalFilename()
MultipartFile.getInputStream()

// 路径参数
@PathVariable String id

// Spring特有
@RequestParam String param
@RequestHeader String header
@CookieValue String cookie
```

#### Python Source

```python
# Flask
request.args.get('name')       # GET参数
request.form.get('name')       # POST表单
request.json                   # JSON body
request.headers.get('X-Header')
request.cookies.get('session')
request.files['file']

# Django
request.GET.get('name')
request.POST.get('name')
request.body
request.META.get('HTTP_X_HEADER')
request.COOKIES.get('session')
request.FILES['file']

# FastAPI
async def endpoint(name: str, q: str = Query(...)):
    pass
```

#### Node.js Source

```javascript
// Express
req.query.name        // GET参数
req.body.name         // POST body
req.params.id         // 路径参数
req.headers['x-header']
req.cookies.session
req.files             // 文件上传

// Koa
ctx.query.name
ctx.request.body
ctx.params.id
ctx.headers['x-header']
ctx.cookies.get('session')
```

#### PHP Source

```php
$_GET['name']
$_POST['name']
$_REQUEST['name']
$_COOKIE['session']
$_SERVER['HTTP_X_HEADER']
$_FILES['file']
file_get_contents('php://input')
```

#### Go Source

```go
// net/http
r.URL.Query().Get("name")
r.FormValue("name")
r.Header.Get("X-Header")
r.Cookie("session")

// Gin
c.Query("name")
c.PostForm("name")
c.Param("id")
c.GetHeader("X-Header")
c.Cookie("session")
```

---

## 三、B2: Sink识别

### 3.1 Sink分类总览

| Sink类型 | 漏洞 | CWE | 危险程度 |
|----------|------|-----|----------|
| SQL执行 | SQL注入 | 89 | 严重 |
| 命令执行 | 命令注入 | 78 | 严重 |
| 反序列化 | RCE | 502 | 严重 |
| 表达式引擎 | RCE | 917 | 严重 |
| XML解析 | XXE | 611 | 高 |
| 文件操作 | 路径遍历 | 22 | 高 |
| HTTP请求 | SSRF | 918 | 高 |
| HTML输出 | XSS | 79 | 中 |
| URL重定向 | 开放重定向 | 601 | 中 |

### 3.2 各语言Sink速查

#### SQL执行 Sink

```java
// Java
Statement.executeQuery(sql)
Statement.execute(sql)
PreparedStatement (但用${}拼接)
JdbcTemplate.query(sql)
entityManager.createQuery(hql)
entityManager.createNativeQuery(sql)
// MyBatis ${} 语法

// Python
cursor.execute(sql)
engine.execute(sql)
Model.objects.raw(sql)
Model.objects.extra(where=[sql])

// Node.js
connection.query(sql)
knex.raw(sql)
sequelize.query(sql)

// PHP
mysqli_query($conn, $sql)
$pdo->query($sql)
DB::statement($sql)

// Go
db.Query(sql)
db.Exec(sql)
```

#### 命令执行 Sink

```java
// Java
Runtime.getRuntime().exec(cmd)
ProcessBuilder(cmd).start()
ScriptEngine.eval(code)

// Python
os.system(cmd)
os.popen(cmd)
subprocess.call(cmd, shell=True)
subprocess.Popen(cmd, shell=True)
eval(code)
exec(code)

// Node.js
child_process.exec(cmd)
child_process.spawn(cmd, {shell: true})
eval(code)

// PHP
system($cmd)
exec($cmd)
passthru($cmd)
shell_exec($cmd)
popen($cmd, 'r')
eval($code)

// Go
exec.Command("sh", "-c", cmd)
```

#### 文件操作 Sink

```java
// Java
new File(path)
new FileInputStream(path)
new FileOutputStream(path)
Files.readAllBytes(Paths.get(path))

// Python
open(path)
os.path.join(base, user_input)
shutil.copy(src, dst)

// Node.js
fs.readFile(path)
fs.writeFile(path)
fs.unlink(path)

// PHP
file_get_contents($path)
file_put_contents($path)
include($path)
require($path)

// Go
os.Open(path)
ioutil.ReadFile(path)
os.Create(path)
```

#### HTTP请求 Sink

```java
// Java
new URL(url).openConnection()
HttpClient.newHttpClient().send(request)
RestTemplate.getForObject(url)

// Python
requests.get(url)
urllib.request.urlopen(url)
httpx.get(url)

// Node.js
axios.get(url)
fetch(url)
http.request(url)

// PHP
file_get_contents($url)
curl_exec($ch)  // 配置了CURLOPT_URL
Guzzle\Client->get($url)

// Go
http.Get(url)
client.Do(req)
```

#### 反序列化 Sink

```java
// Java
ObjectInputStream.readObject()
XMLDecoder.readObject()
JSON.parseObject(json)  // Fastjson
XStream.fromXML(xml)
Yaml.load(yaml)  // SnakeYAML

// Python
pickle.load(data)
pickle.loads(data)
yaml.load(data)  // 不安全
marshal.loads(data)

// Node.js
node-serialize.unserialize(data)
js-yaml.load(data)  // 不安全

// PHP
unserialize($data)

// Ruby
Marshal.load(data)
YAML.load(data)
```

#### HTML输出 Sink

```java
// Java
response.getWriter().write(html)
out.println(html)
model.addAttribute("data", userInput)  // 无转义模板

// Python
render_template_string(template)  # Jinja2
HttpResponse(html)  # Django
return html  # Flask

// Node.js
res.send(html)
element.innerHTML = html
document.write(html)

// PHP
echo $html
print $html
<?= $html ?>
```

---

## 四、B3: 污点传播追踪

### 4.1 追踪方法

```
1. 从Sink反向追踪
   Sink函数 ← 参数来源 ← ... ← Source

2. 从Source正向追踪
   Source → 变量赋值 → ... → Sink函数

3. 检查传播路径上的净化措施
   有效净化 → 安全
   无净化/可绕过 → 漏洞
```

### 4.2 传播路径示例

```java
// 漏洞路径示例
String name = request.getParameter("name");  // Source
String sql = "SELECT * FROM users WHERE name = '" + name + "'";  // 传播
statement.executeQuery(sql);  // Sink - SQL注入!

// 安全路径示例
String name = request.getParameter("name");  // Source
PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE name = ?");
ps.setString(1, name);  // 参数化 - 净化
ps.executeQuery();  // Sink - 安全
```

### 4.3 常见传播方式

| 传播类型 | 示例 |
|----------|------|
| 直接赋值 | `String a = source;` |
| 字符串拼接 | `String b = "prefix" + a;` |
| 函数返回 | `return processInput(a);` |
| 集合存储 | `list.add(a); list.get(0);` |
| 对象属性 | `obj.field = a; obj.field;` |
| 数据库存储 | `INSERT a → SELECT` (二阶) |

---

## 五、净化措施验证

### 5.1 各Sink类型的有效净化

| Sink类型 | 有效净化 | 无效/可绕过净化 |
|----------|----------|-----------------|
| SQL | 参数化查询 | 黑名单过滤、转义单引号 |
| 命令 | 白名单+参数数组 | 黑名单过滤特殊字符 |
| 文件 | 白名单+规范化 | 仅过滤../ |
| HTTP | URL白名单+协议限制 | 仅过滤localhost |
| HTML | 上下文编码 | 仅过滤<script> |
| 反序列化 | 类型白名单 | 无有效净化 |
| XML | 禁用外部实体 | 仅过滤DOCTYPE |

### 5.2 验证净化有效性

```yaml
SQL注入净化验证:
  有效:
    - PreparedStatement + ?占位符
    - MyBatis #{}
    - ORM参数化方法
  无效:
    - 黑名单过滤关键字 (可编码绕过)
    - addslashes/转义 (宽字节绕过)
    - 类型转换但用于ORDER BY (无效)

命令注入净化验证:
  有效:
    - 命令白名单 + 参数数组形式
    - 不使用shell=True
  无效:
    - 过滤; | & (可用换行、$()绕过)
    - escapeshellarg但用于参数名

路径遍历净化验证:
  有效:
    - 白名单目录 + realpath规范化后检查前缀
    - 使用UUID重命名
  无效:
    - 仅过滤../ (可编码绕过)
    - 仅检查不包含.. (可用绝对路径)

SSRF净化验证:
  有效:
    - 域名白名单
    - 解析后IP检查 + DNS rebinding防护
  无效:
    - 仅过滤内网IP (可DNS rebinding)
    - 仅检查协议 (可用重定向)
```

---

## 六、检测命令速查

### 6.1 SQL注入检测

```bash
# Java
grep -rn "Statement.*execute\|createQuery\|createNativeQuery" --include="*.java"
grep -rn "\$\{" --include="*.xml"  # MyBatis

# Python
grep -rn "cursor\.execute\|\.raw(\|\.extra(" --include="*.py"

# Node.js
grep -rn "\.query(\|\.raw(" --include="*.js" --include="*.ts"

# PHP
grep -rn "mysqli_query\|->query(\|DB::statement" --include="*.php"
```

### 6.2 命令注入检测

```bash
# Java
grep -rn "Runtime\.getRuntime\|ProcessBuilder\|\.exec(" --include="*.java"

# Python
grep -rn "os\.system\|os\.popen\|subprocess\.\|eval(\|exec(" --include="*.py"

# Node.js
grep -rn "child_process\|exec(\|spawn(" --include="*.js" --include="*.ts"

# PHP
grep -rn "system(\|exec(\|passthru(\|shell_exec(\|popen(" --include="*.php"
```

### 6.3 反序列化检测

```bash
# Java
grep -rn "ObjectInputStream\|readObject\|XMLDecoder\|JSON\.parse\|XStream\|Yaml\.load" --include="*.java"

# Python
grep -rn "pickle\.load\|yaml\.load\|marshal\.load" --include="*.py"

# PHP
grep -rn "unserialize(" --include="*.php"
```

### 6.4 SSRF检测

```bash
# Java
grep -rn "new URL\|HttpClient\|RestTemplate\|WebClient" --include="*.java"

# Python
grep -rn "requests\.\|urllib\.\|httpx\." --include="*.py"

# Node.js
grep -rn "axios\|fetch(\|http\.request" --include="*.js" --include="*.ts"
```

### 6.5 路径遍历检测

```bash
# Java
grep -rn "new File\|FileInputStream\|Paths\.get" --include="*.java"

# Python
grep -rn "open(\|os\.path\.join\|shutil\." --include="*.py"

# Node.js
grep -rn "fs\.readFile\|fs\.writeFile\|path\.join" --include="*.js" --include="*.ts"
```

---

## 七、审计流程

```
┌─────────────────────────────────────────────────────────────┐
│ B1. Source识别                                              │
│     grep各语言的用户输入函数，建立Source清单                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ B2. Sink识别                                                │
│     grep各类危险函数，建立Sink清单                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ B3. 污点传播追踪                                            │
│     对每个Sink，反向追踪参数来源                             │
│     判断是否来自Source                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ B4. 净化验证                                                │
│     检查传播路径上是否有有效净化                             │
│     无净化/可绕过 → 漏洞                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 输出: 注入类漏洞清单                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 八、输出模板

### 8.1 数据流分析报告

```markdown
## 数据流分析结果

### Source清单
| # | Source | 位置 | 类型 |
|---|--------|------|------|
| S1 | request.getParameter("id") | UserController:23 | HTTP参数 |
| S2 | request.getHeader("X-Forward") | LogFilter:45 | HTTP头 |

### Sink清单
| # | Sink | 位置 | 类型 |
|---|------|------|------|
| K1 | statement.executeQuery(sql) | UserDao:67 | SQL执行 |
| K2 | Runtime.exec(cmd) | ShellUtil:34 | 命令执行 |

### 污点传播路径
| Source | Sink | 路径 | 净化 | 结果 |
|--------|------|------|------|------|
| S1 | K1 | S1→sql拼接→K1 | 无 | ❌ SQL注入 |
| S2 | K2 | S2→cmd拼接→K2 | 无 | ❌ 命令注入 |

### 发现漏洞
1. **SQL注入** (CWE-89)
   - 位置: UserDao.java:67
   - 路径: request.getParameter("id") → sql字符串拼接 → executeQuery
   - 修复: 使用PreparedStatement参数化查询

2. **命令注入** (CWE-78)
   - 位置: ShellUtil.java:34
   - 路径: request.getHeader("X-Forward") → cmd拼接 → Runtime.exec
   - 修复: 使用白名单+参数数组
```

---

**版本**: 1.0.0
**创建日期**: 2026-02-04
**适用语言**: 所有
**配套文档**: `security_controls_methodology.md`, `sinks_sources.md`
