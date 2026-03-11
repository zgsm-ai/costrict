# Java 安全审计语义提示 (Semantic Hints)

> 本文件为覆盖率矩阵 (`coverage_matrix.md`) 的补充。
> **仅对未覆盖的维度按需加载对应 `## D{N}` 段落**，无需全量加载。
> LLM 自行决定搜索策略（Grep/Read/LSP/代码推理均可）。

## D1: 注入

**关键问题**:
1. MyBatis 映射文件中是否使用 `${}`？（安全: `#{}` / 危险: `${}`）
2. JPA/Hibernate 是否有 native query 或 `createQuery` 拼接用户输入？
3. JDBC 是否用 `Statement` 而非 `PreparedStatement`？
4. ORDER BY / LIMIT / 表名 / 列名——这些无法参数化，是否有白名单验证？
5. SpEL: 是否有 `parseExpression()` 接收用户输入？`@Value("#{...}")` 是否注入外部值？
6. LDAP: `DirContext`/`LdapContext` 的查询条件是否拼接用户输入？
7. 是否存在二次注入？（输入→存储→取出→拼接 SQL）

**易漏场景**:
- `${}` 在 `<if>/<when>` 条件分支内，仅特定参数时触发
- `StringBuilder`/`String.format` 间接拼接后传入 SQL
- MyBatis `<foreach>` 中的 `${}` 被忽略

**判定规则**:
- `${}` + 参数来自 `@RequestParam`/`@PathVariable` = **确认 SQL 注入**
- `#{}` = 安全（参数化）
- `Statement` + 字符串拼接 = **确认 SQL 注入**
- `SpelExpressionParser` + 用户输入 = **确认表达式注入**

## D2: 认证

**关键问题**:
1. JWT 是仅 `decode()` 还是有完整 `verify()`？（常见: `JWT.decode()` 无签名校验）
2. 签名密钥来源？硬编码 / 配置文件 / 环境变量？密钥长度是否足够？
3. Token 过期策略？是否有刷新机制？过期时间是否合理？
4. 白名单路径是否过宽？（如 `/api/**` 意外放行敏感接口）
5. Filter/Interceptor 链顺序是否正确？认证 Filter 是否在业务处理之前？
6. 是否有开发/测试环境的认证绕过开关残留？

**易漏场景**:
- OPTIONS 预检请求跳过认证但未限制后续 HTTP 方法
- 路径规范化差异：`/api/admin` vs `/api/admin/` vs `/api//admin`
- 嵌入式 Token（link token）与主 Token 使用不同验证逻辑
- Shiro `rememberMe` 使用硬编码密钥（< 1.2.5 默认 AES 密钥）

**判定规则**:
- `JWT.decode()` 无配套 `JWTVerifier.verify()` = **Critical (CVSS 9.1)**
- 硬编码 JWT 签名密钥 = **High**
- 白名单路径含通配符 + 覆盖敏感接口 = **Critical**
- Shiro < 1.2.5 + 未更换默认密钥 = **Critical**

## D3: 授权

**关键问题**:
1. 资源操作（CRUD）是否验证用户归属？`findById(id)` vs `findById(userId, id)`？
2. 同一 Controller 的 create/read/update/delete 权限注解是否一致？delete 是否缺少检查？
3. 管理员接口是否有独立的角色验证？是否仅靠前端隐藏？
4. 批量操作接口是否逐一验证每个资源的归属？
5. API 路径上的 ID 参数是否可被替换为其他用户的资源 ID（IDOR）？

**易漏场景**:
- 列表接口有权限过滤，但详情/删除接口直接用 ID 查询无过滤
- 组织隔离：用户只能看本组织数据，但 API 未校验组织归属
- 文件/资源下载接口只校验登录状态，不校验资源归属

**判定规则**:
- `findById(id)` 无用户归属校验 + 敏感操作 = **High (IDOR)**
- CRUD 中 delete/update 缺少权限注解而 read 有 = **High (授权不一致)**
- 管理员接口无角色验证 = **Critical (垂直越权)**

## D4: 反序列化

**关键问题**:
1. 是否存在 `ObjectInputStream.readObject()` / `XMLDecoder`？数据来源是否可信？
2. classpath 中是否有 Gadget 库？(commons-collections, commons-beanutils, c3p0)
3. JSON 库（Fastjson/Jackson/Gson）是否启用了类型推断（`@type`, `enableDefaultTyping`）？
4. SnakeYAML: 是否使用 `new Yaml()` 默认构造器？（应使用 `new Yaml(new SafeConstructor())`）

