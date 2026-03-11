# Go 安全审计语义提示 (Semantic Hints)

> 本文件为覆盖率矩阵 (`coverage_matrix.md`) 的补充。
> **仅对未覆盖的维度按需加载对应 `## D{N}` 段落**，无需全量加载。
> LLM 自行决定搜索策略（Grep/Read/LSP/代码推理均可）。

## D1: 注入

**关键问题**:
1. SQL 是否用 `fmt.Sprintf` / 字符串拼接构造查询？（安全: `db.Query(sql, args...)` 参数化 / 危险: `fmt.Sprintf` 拼接）
2. GORM: `db.Raw()` / `db.Where()` 是否传入拼接字符串？`db.Order(userInput)` 是否直接使用？
3. `exec.Command()` / `exec.CommandContext()` 的参数是否来自用户输入？是否通过 `sh -c` 调用？
4. `text/template` vs `html/template`：是否用 `text/template` 渲染 HTML？（无自动转义）
5. `template.HTML()` / `template.JS()` / `template.CSS()` 类型转换是否用于用户输入？（绕过转义）
6. LDAP: `ldap.SearchRequest` 的 filter 是否拼接用户输入？

**易漏场景**:
- `db.Where(fmt.Sprintf("name = '%s'", userInput))` 在 Repository 层
- `exec.Command("sh", "-c", "git log " + branch)` 用户可控 `branch` 参数
- `db.Order(req.Query("sort"))` 直接使用 URL 参数
- `text/template` 用于生成邮件 HTML 内容

**判定规则**:
- `fmt.Sprintf` + SQL 字符串 + 用户输入 = **确认 SQL 注入**
- `db.Raw(userInput)` / `db.Where(拼接字符串)` = **确认 SQL 注入**
- `exec.Command("sh", "-c", 拼接字符串)` + 用户输入 = **Critical (命令注入)**
- `exec.Command(cmd, args...)` 无 shell = **安全**（参数自动分隔）
- `text/template` 渲染 HTML + 用户输入 = **High (XSS)**

## D2: 认证

**关键问题**:
1. JWT: `jwt.Parse()` 是否验证签名？`Keyfunc` 回调是否正确返回密钥？是否限制 `alg`？
2. 密钥/secret 是否硬编码在源码中？是否从环境变量读取？
3. 中间件链是否覆盖所有需认证的路由？路由注册顺序是否正确？
4. Token 过期检查 `Claims.Valid()` 是否被调用？
5. gRPC 是否有 interceptor 验证 metadata 中的 Token？

**易漏场景**:
- `jwt.Parse(token, func(t *jwt.Token) (interface{}, error) { return key, nil })` 未校验 `alg` 字段
- Gin 路由组中间件绑定后，部分路由通过 `r.GET` 注册在组外
- gRPC 服务无 UnaryInterceptor 认证

**判定规则**:
- `jwt.Parse()` 无 `alg` 验证 = **High (算法混淆攻击)**
- 硬编码 JWT 密钥 = **High**
- 路由在 auth 中间件之外注册 = **High (认证绕过)**
- gRPC 无认证 interceptor = **High**

## D3: 授权

**关键问题**:
1. 资源操作是否验证用户归属？`db.First(&resource, id)` vs `db.Where("user_id = ? AND id = ?", userId, id).First(&resource)`？
2. CRUD Handler 中 Delete/Update 是否有与 Get 相同的权限检查？
3. 管理员路由是否有独立的角色验证中间件？
4. gRPC 方法是否逐一检查调用者权限？
5. 批量操作是否逐一验证每个资源归属？

**易漏场景**:
- `db.Delete(&Model{}, id)` 无用户归属校验
- REST 路由 `GET /resource/:id` 有权限，但 `DELETE /resource/:id` 遗漏
- Casbin/Oso 策略未覆盖所有 API

**判定规则**:
- `db.First(&r, id)` 无归属校验 + 敏感操作 = **High (IDOR)**
- CRUD 中 delete/update 缺权限检查 = **High (授权不一致)**
- 管理员路由无角色中间件 = **Critical (垂直越权)**

