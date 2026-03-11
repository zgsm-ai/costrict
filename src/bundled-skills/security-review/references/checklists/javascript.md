# JavaScript/Node.js 安全审计语义提示 (Semantic Hints)

> 本文件为覆盖率矩阵 (`coverage_matrix.md`) 的补充。
> **仅对未覆盖的维度按需加载对应 `## D{N}` 段落**，无需全量加载。
> LLM 自行决定搜索策略（Grep/Read/LSP/代码推理均可）。

## D1: 注入

**关键问题**:
1. SQL: `sequelize.query()` / `knex.raw()` / `pool.query()` 是否用模板字符串拼接用户输入？（安全: 参数化 `?` / 危险: `${}`）
2. NoSQL: MongoDB `find({ $where: user_input })` / `find(JSON.parse(req.body))` 是否注入操作符 `$gt`/`$regex`/`$where`？
3. `eval()` / `new Function()` / `vm.runInNewContext()` 是否接收用户输入？
4. `child_process.exec()` / `child_process.spawn()` 是否拼接用户输入？`shell: true` 选项？
5. 模板引擎（EJS/Pug/Handlebars）是否将用户输入作为模板编译？（SSTI）
6. `RegExp(user_input)` 是否存在 ReDoS？嵌套量词 `(a+)+` 模式？

**易漏场景**:
- `` sequelize.query(`SELECT * FROM users WHERE id = ${req.params.id}`) ``
- MongoDB `db.collection.find(req.query)` 直接传入查询对象，攻击者构造 `{"$gt": ""}` 绕过
- `child_process.exec("git log " + userBranch)` 拼接用户输入
- EJS `render(userTemplate, data)` 中 `userTemplate` 来自数据库/用户输入

**判定规则**:
- 模板字符串 + SQL 函数 + 用户输入 = **确认 SQL 注入**
- `find(req.body)` / `find(req.query)` 无 sanitize = **High (NoSQL 注入)**
- `eval()` / `new Function()` + 用户输入 = **Critical (RCE)**
- `exec()` + 字符串拼接 + 用户输入 = **Critical (命令注入)**
- `RegExp(user_input)` + 无超时 = **Medium (ReDoS)**

## D2: 认证

**关键问题**:
1. JWT: `jwt.decode()` 是否仅解码而无 `jwt.verify()`？`algorithms` 是否显式指定（排除 `none`）？
2. Session secret 是否硬编码？`express-session` 的 `secret` 来源？
3. Passport.js `serializeUser` / `deserializeUser` 是否安全？Session 存储是否持久化？
4. 路由中间件是否覆盖所有需认证的路由？是否有路由在 `authMiddleware` 之前注册？
5. Cookie 是否设置 `httpOnly`、`secure`、`sameSite`？
6. 是否有开发环境认证绕过残留？

**易漏场景**:
- Express 路由注册顺序：公开路由在 auth 中间件之前，但含敏感路径
- `jsonwebtoken` 旧版本 `jwt.verify()` 接受 `algorithms: ["none"]`
- Socket.io 连接未验证 Token
- GraphQL endpoint 无认证中间件

**判定规则**:
- `jwt.decode()` 无配套 `jwt.verify()` = **Critical (CVSS 9.1)**
- `algorithms` 含 `"none"` = **Critical (签名绕过)**
- 硬编码 session secret = **High**
- WebSocket/GraphQL 端点无认证 = **High**

## D3: 授权

**关键问题**:
1. 资源操作是否验证归属？`Model.findById(id)` vs `Model.findOne({ _id: id, userId: req.user.id })`？
2. Express/Koa 路由的 DELETE/PUT 是否有独立的权限中间件？
3. GraphQL resolver 是否逐个检查权限？Mutation 是否验证资源归属？
4. 批量操作接口是否逐一验证每个资源 ID 的归属？
5. 管理员 API 是否有角色验证中间件？

**易漏场景**:
- REST API `GET /api/users/:id` 有权限检查，但 `DELETE /api/users/:id` 遗漏
- GraphQL `query` 有权限检查，但部分 `mutation` 遗漏
- 文件下载路由 `res.download(path)` 仅验证登录状态

