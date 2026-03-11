# Rust 安全审计语义提示 (Semantic Hints)

> 本文件为覆盖率矩阵 (`coverage_matrix.md`) 的补充。
> **仅对未覆盖的维度按需加载对应 `## D{N}` 段落**，无需全量加载。
> LLM 自行决定搜索策略（Grep/Read/LSP/代码推理均可）。

## D1: 注入

**关键问题**:
1. `std::process::Command`: 是否使用 `.arg()` 逐参数传递？还是通过 `sh -c` + 字符串拼接？（安全: `.arg()` / 危险: `Command::new("sh").arg("-c").arg(format!("cmd {}", user_input))`）
2. SQL: `sqlx` / `diesel` / `sea-orm` 是否使用参数绑定？`query(&format!("SELECT ... WHERE id = {}", id))` 是否存在？
3. `format!` 拼接后传入 SQL / 命令 / 模板是否存在？
4. 模板引擎 (Tera / Askama / Handlebars): 模板内容是否来自用户输入？自动转义是否启用？
5. `regex::Regex::new(user_input)` 是否有 ReDoS 风险？是否设置 `size_limit`？

**易漏场景**:
- `sqlx::query(&format!("SELECT * FROM users WHERE name = '{}'", name))` — 注入
- `Command::new("sh").arg("-c").arg(format!("echo {}", user_input))` — 命令注入
- `Regex::new(&user_input)` 无 `RegexBuilder::size_limit` — ReDoS
- Diesel `sql_query(format!(...))` 绕过 ORM 安全机制

**判定规则**:
- `format!` 拼接 SQL + 用户输入 = **确认 SQL 注入 (Critical)**
- `Command::new("sh").arg("-c").arg(user_string)` = **确认命令注入 (Critical)**
- `Command::new(cmd).arg(user_arg)` = 安全（参数不被 shell 解释）
- `Regex::new(user_input)` 无 size_limit = **Medium (ReDoS)**

## D2: 认证

**关键问题**:
1. JWT (jsonwebtoken crate): `decode` 时 `Validation` 是否配置了 `validate_exp` / `required_spec_claims`？`dangerous_insecure_decode` 是否被使用？
2. 密码哈希: 是否使用 `argon2` / `bcrypt` / `scrypt` crate？还是直接 `sha2::Sha256`？
3. Session 管理: `actix-session` / `tower-sessions` 的 Session ID 是否足够随机？存储后端是否安全？
4. 中间件/Guard 顺序: Actix `wrap` / Axum `layer` 的认证中间件是否在路由之前？
5. 认证绕过: `#[cfg(debug_assertions)]` 是否跳过了认证检查？

**易漏场景**:
- `jsonwebtoken::dangerous_insecure_decode` 用于生产代码（无签名验证）
- `Validation::default()` 未设置 `iss` / `aud` 导致跨服务 Token 复用
- Actix Guard 在部分路由上遗漏 `.wrap(auth_middleware)`
- `bcrypt::verify` 的错误处理将 `Err` 视为验证通过

**判定规则**:
- `dangerous_insecure_decode` 在生产代码 = **Critical (JWT 绕过)**
- `Validation` 未验证 `exp` = **High (Token 永不过期)**
- SHA256 直接哈希密码（无盐/无迭代）= **Medium**
- 认证中间件未覆盖所有路由 = **High**

## D3: 授权

**关键问题**:
1. 资源操作是否验证用户归属？SQL 查询是否同时过滤 `user_id` 和 `resource_id`？
2. Actix Guard / Axum Extractor 中的权限检查是否在所有需要的 Handler 上应用？
3. 管理员接口是否有独立的角色/权限中间件？是否仅靠前端隐藏？
4. 路径参数中的 ID 是否可被替换（IDOR）？
5. 批量操作 API 是否逐一验证每个资源的归属？

**易漏场景**:
- `sqlx::query!("SELECT * FROM items WHERE id = $1", id)` 无 `AND user_id = $2`
- Axum: `Router::new().route("/admin/*", admin_routes)` 但 `admin_routes` 无权限中间件
- `Path(id): Path<i64>` 直接用于查询，未验证当前用户是否有权访问

**判定规则**:
- 查询仅按 `id` 无用户归属 + 敏感操作 = **High (IDOR)**
- 管理员路由无权限中间件 = **Critical (垂直越权)**
- 批量操作无逐一归属验证 = **High**

## D4: Unsafe 代码

**关键问题**:
1. `unsafe` 块: 每个 `unsafe` 块的安全不变量(safety invariant)是否有文档说明？实际是否满足？
2. 裸指针 `*const T` / `*mut T`: 解引用前是否验证非空且对齐？生命周期是否正确？
3. FFI 边界 (`extern "C"`): C 函数返回的指针是否检查 NULL？C 分配的内存是否用 C 的 `free` 释放（而非 Rust `drop`）？
4. `transmute` / `transmute_copy`: 源类型和目标类型的内存布局是否兼容？是否有更安全的替代（`as` / `from_*_bytes`）？
5. `Send` / `Sync` 手动实现: `unsafe impl Send for T` / `unsafe impl Sync for T` 是否正确？内部是否真的线程安全？
6. `std::mem::forget` / `ManuallyDrop`: 是否导致资源泄漏？是否用于绕过析构函数中的安全逻辑？
7. 内联汇编 (`asm!`): 是否有内存安全问题？`clobber_abi` 是否正确声明？
8. `slice::from_raw_parts` / `Vec::from_raw_parts`: 长度和容量是否正确？内存是否由对应的分配器分配？

