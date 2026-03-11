# Python 安全审计语义提示 (Semantic Hints)

> 本文件为覆盖率矩阵 (`coverage_matrix.md`) 的补充。
> **仅对未覆盖的维度按需加载对应 `## D{N}` 段落**，无需全量加载。
> LLM 自行决定搜索策略（Grep/Read/LSP/代码推理均可）。

## D1: 注入

**关键问题**:
1. SQL 是否用 f-string / `%` / `.format()` 拼接用户输入？（安全: 参数化 `cursor.execute(sql, params)` / 危险: 字符串拼接）
2. Django ORM 是否使用 `raw()`/`extra()`/`RawSQL()`？参数是否拼接？
3. SQLAlchemy 是否使用 `text()` + 字符串拼接？`filter()` 中是否拼接字符串？
4. `os.system()` / `subprocess` 是否拼接用户输入？`shell=True` 时参数是否来自外部？
5. `eval()` / `exec()` 是否接收用户可控字符串？
6. LDAP: `ldap.search_s()` 的 filter 参数是否拼接用户输入？
7. Django `filter(**request.GET.dict())` 是否允许用户控制查询字段名？（ORM 注入 / 信息泄露）

**易漏场景**:
- `cursor.execute(f"SELECT ... WHERE id={user_input}")` 写在非 ORM 的工具函数中
- `subprocess.run(cmd, shell=True)` 中 `cmd` 由多个变量拼接，其中一个来自用户
- `os.popen()` / `commands.getoutput()` 等老旧 API 仍在使用
- Django `extra(where=[...])` 中条件拼接用户输入

**判定规则**:
- `execute(f"...")`/`execute("..." % ...)` + 用户输入 = **确认 SQL 注入**
- `os.system()`/`subprocess(..., shell=True)` + 用户输入拼接 = **确认命令注入 (Critical)**
- `eval()`/`exec()` + 用户可控 = **Critical (RCE)**
- `filter(**request.GET.dict())` = **High (ORM 字段注入)**

## D2: 认证

**关键问题**:
1. JWT 是否仅 `jwt.decode()` 而未验证签名？`algorithms` 参数是否显式指定？（`algorithms=["none"]` = 绕过）
2. Django `@login_required` 是否覆盖所有敏感视图？是否有视图遗漏装饰器？
3. Flask 是否使用 `flask-login` 的 `@login_required`？是否有路由遗漏？
4. Session secret key 是否硬编码？`SECRET_KEY` 来源是否安全？
5. `@csrf_exempt` 是否用于敏感操作的视图？
6. 是否存在开发/调试的认证绕过逻辑残留？（如 `if DEBUG: return True`）

**易漏场景**:
- Django CBV 忘记添加 `LoginRequiredMixin`，而 FBV 有 `@login_required`
- Flask `before_request` 认证钩子中 `endpoint` 白名单过宽
- `PyJWT` 旧版本 `jwt.decode()` 默认不验证签名

**判定规则**:
- `jwt.decode()` 未指定 `algorithms` 或含 `"none"` = **Critical (CVSS 9.1)**
- 硬编码 `SECRET_KEY` = **High**
- 敏感视图缺少 `@login_required` / `LoginRequiredMixin` = **High**
- `@csrf_exempt` 用于状态变更操作 = **Medium**

## D3: 授权

**关键问题**:
1. 资源操作是否验证用户归属？`Model.objects.get(id=id)` vs `Model.objects.get(id=id, user=request.user)`？
2. Django `has_perm()` / DRF `permission_classes` 是否覆盖所有 ViewSet action？`destroy`/`update` 是否缺少？
3. Flask 视图是否有独立的权限检查逻辑？还是仅依赖前端？
4. 列表接口有用户过滤，但详情/删除/导出接口是否直接用 ID 查询无过滤？
5. 管理员接口（如 Django admin 自定义视图）是否有角色校验？

**易漏场景**:
- DRF ViewSet 的 `list` 有过滤，但 `retrieve` / `destroy` 直接 `get_object()` 无归属校验
- 文件下载视图仅检查登录，不检查文件归属
- 批量操作接口未逐一校验每个 ID 的归属

