# PHP 安全审计语义提示 (Semantic Hints)

> 本文件为覆盖率矩阵 (`coverage_matrix.md`) 的补充。
> **仅对未覆盖的维度按需加载对应 `## D{N}` 段落**，无需全量加载。
> LLM 自行决定搜索策略（Grep/Read/LSP/代码推理均可）。

## D1: 注入

**关键问题**:
1. SQL 是否用字符串拼接用户输入？`mysql_query()` / `mysqli_query()` / `PDO::query()` 是否拼接 `$_GET`/`$_POST`？
2. PDO 是否使用 `prepare()` + `execute()`？还是 `query("... $var ...")`？
3. Laravel 是否使用 `DB::raw()` / `whereRaw()` / `orderByRaw()` 拼接用户输入？
4. `exec()` / `system()` / `passthru()` / `shell_exec()` / `popen()` / `` ` `` 是否拼接用户输入？
5. `eval()` / `assert()` / `preg_replace()` with `/e` 修饰符是否接收用户输入？
6. `include` / `require` 是否使用变量路径？（`include $_GET['page']` = LFI/RFI → RCE）
7. LDAP: `ldap_search()` 的 filter 是否拼接用户输入？

**易漏场景**:
- `$sql = "SELECT * FROM users WHERE id = " . $_GET['id'];` 在工具函数/Model 中
- Laravel `DB::raw("order by " . $request->input('sort'))` 在 Scope 方法中
- `include "templates/" . $_GET['tpl'] . ".php"` 可通过 `../` 或 `php://` 绕过
- `preg_replace('/.*/e', $_GET['code'], '')` （PHP < 7.0）

**判定规则**:
- 字符串拼接 + `$_GET`/`$_POST`/`$_REQUEST` + SQL 函数 = **确认 SQL 注入**
- `include`/`require` + 变量路径 + 无白名单 = **Critical (LFI/RFI → RCE)**
- `eval()`/`assert()` + 用户输入 = **Critical (RCE)**
- `exec()`/`system()` + 用户输入拼接 = **Critical (命令注入)**

## D2: 认证

**关键问题**:
1. Session 管理是否安全？`session_regenerate_id()` 是否在登录后调用？
2. 密码验证是否使用 `password_verify()`？还是 `md5($input) == $stored`（弱类型比较可绕过）？
3. JWT 签名是否验证？`algorithms` 是否显式指定？
4. Laravel `Auth::guard()` 是否覆盖所有路由？中间件是否有遗漏？
5. WordPress nonce 是否用于所有表单提交？`wp_verify_nonce()` 是否检查？
6. 是否有开发后门残留？（如 `if ($_GET['debug'] == 'admin') { ... }`）

**易漏场景**:
- `==` 弱类型比较：`"0e123" == "0e456"` 为 `true`，hash 碰撞绕过认证
- `strcmp($_POST['password'], $stored)` 当传入数组时返回 `NULL`，`NULL == 0` 为 `true`
- Laravel 路由组中间件覆盖不完整，部分 API 路由漏掉 `auth` 中间件
- `$_SESSION` 未绑定 IP/UserAgent，Session fixation 可利用

**判定规则**:
- `md5($input) == $hash` 弱类型比较 = **High (认证绕过)**
- `strcmp()` 比较密码 + 未检查返回类型 = **High (类型混淆绕过)**
- 登录后未 `session_regenerate_id()` = **Medium (Session fixation)**
- 敏感路由缺少 auth 中间件 = **High**

## D3: 授权

**关键问题**:
1. 资源操作是否验证用户归属？`Model::find($id)` vs `auth()->user()->resources()->find($id)`？
2. CRUD Controller 中 `destroy`/`update` 是否与 `show` 有相同的权限检查？
3. 管理员接口是否有独立的角色/权限验证？
4. WordPress: `current_user_can()` 是否在所有 AJAX handler 和 REST endpoint 中检查？
5. 批量操作接口是否逐一验证每个资源归属？

**易漏场景**:
- Laravel `Route::resource` 注册了完整 CRUD，但 Policy 只覆盖了 `view`/`create`
- WordPress plugin AJAX handler 缺少 `check_ajax_referer()` 和 `current_user_can()`
- 文件下载接口仅检查登录状态