**易漏场景**:
- `unsafe { &*ptr }` 但 `ptr` 可能已被释放（Use-After-Free）
- `unsafe impl Send for Wrapper(Rc<T>)` — `Rc` 非线程安全，手动标记 `Send` 导致数据竞争
- FFI: C 函数修改了 Rust `&mut` 引用之外的内存（别名违规）
- `transmute::<&[u8], &str>(bytes)` 未验证 UTF-8 有效性
- `Vec::set_len(new_len)` 扩展长度但未初始化新元素 — 读取未初始化内存
- `Box::from_raw(ptr)` 后原始指针仍被其他代码使用

**判定规则**:
- `unsafe` 块无安全注释 + 涉及裸指针 = **需人工审计 (High 风险)**
- `unsafe impl Send/Sync` + 内部含非线程安全类型 = **Critical (数据竞争 → UB)**
- `transmute` 跨不兼容类型 = **Critical (内存损坏)**
- FFI 返回指针未检查 NULL = **High (空指针解引用)**
- `from_raw_parts` 长度不可信 = **Critical (越界读写)**

## D5: 文件操作

**关键问题**:
1. `std::fs::read` / `File::open` / `read_to_string` 的路径是否含用户输入？是否验证路径在预期目录下？
2. 路径遍历: 是否使用 `Path::canonicalize()` + `starts_with()` 验证？`canonicalize` 失败（文件不存在）时如何处理？
3. 文件上传 (Actix Multipart / Axum): 文件名是否直接用于存储？是否生成随机文件名？
4. Zip 解压: `zip` crate 解压时条目路径是否检查 `../`？（Zip Slip）
5. 临时文件: 是否使用 `tempfile` crate？还是手动在 `/tmp` 中创建可预测文件名？

**易漏场景**:
- `format!("/data/{}", user_filename)` 中 `user_filename = "../../etc/passwd"`
- `Path::canonicalize` 返回 `Err` 时 fallback 到未校验路径
- `tokio::fs::read(path).await` 中 `path` 来自 URL query 参数
- Multipart `field.file_name()` 直接用于 `File::create`

**判定规则**:
- 路径含用户输入 + 无 `canonicalize` + `starts_with` 校验 = **Critical (任意文件读写)**
- 上传文件名直接使用 = **High (路径遍历)**
- `tempfile::NamedTempFile` = 安全
- Zip 条目路径未校验 = **High (Zip Slip)**

## D6: SSRF

**关键问题**:
1. `reqwest` / `hyper` / `ureq` 的 URL 是否来自用户输入？
2. URL 校验: 是否仅检查 scheme 和 host？是否考虑 DNS rebinding / `0x7f000001` / IPv6？
3. 重定向: `reqwest::Client` 的 `redirect::Policy` 是否允许重定向到内网？
4. Webhook URL 是否由用户配置？创建后是否重新校验？

**易漏场景**:
- `reqwest::get(&user_url).await` 无限制
- `redirect::Policy::limited(10)` 跟随重定向到 `http://169.254.169.254/`
- URL 解析差异: `url::Url::parse` 与实际请求库对 `http://user@host` 的解析不同

**判定规则**:
- URL 用户可控 + 无白名单 = **High (SSRF)**
- SSRF + 可达云元数据 = **Critical**
- 允许 `file://` scheme = **Critical (本地文件读取)**

## D7: 加密

**关键问题**:
1. 密钥/IV 是否硬编码在源码中？是否从环境变量/密钥管理服务加载？
2. 是否使用 `ring` / `rustls` / `RustCrypto`？还是通过 FFI 调用不安全的 C 加密库？
3. AES 模式: 是否使用 ECB？（应使用 GCM / CBC+HMAC）
4. 密码哈希: 是否使用 `argon2` / `bcrypt` crate？还是直接 `sha2::Sha256::digest`？
5. 随机数: 是否使用 `rand::thread_rng()` (ChaCha20) / `getrandom`？还是 `rand::rngs::SmallRng`？
6. 整数溢出: Release 模式下算术溢出不 panic 而是 wrapping — 密码学计算中是否可能导致安全问题？

**判定规则**:
- 硬编码密钥/IV = **High（加密形同虚设）**
- ECB 模式 = **Medium（无语义安全性）**
- `SHA256` 直接哈希密码 = **Medium**
- `SmallRng` 用于安全场景 = **High (不可用于密码学)**
- Release 模式整数 wrapping 影响密码学计算 = **High**

## D8: 配置

**关键问题**:
1. CORS: `tower-http::CorsLayer` / `actix-cors` 是否 `allow_any_origin()` + `allow_credentials(true)`？
2. TLS: `rustls` 配置是否禁用了证书验证？`danger_accept_invalid_certs(true)`？
3. 错误处理: `panic!` / `unwrap()` / `expect()` 在生产代码中是否可能导致 DoS？是否有 panic hook 进行优雅降级？
4. 配置文件中是否有明文密码/密钥？`.env` 文件是否提交到仓库？
5. `Cargo.toml` 中依赖是否锁定版本？`Cargo.lock` 是否提交？（应用项目应提交）
6. Feature flags: `#[cfg(feature = "insecure")]` 等不安全 feature 是否在生产构建中启用？

**判定规则**:
- `allow_any_origin()` + `allow_credentials(true)` = **High (CORS)**
- `danger_accept_invalid_certs(true)` 在生产 = **High (中间人攻击)**
- 大量 `unwrap()` 在请求处理路径 = **Medium (DoS via panic)**
- 明文密钥在配置文件 = **Medium（需评估暴露范围）**
- `Cargo.lock` 未提交 + 应用项目 = **Low（构建不可复现）**