**判定规则**:
- `Model.objects.get(id=id)` 无用户归属 + 敏感操作 = **High (IDOR)**
- ViewSet CRUD 中部分 action 缺少权限检查 = **High (授权不一致)**
- 管理员视图无角色验证 = **Critical (垂直越权)**

## D4: 反序列化

**关键问题**:
1. `pickle.load()` / `pickle.loads()` 的数据来源是否可信？是否来自用户上传、网络请求、Redis、数据库？
2. `yaml.load()` 是否使用 `SafeLoader`？（默认 `Loader=FullLoader` 在旧版本可 RCE）
3. `shelve.open()` / `marshal.loads()` 是否处理不可信数据？
4. `jsonpickle.decode()` 是否接收外部输入？
5. Celery / RQ 等任务队列的序列化格式是否为 pickle？消息来源是否可信？

**易漏场景**:
- 缓存框架（Django cache / Redis）使用 pickle 序列化，攻击者可控缓存 key 对应的值
- 机器学习模型文件 `.pkl` 从用户上传加载
- `yaml.load(data)` 无 Loader 参数（Python 3.9+ 默认 FullLoader，仍可构造攻击）

**判定规则**:
- `pickle.loads()` + 不可信数据源 = **Critical (RCE)**
- `yaml.load()` 无 `Loader=SafeLoader` + 不可信输入 = **Critical (RCE)**
- `jsonpickle.decode()` + 用户输入 = **Critical (RCE)**
- Celery `CELERY_TASK_SERIALIZER = 'pickle'` + 消息队列暴露 = **Critical**

## D5: 文件操作

**关键问题**:
1. 文件上传：是否校验扩展名和 MIME 类型？是否使用原始文件名存储（`secure_filename()` 未使用）？
2. `open(path)` / `send_file(path)` / `FileResponse(path)` 中 path 是否拼接用户输入？是否过滤 `../`？
3. `zipfile.ZipFile.extractall()` 是否校验压缩条目路径？（Zip Slip）
4. `tempfile` 使用是否安全？临时文件权限是否过宽？
5. `shutil.rmtree()` / `os.remove()` 的路径是否可由用户控制？

**易漏场景**:
- Flask `send_from_directory()` 的 `filename` 参数来自用户且未清理
- Django `FileField` 存储路径拼接用户输入
- `os.path.join("/base", user_input)` 当 `user_input` 以 `/` 开头时绕过基础路径

**判定规则**:
- 路径拼接 + 无 `../` 过滤 = **Critical (任意文件读写)**
- `os.path.join(base, user_input)` + `user_input` 可为绝对路径 = **High (路径遍历)**
- 文件上传无扩展名校验 + Web 可达存储目录 = **High**
- `extractall()` 无路径校验 = **High (Zip Slip)**

## D6: SSRF

**关键问题**:
1. `requests.get(url)` / `urllib.request.urlopen(url)` / `httpx` / `aiohttp` 的 URL 是否来自用户输入？
2. URL 校验是否仅检查 hostname 字符串？DNS rebinding 是否可绕过？
3. 是否限制协议？`file://`、`gopher://`、`dict://`？
4. `ImageIO` / `Pillow` 的 `Image.open(url)` 是否接受用户 URL？
5. Webhook / 回调 URL 是否用户可控？

**易漏场景**:
- URL 白名单基于 `urlparse().hostname` 但未处理 `http://evil.com@allowed.com`
- 仅校验 IP 不在 `127.0.0.0/8`，遗漏 `169.254.169.254`（云元数据）、`0.0.0.0`、IPv6 `::1`
- 内部微服务调用使用用户提供的服务名/端口

**判定规则**:
- URL 用户可控 + 无白名单 = **High (SSRF)**
- SSRF + 可访问云元数据 `169.254.169.254` = **Critical**
- `file://` 协议未禁止 = **High (本地文件读取)**

## D7: 加密