**判定规则**:
- `Model::find($id)` 无用户归属校验 + 敏感操作 = **High (IDOR)**
- CRUD 中 delete/update 缺少权限检查而 read 有 = **High (授权不一致)**
- WordPress AJAX handler 无 `current_user_can()` = **High (任意用户可调用)**

## D4: 反序列化

**关键问题**:
1. `unserialize()` 的数据来源是否可信？是否来自 Cookie、URL 参数、数据库（用户可控字段）？
2. 项目中是否存在 `__wakeup()` / `__destruct()` / `__toString()` 等魔术方法构成 Gadget chain？
3. Phar 反序列化：`file_exists()` / `is_file()` / `fopen()` 等文件操作函数是否接受用户输入路径？（`phar://` 触发反序列化）
4. `unserialize()` 是否使用 `allowed_classes` 参数限制？

**易漏场景**:
- Cookie 中存储序列化对象：`unserialize($_COOKIE['data'])`
- `file_exists($user_input)` 当 `$user_input = "phar://malicious.phar"` 时触发反序列化
- Laravel / Symfony 框架中 Gadget chain 丰富，`unserialize()` + 框架 = RCE

**判定规则**:
- `unserialize()` + 不可信数据源 = **Critical (RCE)**
- `file_exists()`/`is_file()` + 用户可控路径 + 可上传文件 = **Critical (Phar 反序列化)**
- `unserialize()` + 无 `allowed_classes` 限制 = **High**

## D5: 文件操作

**关键问题**:
1. 文件上传：是否校验扩展名白名单？是否仅检查 `$_FILES['type']`（客户端可伪造）？是否用原始文件名？
2. `file_get_contents()` / `fopen()` / `readfile()` / `unlink()` 路径是否拼接用户输入？
3. `move_uploaded_file()` 目标路径是否用户可控？上传目录是否在 Web 可达路径？
4. ZIP: `ZipArchive::extractTo()` 是否校验条目路径？（Zip Slip）
5. `file_put_contents()` 路径和内容是否用户可控？

**易漏场景**:
- 仅检查 MIME 类型，不检查扩展名：上传 `.php` 文件
- 双扩展名绕过：`shell.php.jpg`（Apache 配置错误时可执行）
- `../` 过滤不递归：`....//` → `../`
- 上传目录在 `public/uploads/`，直接 Web 可访问

**判定规则**:
- 文件上传 + 无扩展名白名单 + Web 可达目录 = **Critical (WebShell)**
- 路径拼接 + 无 `../` 过滤 = **Critical (任意文件读写)**
- `unlink($user_input)` 无路径验证 = **High (任意文件删除)**

## D6: SSRF

**关键问题**:
1. `curl_exec()` / `file_get_contents($url)` / `fsockopen()` 的 URL 是否来自用户输入？
2. `file_get_contents()` 是否限制协议？（`php://`、`file://`、`gopher://` 均可利用）
3. URL 校验是否可绕过？（DNS rebinding、`@` 符号、IP 十进制/八进制编码）
4. WordPress: `wp_remote_get()` / `wp_remote_post()` 的 URL 是否用户可控？
5. Webhook / 回调 URL 配置是否用户可控？

**易漏场景**:
- `file_get_contents("http://" . $_GET['url'])` 直接拼接
- `curl_setopt($ch, CURLOPT_URL, $user_url)` 无协议限制
- 仅检查 hostname 不在 `127.0.0.1`，遗漏 `0.0.0.0`、`169.254.169.254`、IPv6