**判定规则**:
- `findById(req.params.id)` 无归属校验 + 敏感操作 = **High (IDOR)**
- CRUD 中 delete/update 缺权限而 read 有 = **High (授权不一致)**
- 管理员 API 无角色中间件 = **Critical (垂直越权)**

## D4: 原型污染 & 反序列化

**关键问题**:
1. `Object.assign(target, userInput)` / `_.merge(target, userInput)` / `_.defaultsDeep()` 是否接收用户输入？
2. 用户输入是否可设置 `__proto__` / `constructor.prototype` 属性？
3. `JSON.parse()` 后是否直接用于 `Object.assign` 或递归合并？
4. `node-serialize` / `cryo` / `js-yaml` 是否反序列化不可信数据？
5. `js-yaml.load()` 是否使用 `DEFAULT_SCHEMA`？（应使用 `JSON_SCHEMA` 或 `FAILSAFE_SCHEMA`）

**易漏场景**:
- 配置合并：`Object.assign(defaultConfig, req.body)` 攻击者传入 `{"__proto__": {"isAdmin": true}}`
- `lodash.merge({}, req.body)` （lodash < 4.17.12）触发原型污染
- 原型污染 → 模板引擎 RCE（如 Handlebars/EJS 通过污染 `__proto__.type` 执行代码）

**判定规则**:
- `_.merge()` / `_.defaultsDeep()` + 用户输入 + lodash < 4.17.12 = **Critical (原型污染)**
- `Object.assign({}, req.body)` + 无 `__proto__` 过滤 = **High (原型污染)**
- 原型污染 + 模板引擎(EJS/Handlebars/Pug) = **Critical (RCE)**
- `node-serialize.unserialize()` + 用户输入 = **Critical (RCE)**

## D5: 文件操作

**关键问题**:
1. `fs.readFile()` / `fs.writeFile()` / `res.sendFile()` / `res.download()` 路径是否拼接用户输入？
2. `path.join()` / `path.resolve()` 是否正确防止路径遍历？（`path.join("/base", "../../../etc/passwd")` 仍可遍历）
3. 文件上传（multer/formidable）是否校验扩展名和大小？
4. ZIP/tar 解压是否校验条目路径？
5. 静态文件服务是否正确配置 root 目录？

**易漏场景**:
- `res.sendFile(path.join(__dirname, 'uploads', req.params.filename))` 当 filename 含 `../`
- `path.resolve(userInput)` 当输入为绝对路径时忽略 base
- multer 配置 `destination` 在 `public/` 下且无扩展名限制

**判定规则**:
- 路径拼接 + 无 `../` 过滤 + 无 `path.normalize` 后验证 = **Critical (任意文件读写)**
- 上传无扩展名校验 + Web 可达目录 = **High**
- `extractall` 无路径校验 = **High (Zip Slip)**

## D6: SSRF

**关键问题**:
1. `axios` / `fetch()` / `http.get()` / `got()` / `node-fetch` 的 URL 是否来自用户输入？
2. URL 校验是否仅检查字符串前缀/hostname？DNS rebinding 是否可绕过？
3. 是否限制协议？`file://`？
4. Webhook / 回调 URL 是否用户可控？
5. 图片/头像 URL 抓取功能是否校验目标？

**易漏场景**:
- `axios.get(req.query.url)` 直接使用用户 URL
- URL 白名单用 `startsWith("https://allowed.com")` 可被 `https://allowed.com.evil.com` 绕过
- 仅禁止 `127.0.0.1`，遗漏 `0.0.0.0`、`[::1]`、`169.254.169.254`

**判定规则**:
- URL 用户可控 + 无白名单 = **High (SSRF)**
- SSRF + 可访问云元数据 = **Critical**
- `file://` 协议未禁止 = **High**

## D7: 加密