**易漏场景**:
- Fastjson < 1.2.83 的 autoType 绕过
- Jackson `enableDefaultTyping()` + 多态反序列化
- Redis/MQ 中存储的序列化对象被反序列化

**判定规则**:
- `ObjectInputStream.readObject()` + 不可信数据源 + classpath 有 Gadget = **Critical (RCE)**
- Fastjson < 1.2.83 + `JSON.parse`/`JSON.parseObject` = **Critical**
- `new Yaml()` 默认构造器 + 不可信输入 = **Critical (CVE-2022-1471)**

## D5: 文件操作

**关键问题**:
1. 文件上传：是否校验文件扩展名？是否校验 Content-Type？是否使用原始文件名存储？
2. 文件下载/读取：路径是否拼接用户输入？是否过滤 `../`？过滤是否可绕过？
3. Zip/压缩包：解压路径是否受控？（Zip Slip: 压缩条目路径含 `../`）
4. 文件操作是否检查符号链接？

**易漏场景**:
- 仅检查最后一个 `.` 后的扩展名，`file.jsp.jpg` 绕过
- `../` 过滤不递归：`....//` 过滤后变为 `../`
- 上传目录在 Web 可达路径下，上传后直接可访问

**判定规则**:
- 文件名来自 `getOriginalFilename()` + 未校验 = **High (路径遍历)**
- 路径拼接 + 无 `../` 过滤或过滤不完整 = **Critical (任意文件读写)**
- 上传到 Web 目录 + 允许 jsp/jspx 扩展名 = **Critical (WebShell)**

## D6: SSRF

**关键问题**:
1. `HttpURLConnection`/`RestTemplate`/`OkHttp`/`WebClient` 的 URL 是否来自用户输入？
2. URL 校验是否仅检查 hostname？DNS rebinding 是否可绕过？
3. 是否限制协议？（file://、gopher://、dict://）
4. `ImageIO.read(url)` 是否接受用户 URL？
5. 数据源配置（JDBC URL）是否用户可控？

**易漏场景**:
- URL 白名单基于字符串前缀匹配，`http://evil.com@allowed.com` 绕过
- 仅校验 IP 不在 `127.0.0.0/8`，遗漏 `169.254.169.254`（云元数据）、`0.0.0.0`、IPv6 `::1`
- JDBC URL 注入：用户控制 JDBC 连接字符串 → `jdbc:h2:mem:;INIT=RUNSCRIPT` → RCE

**判定规则**:
- URL 用户可控 + 无白名单/黑名单 = **High (SSRF)**
- SSRF + 可访问云元数据 `169.254.169.254` = **Critical**
- JDBC URL 用户可控 + H2/MySQL 协议 = **Critical (RCE)**

## D7: 加密

**关键问题**:
1. AES/DES 密钥是否硬编码在源码中？IV 是否硬编码？
2. 是否使用 ECB 模式？（ECB 不提供语义安全性）
3. 密码存储是否使用 bcrypt/scrypt/argon2？还是 MD5/SHA1？
4. 随机数生成是否使用 `SecureRandom`？还是 `java.util.Random`？
5. PBKDF2 迭代次数是否≥100,000？salt 是否≥16字节且随机？
6. RSA 加密是否使用 OAEP？还是 PKCS#1 v1.5（Bleichenbacher）？
7. CBC 模式 + 无 MAC/签名 → Padding Oracle 风险？
8. GCM nonce 是否保证唯一（随机96位 or 计数器）？重用=密钥流恢复
9. 自定义 TrustManager/HostnameVerifier 是否绕过证书校验？
10. JWT 签名密钥长度是否足够？HS256 密钥是否≥32字节？

**判定规则**:
- 硬编码 AES 密钥 + 硬编码 IV = **High（加密形同虚设）**
- MD5/SHA1 用于密码哈希 = **Medium**
- `java.util.Random` 用于安全相关场景（Token、验证码）= **High**
- RSA PKCS#1 v1.5 加密 (`Cipher.getInstance("RSA")` 无 OAEP) = **High**
- CBC + 无 HMAC 验证 + 错误消息区分 padding = **High（Padding Oracle）**
- GCM nonce 硬编码/重用 = **Critical（密钥流恢复）**
- 自定义 `X509TrustManager.checkServerTrusted()` 返回空 = **High（MITM）**
- PBKDF2 iterations < 10,000 = **Medium**；< 1,000 = **High**

