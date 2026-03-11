# .NET/C# 安全审计语义提示 (Semantic Hints)

> 本文件为覆盖率矩阵 (`coverage_matrix.md`) 的补充。
> **仅对未覆盖的维度按需加载对应 `## D{N}` 段落**，无需全量加载。
> LLM 自行决定搜索策略（Grep/Read/LSP/代码推理均可）。

## D1: 注入

**关键问题**:
1. EF Core 是否使用 `FromSqlRaw` / `ExecuteSqlRaw` 拼接用户输入？（安全: `FromSqlInterpolated` / 危险: `FromSqlRaw($"...")`）
2. ADO.NET 是否用 `SqlCommand` + 字符串拼接而非 `SqlParameter` 参数化？
3. LINQ to SQL 是否有 `ExecuteQuery<T>(string)` 直接拼接用户输入？
4. ORDER BY / 动态列名 / 表名是否有白名单验证？（EF 的 `OrderBy` 字符串参数无法参数化）
5. ORM 原始 SQL：Dapper 的 `Query(sql)` 中 sql 是否拼接用户输入？
6. LDAP: `DirectorySearcher.Filter` 是否拼接用户输入？
7. XPath: `XPathNavigator.Select()` / `SelectSingleNode()` 是否拼接用户输入？
8. XXE: `XmlDocument` / `XmlTextReader` 是否禁用了外部实体？（.NET 4.5.2+ 默认安全，旧版不安全）

**易漏场景**:
- `FromSqlRaw` 使用字符串插值 `$"SELECT ... WHERE id = {id}"` 看起来像参数化但实际是拼接
- Dapper `Query($"SELECT * FROM {table}")` 中表名来自用户输入
- Stored Procedure 名称本身由用户控制
- `XmlDocument.Load()` 在 .NET Framework < 4.5.2 默认启用 DTD 解析

**判定规则**:
- `FromSqlRaw` + `$"..."` 含用户输入 = **确认 SQL 注入 (Critical)**
- `SqlCommand` + 字符串拼接 = **确认 SQL 注入 (Critical)**
- `FromSqlInterpolated` = 安全（自动参数化）
- `XmlDocument` + .NET < 4.5.2 + 未显式禁用 DTD = **确认 XXE (High)**

## D2: 认证

**关键问题**:
1. JWT: 是否仅 `JwtSecurityTokenHandler.ReadToken()` 而无 `ValidateToken()`？Token 验证参数是否完整？
2. `TokenValidationParameters` 中 `ValidateIssuerSigningKey` / `ValidateIssuer` / `ValidateAudience` 是否设为 `false`？
3. Identity: `PasswordHasherOptions.CompatibilityMode` 是否设为 V2（较弱）？迭代次数是否足够？
4. Cookie 认证: `CookieAuthenticationOptions.Cookie.SecurePolicy` 是否为 `Always`？`HttpOnly` 是否启用？
5. 中间件顺序: `UseAuthentication()` 是否在 `UseAuthorization()` 之前？两者是否在 `MapControllers()` / `UseEndpoints()` 之前？
6. `[AllowAnonymous]` 是否标注在敏感 Controller/Action 上？是否意外覆盖了 `[Authorize]`？

**易漏场景**:
- `[Authorize]` 在 Controller 级别，但某个 Action 加了 `[AllowAnonymous]` 意外放行敏感操作
- `UseAuthorization()` 写在 `UseRouting()` 之前导致不生效
- Windows 认证 + 匿名认证同时启用，匿名请求直接通过
- Identity 默认密码策略过宽（`RequireDigit = false` 等全部关闭）

**判定规则**:
- `ValidateIssuerSigningKey = false` = **Critical (JWT 签名绕过)**
- `UseAuthentication` 在 `MapControllers` 之后 = **Critical (认证完全失效)**
- 敏感接口 `[AllowAnonymous]` = **High (认证绕过)**
- Cookie `SecurePolicy` 非 `Always` + 生产环境 = **Medium**

## D3: 授权

**关键问题**:
1. 资源操作是否验证用户归属？`_context.Items.FindAsync(id)` vs `_context.Items.Where(x => x.Id == id && x.UserId == userId)`？
2. `[Authorize(Roles = "Admin")]` 是否仅在需要的 Action 上？是否有 CRUD 不一致（Read 有限制，Delete 无限制）？
3. 自定义 `IAuthorizationHandler` 是否有逻辑缺陷？`HandleRequirementAsync` 是否在特定条件下意外调用 `context.Succeed()`？
4. 基于资源的授权是否在所有修改操作中一致应用？
5. 多租户场景下 `TenantId` 是否在查询层全局过滤？是否有接口遗漏租户过滤？