**关键问题**:
1. `SECRET_KEY` / AES 密钥是否硬编码在源码或配置文件中？
2. 密码存储是否使用 `bcrypt` / `argon2` / Django `make_password()`？还是 `hashlib.md5()` / `hashlib.sha1()`？
3. 随机数生成是否使用 `secrets` 模块？还是 `random.random()` / `random.randint()`？
4. PyCryptodome 是否使用 ECB 模式？IV 是否硬编码？

**判定规则**:
- 硬编码 `SECRET_KEY` = **High**
- `hashlib.md5(password)` 用于密码存储 = **Medium**
- `random.random()` 用于 Token/验证码 = **High (可预测)**
- AES-ECB 模式 = **Medium**

## D8: 配置

**关键问题**:
1. Django `DEBUG = True` 是否在生产配置中？
2. Flask `app.debug = True` 或 `FLASK_DEBUG=1`？（Werkzeug debugger 可 RCE）
3. CORS 是否为 `Access-Control-Allow-Origin: *` + `Allow-Credentials: true`？
4. Django `ALLOWED_HOSTS = ['*']`？
5. 异常处理是否向客户端暴露完整堆栈？`PROPAGATE_EXCEPTIONS = True`？
6. 配置文件（settings.py / .env）中是否有明文数据库密码、API Key？
7. 日志中是否打印 password/token/secret？

**判定规则**:
- Flask `debug=True` 生产环境 = **Critical (Werkzeug RCE)**
- Django `DEBUG=True` 生产环境 = **High (信息泄露)**
- CORS `*` + credentials = **High**
- 明文密码在 settings.py = **Medium**（需评估暴露范围）

## D9: 业务逻辑

**关键问题**:
1. 金额/数量是否在服务端验证？客户端参数是否可篡改？
2. 并发操作是否有原子性保证？Django `select_for_update()` / 数据库锁？
3. 多步流程是否可跳过步骤？（如跳过支付直接确认）
4. Mass Assignment: Django `ModelForm` 是否定义了 `fields` 白名单？DRF Serializer 是否用 `fields = '__all__'`？
5. 验证码/短信码是否有速率限制？是否有过期机制？
6. SSTI: `render_template_string(user_input)` 或 `Template(user_input).render()` 是否存在？

**易漏场景**:
- DRF Serializer `fields = '__all__'` 或 `exclude` 遗漏 `is_admin`/`role` 字段
- Jinja2 `render_template_string()` 接收用户输入 → SSTI → RCE
- Django `ModelForm` 未指定 `fields`，使用 `__all__`

**判定规则**:
- `render_template_string(user_input)` = **Critical (SSTI → RCE)**
- `fields = '__all__'` + 模型含权限字段 = **High (Mass Assignment)**
- 无锁的余额扣减 = **High (竞态条件)**
- 金额来自客户端 + 服务端未重新计算 = **Critical (支付绕过)**

## D10: 供应链

**依赖组件速查** (仅 requirements.txt / Pipfile / pyproject.toml 中存在时检查):

| 依赖 | 危险版本 | 漏洞类型 | 检查要点 |
|------|---------|---------|---------|
| PyYAML | < 6.0 | RCE | `yaml.load()` 无 SafeLoader |
| Jinja2 | < 2.11.3 | SSTI/沙箱逃逸 | 沙箱绕过 payload |
| Django | < 4.2 | 多种 | SQL 注入、XSS、CSRF bypass |
| Flask | < 2.3.0 | 信息泄露 | debugger PIN 可预测 |
| Pillow | < 9.3.0 | RCE | 图片处理缓冲区溢出 |
| paramiko | < 2.10.1 | 认证绕过 | CVE-2023-48795 (Terrapin) |
| requests | < 2.31.0 | 信息泄露 | 跨域重定向泄露 Auth header |
| cryptography | < 41.0 | 多种 | OpenSSL 底层漏洞 |
| celery | 全版本 | RCE | pickle 序列化 + 消息队列暴露 |
| numpy | < 1.22 | RCE | `numpy.load(allow_pickle=True)` |

**判定规则**:
- 危险版本 + 项目中实际使用了危险 API = **按对应 CVE 评级**
- 危险版本 + 项目未使用危险 API = **Medium (潜在风险)**