## D8: 配置

**关键问题**:
1. Spring Boot Actuator 端点是否暴露？是否有访问控制？
2. CORS 配置是否为 `Access-Control-Allow-Origin: *` + `Allow-Credentials: true`？
3. 异常处理是否向客户端暴露完整堆栈信息？
4. 配置文件中是否有明文密码、API Key、私钥？
5. 日志中是否打印 password/token/secret？
6. debug/开发模式是否在生产配置中开启？

**判定规则**:
- Actuator `/env`/`/heapdump` 无认证可访问 = **Critical（凭证泄露）**
- CORS `*` + credentials = **High**
- 明文密码在 application.yml = **Medium**（需评估暴露范围）

## D9: 业务逻辑

**关键问题（金融/支付场景）**:
1. 金额/数量计算是否在服务端验证？客户端参数是否可篡改？
2. 并发操作（余额扣减、库存扣减、订单创建）是否有原子性保证或锁机制？
3. 多步流程是否可跳过步骤？（如跳过支付直接确认订单）
4. 验证码/短信码是否有速率限制和过期机制？

**关键问题（后台管理/CMS/通用场景）**:
5. IDOR/水平越权: `findById`/`getById` 后是否校验资源归属当前用户？每个 CRUD 端点（含 delete/copy/export）都需检查
6. 权限注解完整性: 对同一资源的 CRUD 操作，权限检查是否一致？（如 read 有 `@RequiresPermissions` 但 delete 无）
7. Mass Assignment: `@ModelAttribute`/`@RequestBody` 是否绑定了不应由用户控制的字段（如 role、isAdmin、siteId）？
8. 数据导出/批量操作: 导出/批量删除接口是否有范围限制？能否导出其他租户/站点的数据？
9. 多租户/多站点隔离: 查询条件是否强制包含租户/站点标识？能否通过篡改参数跨站操作？

**系统化审计方法（适用 CMS/后台管理系统）**:
```
1. 枚举所有后台 Controller，提取全部 @RequestMapping 端点
2. 对每个资源类型的 CRUD 端点，检查权限注解一致性:
   - 有 create 权限检查但无 delete 权限检查 → 授权缺失
   - 有 list 权限检查但无 export 权限检查 → 数据泄露
3. 对每个 findById/getById 调用，追踪返回值是否与当前用户比对
4. 对每个 @RequestBody 绑定的实体类，检查是否有 @JsonIgnore 或 DTO 隔离敏感字段
```

**判定规则**:
- 金额来自客户端 + 服务端未重新计算 = **Critical（支付绕过）**
- 无锁的余额扣减 = **High（竞态条件）**
- `@RequestBody` 直接绑定含权限字段的实体 = **High（Mass Assignment）**
- `findById` 后无归属校验 + 端点可由普通用户访问 = **High（IDOR/水平越权）**
- 同一资源 read 有权限检查但 delete 无 = **High（垂直越权）**
- 批量导出无范围限制 + 多租户场景 = **Medium（数据泄露）**

## D10: 供应链

**依赖组件速查** (仅 pom.xml/build.gradle 中存在时检查):

| 依赖 | 危险版本 | 漏洞类型 | 检查要点 |
|------|---------|---------|---------|
| fastjson | < 1.2.83 | RCE | autoType + @type |
| log4j-core | < 2.17.0 | RCE | JNDI lookup in log message |
| shiro-core | < 1.2.5 | RCE | rememberMe 硬编码密钥 |
| snakeyaml | 全版本 | RCE | `new Yaml()` 默认构造器 |
| commons-collections | < 3.2.2 | RCE | Gadget chain |
| commons-text | < 1.10 | RCE | StringSubstitutor interpolation |
| spring-framework | < 5.3.18 | RCE | CVE-2022-22965 (Spring4Shell) |
| jackson-databind | < 2.13.4 | RCE | enableDefaultTyping |
| h2 | 全版本 | RCE | INIT=RUNSCRIPT (若 JDBC URL 可控) |

**判定规则**:
- 危险版本 + 项目中实际使用了危险 API = **按对应 CVE 评级**
- 危险版本 + 项目未使用危险 API = **Medium（潜在风险）**