**易漏场景**:
- Global Query Filter 被 `IgnoreQueryFilters()` 绕过
- `[Authorize(Policy = "...")]` 的 Policy 未注册，默认拒绝但开发者可能改为默认允许
- API Controller 缺少 `[Authorize]` 但依赖全局过滤器，而过滤器被特定路由绕过

**判定规则**:
- `FindAsync(id)` 无用户归属 + 敏感操作 = **High (IDOR)**
- Admin 接口无 `[Authorize(Roles)]` = **Critical (垂直越权)**
- `IgnoreQueryFilters()` + 多租户 = **Critical (租户隔离失效)**

## D4: 反序列化

**关键问题**:
1. 是否存在 `BinaryFormatter.Deserialize()` / `NetDataContractSerializer` / `SoapFormatter`？（这些类本质不安全，微软已标记为废弃）
2. JSON.NET `JsonSerializerSettings.TypeNameHandling` 是否为 `All` / `Auto` / `Objects`？（安全: `None` 即默认值）
3. 自定义 `SerializationBinder` 是否有白名单？黑名单是否可绕过？
4. `DataContractSerializer` / `XmlSerializer` 的 `Type` 参数是否用户可控？
5. ViewState: `EnableViewStateMac` 是否被设为 `false`？`machineKey` 是否硬编码或可预测？

**易漏场景**:
- `TypeNameHandling.Auto` 看起来比 `All` 安全，但只要 JSON 中包含 `$type` 字段即触发
- `BinaryFormatter` 隐藏在 Session State Provider / 缓存序列化 / SignalR 中
- 旧 ASP.NET WebForms 项目 ViewState 未加密 + `machineKey` 在 web.config 硬编码
- `ObjectStateFormatter` 在旧项目中用于 ViewState 反序列化

**判定规则**:
- `BinaryFormatter` + 任何不可信数据源 = **Critical (RCE)**
- `TypeNameHandling != None` + 接受外部 JSON = **Critical (RCE)**
- ViewState `EnableViewStateMac = false` = **Critical**
- `machineKey` 硬编码 + 可从源码获取 = **High**

## D5: 文件操作

**关键问题**:
1. 文件上传: `IFormFile.FileName` 是否直接用于存储路径？是否校验扩展名白名单？
2. 路径拼接: `Path.Combine(basePath, userInput)` 是否安全？（`Path.Combine("base", "/evil")` 返回 `/evil`）
3. 文件下载/读取: `PhysicalFileProvider` / `File.ReadAllText` 的路径是否含用户输入？是否检查 `../`？
4. 是否限制上传文件大小？`MultipartBodyLengthLimit` 是否合理？
5. 上传目录是否在 `wwwroot` 下？上传的文件是否可直接通过 URL 访问执行？

**易漏场景**:
- `Path.Combine("uploads", "../../../etc/passwd")` 在 Linux 上可遍历
- `Path.GetFileName()` 可安全提取文件名，但开发者用 `Path.Combine` 直接拼接原始 `FileName`
- 文件名过滤 `../` 但未处理 `..\\`（Windows 路径分隔符）
- ASP.NET Core Static Files 中间件意外暴露非预期目录

**判定规则**:
- `IFormFile.FileName` 直接进入 `Path.Combine` = **High (路径遍历)**
- `Path.Combine(base, userInput)` 且 `userInput` 可能以 `/` 开头 = **Critical (任意文件读写)**
- 上传到 `wwwroot` + 无扩展名限制 = **High (WebShell 风险低于 Java 但仍需关注)**

## D6: SSRF

**关键问题**:
1. `HttpClient` / `WebClient` / `HttpWebRequest` 的 URL 是否来自用户输入？
2. `IHttpClientFactory` 创建的 Client 是否有 BaseAddress 限制？
3. URL 校验是否考虑了 DNS rebinding / IPv6 / URL 解析差异？
4. 是否限制了协议？（`file://`、`gopher://`）
5. JDBC 连接字符串（`SqlConnection.ConnectionString`）是否用户可控？

**易漏场景**:
- `HttpClient.GetAsync(userUrl)` 无白名单限制
- URL 白名单基于 `Uri.Host` 字符串比较，`http://evil.com@allowed.com` 绕过
- 仅校验非 `127.0.0.1`，遗漏 `169.254.169.254`（云元数据）/ `0.0.0.0` / IPv6 `::1`
- `WebClient.DownloadFile` 跟随 302 重定向到内网地址

**判定规则**:
- URL 用户可控 + 无白名单 = **High (SSRF)**
- SSRF + 可达云元数据 `169.254.169.254` = **Critical**
- `ConnectionString` 用户可控 = **Critical (数据库连接劫持)**

## D7: 加密