## D4: 内存安全 & 并发

**关键问题**:
1. `unsafe.Pointer` 是否使用？是否有指针算术操作？类型转换是否安全？
2. `strconv.Atoi()` 返回值赋给 `int16`/`int32` 时是否有范围检查？（整数溢出）
3. Goroutine 中共享变量是否有 `sync.Mutex` / `sync.RWMutex` / `atomic` 保护？
4. Channel 是否可能阻塞导致 Goroutine 泄漏？`context.WithCancel`/`WithTimeout` 是否正确使用？
5. `sync.WaitGroup` 是否正确配对 `Add`/`Done`？
6. Map 是否在多个 Goroutine 中并发读写？（Go map 非并发安全）
7. CGO: `C.malloc` 分配的内存是否有对应 `C.free`？

**易漏场景**:
- `unsafe.Pointer` 类型转换后访问越界内存
- `id, _ := strconv.Atoi(input); arr[id]` 无范围检查导致 panic 或负数索引
- 全局 map 在 HTTP handler 中并发读写 → panic
- Goroutine 启动后无退出机制，`for { select {} }` 无 `ctx.Done()` 分支

**判定规则**:
- `unsafe.Pointer` + 类型转换 + 外部输入 = **High (内存损坏)**
- `strconv.Atoi()` → `int16` 无范围检查 = **Medium (整数溢出)**
- 全局 map 无锁并发访问 = **High (竞态条件 → panic/数据损坏)**
- Goroutine 无退出机制 = **Medium (资源泄漏)**
- `go race detector` 检测到的竞态 = **High**

## D5: 文件操作

**关键问题**:
1. `filepath.Join()` / `os.Open()` / `ioutil.ReadFile()` 路径是否拼接用户输入？
2. `filepath.Clean()` 是否在 Join 之后验证路径仍在预期目录下？
3. ZIP/tar 解压：`zip.File.Name` / `tar.Header.Name` 是否含 `../`？（Zip Slip / Tar Slip）
4. 文件上传：是否校验扩展名和大小？
5. 符号链接是否跟随？`os.Lstat` vs `os.Stat`？

**易漏场景**:
- `filepath.Join(baseDir, userInput)` 当 `userInput` 含 `../` 时可遍历
- `archive/zip` 解压未校验 `f.Name` 中的 `../`
- `os.ReadFile(filepath.Join("/data", req.Query("file")))` 无路径验证

**判定规则**:
- 路径拼接 + 无 `../` 过滤 + 无 `filepath.Rel` 验证 = **Critical (任意文件读写)**
- ZIP/tar 解压 + 无路径校验 = **High (Zip Slip)**
- 上传无扩展名校验 = **Medium**

## D6: SSRF

**关键问题**:
1. `http.Get()` / `http.Post()` / `http.Do()` / `net.Dial()` 的目标是否来自用户输入？
2. URL 校验是否可绕过？DNS rebinding？`@` 绕过？IP 编码绕过？
3. 是否限制协议？`file://`、`gopher://`？
4. 数据库连接 DSN 是否用户可控？
5. `net.Dial("tcp", userAddr)` 是否校验目标？

**易漏场景**:
- `http.Get(req.FormValue("url"))` 直接使用用户 URL
- 仅禁止 `127.0.0.1`，遗漏 `0.0.0.0`、`[::1]`、`169.254.169.254`
- `net.Dial` 用于代理/端口转发功能，目标可控

**判定规则**:
- URL 用户可控 + 无白名单 = **High (SSRF)**
- SSRF + 可访问云元数据 = **Critical**
- `net.Dial` + 用户可控目标 = **High (SSRF / 端口扫描)**

## D7: 加密