**关键问题**:
1. 密钥/secret 是否硬编码在源码中？`.env` 是否在 `.gitignore` 中？
2. 密码存储是否使用 `bcrypt` / `scrypt`？还是 `crypto.createHash('md5')`？
3. 随机数是否使用 `crypto.randomBytes()` / `crypto.randomUUID()`？还是 `Math.random()`？
4. `crypto.createCipheriv()` 是否使用 ECB 模式？IV 是否硬编码？

**判定规则**:
- 硬编码 secret/key 在源码 = **High**
- `Math.random()` 用于 Token/验证码 = **High (可预测)**
- MD5/SHA1 用于密码哈希 = **Medium**
- AES-ECB = **Medium**

## D8: 配置

**关键问题**:
1. Express `trust proxy` 是否正确配置？错误配置导致 IP 伪造？
2. CORS `origin: true` / `origin: '*'` + `credentials: true`？
3. `helmet` 是否启用？安全 HTTP headers 是否设置？
4. 异常处理是否向客户端暴露堆栈？`NODE_ENV !== 'production'`？
5. `.env` / `config.js` 中是否有明文密码、API Key？
6. `npm` / `yarn` lock 文件是否提交？（确保依赖版本锁定）
7. `debug` 模块是否在生产环境启用？

**判定规则**:
- CORS `*` + credentials = **High**
- `NODE_ENV=development` 生产环境 = **Medium (堆栈暴露)**
- 明文密钥在 `config.js` 提交到 Git = **High**
- 未使用 `helmet` = **Low (缺少安全 headers)**

## D9: 业务逻辑

**关键问题**:
1. 金额/数量是否在服务端验证？
2. 并发操作是否有原子性保证？MongoDB `findOneAndUpdate` 是否正确使用？
3. 多步流程是否可跳过？
4. Mass Assignment: Mongoose Schema 是否使用 `select: false` 排除敏感字段？`Model.create(req.body)` 是否直接使用？
5. XSS: `dangerouslySetInnerHTML` / `v-html` / `{{{triple-stache}}}` 是否包含用户输入？
6. DOM XSS: `document.write()` / `innerHTML` / `location.href` 是否注入用户输入？

**易漏场景**:
- React `dangerouslySetInnerHTML={{ __html: userContent }}` 从 API 获取未清理的 HTML
- Vue `v-html="userContent"` 直接绑定
- Mongoose `User.create(req.body)` + Schema 含 `role` 字段
- `document.location = url` 中 `url` 来自 `location.hash`（DOM XSS / 开放重定向）

**判定规则**:
- `dangerouslySetInnerHTML` / `v-html` + 用户输入 = **High (Stored XSS)**
- `document.write()` / `innerHTML` + 用户输入 = **High (DOM XSS)**
- `Model.create(req.body)` + Schema 含权限字段 = **High (Mass Assignment)**
- 金额来自客户端 = **Critical (支付绕过)**

## D10: 供应链

**依赖组件速查** (仅 package.json / package-lock.json 中存在时检查):

| 依赖 | 危险版本 | 漏洞类型 | 检查要点 |
|------|---------|---------|---------|
| lodash | < 4.17.21 | 原型污染 | `_.merge` / `_.defaultsDeep` |
| express | < 4.19.2 | 多种 | 路径遍历、开放重定向 |
| jsonwebtoken | < 9.0.0 | 认证绕过 | algorithms 不限制 "none" |
| axios | < 1.6.0 | SSRF | 跨域重定向泄露凭证 |
| node-serialize | 全版本 | RCE | `unserialize()` 执行代码 |
| js-yaml | < 4.0.0 | RCE | 默认 Schema 允许 `!!js/function` |
| handlebars | < 4.7.7 | RCE | 原型污染 → 模板 RCE |
| ejs | < 3.1.7 | RCE | 原型污染 → 模板 RCE |
| minimist | < 1.2.6 | 原型污染 | `--__proto__.x` 注入 |
| mongoose | < 6.0.0 | NoSQL 注入 | 查询选择器注入 |

**判定规则**:
- 危险版本 + 项目中实际使用了危险 API = **按对应 CVE 评级**
- 危险版本 + 项目未使用危险 API = **Medium (潜在风险)**
- `node-serialize` 存在于依赖中 = **Critical (无安全用法)**