**判定规则**:
- URL 用户可控 + 无白名单 = **High (SSRF)**
- `file_get_contents()` + 用户 URL + 无协议限制 = **Critical (本地文件读取 via file://)**
- SSRF + 可访问云元数据 = **Critical**

## D7: 加密

**关键问题**:
1. 密码存储是否使用 `password_hash()` + `password_verify()`？还是 `md5()` / `sha1()`？
2. 加密密钥是否硬编码？`APP_KEY`（Laravel）是否在 `.env` 中且足够强？
3. `mcrypt_*` 系列函数是否仍在使用？（已废弃，不安全）
4. 随机数生成是否使用 `random_bytes()` / `random_int()`？还是 `rand()` / `mt_rand()`？

**判定规则**:
- `md5($password)` / `sha1($password)` 用于密码存储 = **Medium**
- `mt_rand()` / `rand()` 用于 Token/验证码 = **High (可预测)**
- 硬编码 `APP_KEY` 或加密密钥 = **High**
- `mcrypt_encrypt()` 使用 ECB 模式 = **Medium**

## D8: 配置

**关键问题**:
1. `display_errors = On` 是否在生产环境？`error_reporting(E_ALL)` 是否暴露堆栈？
2. `allow_url_include = On`？（结合 LFI = RFI → RCE）
3. CORS 是否为 `*` + credentials？
4. `.env` 文件是否可通过 Web 访问？`.git` 目录是否暴露？
5. 配置文件中是否有明文数据库密码、API Key？
6. Laravel `APP_DEBUG = true` 是否在生产环境？（Ignition debug page 可泄露 .env）
7. PHP `open_basedir` / `disable_functions` 是否配置？

**判定规则**:
- `APP_DEBUG=true` 生产环境 = **High (凭证泄露 via Ignition)**
- `allow_url_include=On` = **Critical (RFI → RCE)**
- `display_errors=On` 生产环境 = **Medium (信息泄露)**
- `.env` Web 可访问 = **Critical (全部凭证泄露)**

## D9: 业务逻辑

**关键问题**:
1. PHP 弱类型比较是否导致逻辑绕过？`==` vs `===`？`in_array()` 第三个参数是否为 `true`？
2. 金额/数量是否在服务端验证？
3. 并发操作是否有锁机制？数据库事务隔离级别是否足够？
4. Mass Assignment: Laravel `$fillable` / `$guarded` 是否正确配置？是否用 `$request->all()` 直接传入 `create()`？
5. SSTI: Blade/Twig/Smarty 模板是否接收用户输入作为模板内容？`{!! $var !!}` 是否含用户输入？
6. 变量覆盖：`extract($_GET)` / `parse_str($input)` 是否覆盖关键变量？

**易漏场景**:
- `in_array($input, $whitelist)` 无 strict 模式：`in_array("1abc", [1,2,3])` 为 `true`
- Laravel `User::create($request->all())` + `$fillable` 未排除 `is_admin`
- `extract($_POST)` 覆盖 `$isAdmin` 变量
- Smarty `{$smarty.template}` / Twig `{{ user_input }}` 注入

**判定规则**:
- `extract($_GET/$_POST)` = **High (变量覆盖)**
- `$request->all()` + `create()` + `$fillable` 含权限字段 = **High (Mass Assignment)**
- `in_array()` 无 strict + 安全判断 = **Medium (类型混淆)**
- SSTI 用户输入作为模板 = **Critical (RCE)**

## D10: 供应链

**依赖组件速查** (仅 composer.json / composer.lock 中存在时检查):

| 依赖 | 危险版本 | 漏洞类型 | 检查要点 |
|------|---------|---------|---------|
| laravel/framework | < 9.x | 多种 | SQL 注入、RCE、信息泄露 |
| symfony/http-kernel | < 5.4.20 | RCE | Fragment 路由注入 |
| guzzlehttp/guzzle | < 7.4.5 | SSRF/信息泄露 | 跨域重定向泄露凭证 |
| phpunit/phpunit | 全版本(生产) | RCE | `eval-stdin.php` 暴露 |
| monolog/monolog | < 2.7.0 | RCE | StreamHandler 路径注入 |
| twig/twig | < 3.4.3 | SSTI | 沙箱绕过 |
| league/flysystem | < 3.0 | 路径遍历 | 路径规范化不完整 |
| WordPress core | < 6.4 | 多种 | POP chain / SQL 注入 |
| phpmailer | < 6.5.0 | RCE | mail() 参数注入 |
| dompdf/dompdf | < 2.0.1 | RCE | font 缓存路径注入 |

**判定规则**:
- 危险版本 + 项目中实际使用了危险 API = **按对应 CVE 评级**
- 危险版本 + 项目未使用危险 API = **Medium (潜在风险)**
- `phpunit` 存在于生产依赖 = **High (eval-stdin.php 可访问)**