**关键问题**:
1. AES/DES 密钥是否硬编码在源码中？IV 是否硬编码或全零？
2. 是否使用 `DES` / `3DES` / `RC2`？（应使用 `Aes`）
3. `AesManaged` / `AesCryptoServiceProvider` 是否使用 ECB 模式？（`CipherMode.ECB`）
4. 密码哈希是否使用 `Rfc2898DeriveBytes`（PBKDF2）且迭代次数 >= 100000？还是 MD5/SHA1？
5. 随机数生成是否使用 `RandomNumberGenerator`？还是 `System.Random`？
6. `machineKey` / `DataProtection` 密钥是否硬编码在配置中？

**判定规则**:
- 硬编码 AES 密钥 + 硬编码 IV = **High（加密形同虚设）**
- `MD5` / `SHA1` 用于密码哈希 = **Medium**
- `System.Random` 用于安全场景（Token、验证码）= **High**
- `DES` / `3DES` 用于新项目 = **Medium（弱加密算法）**

## D8: 配置

**关键问题**:
1. CORS: `AllowAnyOrigin()` + `AllowCredentials()` 是否同时使用？`SetIsOriginAllowed(_ => true)` 是否放行所有来源？
2. CSRF: `[IgnoreAntiforgeryToken]` / `[ValidateAntiForgeryToken]` 的使用是否正确？API 项目是否需要 CSRF 保护？
3. 异常处理: `UseDeveloperExceptionPage()` 是否在生产环境启用？自定义异常是否泄露堆栈？
4. 配置文件 (`appsettings.json` / `web.config`) 中是否有明文密码、连接字符串含密码、API Key？
5. 日志中是否打印 password/token/secret？`ILogger` 是否记录敏感信息？
6. Swagger / Health Check 端点是否在生产环境暴露且无认证？
7. `launchSettings.json` 是否包含敏感环境变量并被提交到源码仓库？

**判定规则**:
- `AllowAnyOrigin()` + `AllowCredentials()` = **High (CORS 配置错误)**
- `SetIsOriginAllowed(_ => true)` + `AllowCredentials()` = **High**
- `UseDeveloperExceptionPage()` 在生产 = **Medium（信息泄露）**
- `appsettings.json` 明文密码 = **Medium（需评估暴露范围）**
- Swagger 无认证 + 生产环境 = **Medium（API 信息泄露）**

## D9: 业务逻辑

**关键问题**:
1. 金额/数量计算是否在服务端验证？客户端参数是否可篡改？
2. 并发操作是否使用 `ConcurrencyToken` / `RowVersion` / 数据库锁？
3. 多步流程（如支付）是否可跳过中间步骤？
4. Mass Assignment: `[Bind]` / `[BindNever]` 是否正确使用？`TryUpdateModelAsync` 是否绑定了不应由用户控制的字段（如 `Role`、`IsAdmin`）？
5. 验证码 / 短信码是否有速率限制？`[RateLimiting]` 是否应用到敏感端点？
6. SignalR Hub 方法是否有授权检查？客户端是否可调用不应暴露的 Hub 方法？

**判定规则**:
- 金额来自客户端 + 服务端未重新计算 = **Critical（支付绕过）**
- 无并发控制的余额扣减 = **High（竞态条件）**
- DTO 直接映射含权限字段的实体 + 无 `[BindNever]` = **High（Mass Assignment）**
- SignalR Hub 无 `[Authorize]` = **High（未授权访问）**

## D10: 供应链

**依赖组件速查** (仅 `.csproj` / `packages.config` / `NuGet.config` 中存在时检查):

| 依赖 | 危险版本 | 漏洞类型 | 检查要点 |
|------|---------|---------|---------|
| Newtonsoft.Json | 全版本 | RCE | `TypeNameHandling != None` + 外部输入 |
| System.Text.Json | < 8.0 | 信息泄露 | 特定多态反序列化场景 |
| Microsoft.AspNetCore | < 6.0.x (停止支持) | 多种 | 检查是否使用已终止支持版本 |
| log4net | < 2.0.10 | RCE | CVE-2018-1285 XXE |
| NServiceBus | < 7.8.0 | RCE | 反序列化漏洞 |
| ImageSharp | < 3.0.0 | DoS/RCE | 图片处理漏洞 |
| BouncyCastle | < 1.8.9 | 加密绕过 | 弱随机数生成 |
| AntiXss (旧版) | < 4.3.0 | XSS | 过滤不完整 |
| BinaryFormatter | 全版本 | RCE | 已被微软标记为废弃，不应使用 |

**判定规则**:
- 危险版本 + 项目中实际使用了危险 API = **按对应 CVE 评级**
- 危险版本 + 项目未使用危险 API = **Medium（潜在风险）**
- 使用已终止支持 (EOL) 的 .NET 版本 = **Medium（无安全补丁）**