**关键问题**:
1. 密钥是否硬编码在源码中？是否从环境变量/Vault 读取？
2. `crypto/md5` / `crypto/sha1` 是否用于密码哈希？（应使用 `golang.org/x/crypto/bcrypt`）
3. `math/rand` 是否用于安全相关场景？（应使用 `crypto/rand`）
4. AES 是否使用 ECB 模式？`cipher.NewCBCEncrypter` 的 IV 是否随机？
5. TLS: `InsecureSkipVerify: true` 是否在生产代码中？

**判定规则**:
- 硬编码密钥 = **High**
- `math/rand` 用于 Token/密钥生成 = **High (可预测)**
- `md5` / `sha1` 用于密码 = **Medium**
- `InsecureSkipVerify: true` 生产环境 = **High (中间人攻击)**

## D8: 配置

**关键问题**:
1. `net/http/pprof` 是否在生产环境暴露？是否有访问控制？
2. CORS 是否为 `*` + credentials？
3. `InsecureIgnoreHostKey()` 是否用于 SSH 连接？
4. 异常处理是否向客户端暴露 panic 堆栈？`recover()` 是否正确使用？
5. 配置文件中是否有明文密码、API Key？
6. 日志中是否打印 password/token/secret？

**判定规则**:
- `pprof` 端点无认证可访问 = **High (信息泄露 / 堆转储)**
- CORS `*` + credentials = **High**
- `InsecureIgnoreHostKey()` = **Medium (SSH 中间人)**
- panic 堆栈暴露给客户端 = **Medium**

## D9: 业务逻辑

**关键问题**:
1. 金额/数量是否在服务端验证？
2. 数据库操作是否在事务中？`SELECT ... FOR UPDATE` 是否用于并发场景？
3. 多步流程是否可跳过步骤？
4. 结构体绑定是否过宽？`c.ShouldBindJSON(&user)` 是否绑定了 `Role`/`IsAdmin` 字段？
5. 整数溢出是否影响业务逻辑？（如数量为负数绕过校验）

**易漏场景**:
- Gin `c.ShouldBindJSON(&model)` + 结构体含 `Role` 字段 + JSON tag 未隐藏
- GORM `Updates(req.Body)` 直接用 map 更新，含非预期字段
- 并发请求导致余额多次扣减（无 `FOR UPDATE`）

**判定规则**:
- 结构体绑定含权限字段 + JSON tag 可写 = **High (Mass Assignment)**
- 无事务/无锁的扣减操作 = **High (竞态条件)**
- 金额来自客户端 = **Critical (支付绕过)**

## D10: 供应链

**依赖组件速查** (仅 go.mod / go.sum 中存在时检查):

| 依赖 | 危险版本 | 漏洞类型 | 检查要点 |
|------|---------|---------|---------|
| golang.org/x/crypto | < 0.17.0 | 多种 | SSH/TLS 漏洞 |
| golang.org/x/net | < 0.17.0 | HTTP/2 DoS | rapid reset attack |
| golang.org/x/text | < 0.3.8 | DoS | 语言标签解析崩溃 |
| github.com/gin-gonic/gin | < 1.9.1 | 路径遍历 | 路径规范化绕过 |
| github.com/dgrijalva/jwt-go | 全版本(废弃) | 认证绕过 | 应迁移到 golang-jwt/jwt |
| github.com/go-yaml/yaml | < 3.0 | DoS | 递归解析内存耗尽 |
| github.com/tidwall/gjson | < 1.14.3 | DoS | 恶意 JSON 路径 |
| github.com/minio/minio | < RELEASE.2023-03-13 | 信息泄露 | 权限绕过 |
| gorm.io/gorm | < 1.25.0 | SQL 注入 | 特定条件下的注入 |
| google.golang.org/grpc | < 1.56.3 | DoS | HTTP/2 rapid reset |

**判定规则**:
- 危险版本 + 项目中实际使用了危险 API = **按对应 CVE 评级**
- 危险版本 + 项目未使用危险 API = **Medium (潜在风险)**
- `dgrijalva/jwt-go` 仍在使用 = **Medium (废弃库，应迁移)**
