# Ruby/Rails 安全审计语义提示 (Semantic Hints)

> 本文件为覆盖率矩阵 (`coverage_matrix.md`) 的补充。
> **仅对未覆盖的维度按需加载对应 `## D{N}` 段落**，无需全量加载。
> LLM 自行决定搜索策略（Grep/Read/LSP/代码推理均可）。

## D1: 注入

**关键问题**:
1. ActiveRecord 是否有 `where("column = '#{params[:input]}'")` 字符串插值拼接 SQL？（安全: `where(column: value)` / `where("column = ?", value)`）
2. `find_by_sql` / `execute` / `select_all` 是否拼接用户输入？
3. ORDER BY / GROUP BY 是否直接接受用户参数？（无法参数化，需白名单）
4. `send` / `public_send` 是否以用户输入作为方法名？（方法注入 → 可调用任意公开方法）
5. ERB 模板: 是否存在 `ERB.new(user_input).result`？（模板注入 → RCE）
6. `eval` / `instance_eval` / `class_eval` / `module_eval` 是否接受外部输入？
7. 命令执行: `system` / `exec` / `` `backticks` `` / `%x{}` / `Open3.capture3` / `IO.popen` 是否拼接用户输入？
8. `constantize` / `safe_constantize`: 用户输入是否可控制类名实例化？

**易漏场景**:
- `where("name LIKE '%#{params[:q]}%'")` 看似无害但是 SQL 注入
- `order(params[:sort])` 直接传入 ORDER BY 子句
- `send(params[:action])` 允许调用任意方法
- `"User".constantize` 中字符串来自用户输入可实例化任意类
- Arel: `Arel.sql(user_input)` 绕过 Rails 的 SQL 安全检查

**判定规则**:
- `where("... #{params[...]} ...")` = **确认 SQL 注入 (Critical)**
- `send(user_input)` / `public_send(user_input)` = **确认方法注入 (Critical)**
- `ERB.new(user_input).result` = **确认 RCE (Critical)**
- `eval(user_input)` = **确认 RCE (Critical)**
- `system("cmd #{user_input}")` = **确认命令注入 (Critical)**
- `constantize` + 用户输入 = **High (对象注入)**

## D2: 认证

**关键问题**:
1. Devise / has_secure_password: 密码哈希算法和成本因子是否合理？（Devise 默认 bcrypt cost=12）
2. `authenticate_user!` (Devise) 或 `before_action :require_login` 是否应用到所有需要认证的 Controller？
3. Session: `session[:user_id]` 设置后是否有 `reset_session` 防止 Session Fixation？
4. Token 认证: API Token 是否以明文存储在数据库？是否使用 `has_secure_token` 或 `ActiveSupport::MessageVerifier`？
5. `skip_before_action :authenticate_user!` 是否在敏感 Controller/Action 上被滥用？
6. 密码重置 Token 是否有过期时间？是否一次性使用？

**易漏场景**:
- `skip_before_action :authenticate_user!, only: [:show]` 但 show 返回敏感数据
- Session 存储在 Cookie 中（Rails 默认），`secret_key_base` 泄露则可伪造 Session
- Devise `recoverable` 模块密码重置 Token 默认 6 小时过期，部分项目改为过长
- Warden/Devise 回调链中自定义策略绕过标准认证

**判定规则**:
- 敏感接口缺少 `authenticate_user!` / `require_login` = **Critical (认证绕过)**
- `secret_key_base` 硬编码或在源码仓库中 = **Critical (Session 伪造)**
- Session Fixation: 登录后未 `reset_session` = **High**
- API Token 明文存储 = **Medium**

## D3: 授权

**关键问题**:
1. 资源操作是否验证归属？`Item.find(params[:id])` vs `current_user.items.find(params[:id])`？
2. Pundit / CanCanCan 是否在所有 Controller Action 中调用？是否有 `authorize` 遗漏？
3. Pundit `after_action :verify_authorized` 是否启用以检测遗漏的授权检查？
4. 管理员接口是否有独立的角色验证？是否仅靠前端隐藏菜单？
5. 批量操作: `Item.where(id: params[:ids]).update_all(...)` 是否验证所有 ID 的归属？

**易漏场景**:
- `Item.find(params[:id])` 在 show/edit/update/destroy 中无归属校验 (IDOR)
- CanCanCan `load_and_authorize_resource` 仅在部分 Action 上 `skip_load_and_authorize_resource`
- Pundit Policy 中 `update?` 返回 `true` 但应该检查归属
- 嵌套路由 `/users/:user_id/items/:id` 但 Controller 未验证 `user_id` 与 `current_user` 一致

**判定规则**:
- `Model.find(params[:id])` 无归属检查 + 敏感操作 = **High (IDOR)**
- 缺少 `verify_authorized` + Controller 无 `authorize` 调用 = **High (授权缺失)**
- 管理员接口无角色验证 = **Critical (垂直越权)**

## D4: 反序列化

**关键问题**:
1. `Marshal.load` / `Marshal.restore`: 数据来源是否可信？（Marshal 反序列化不可信数据 = 直接 RCE）
2. `YAML.load` vs `YAML.safe_load`: 是否使用了不安全的 `YAML.load`？（Ruby < 3.1 默认不安全）
3. `Psych.load` 是否使用 `permitted_classes` 白名单？
4. Rails 的 Cookie Session Store 中是否存储了 Marshal 序列化数据？`secret_key_base` 是否可靠？
5. `Oj.load` 的 `mode` 是否为 `:object`？（`:object` 模式允许任意对象实例化）
6. MessagePack / Protobuf 等二进制协议是否用于接收外部不可信数据？

**易漏场景**:
- `Marshal.load(Redis.get(key))` 中 Redis 数据被污染
- `YAML.load(File.read(user_uploaded_file))` 处理用户上传的 YAML 配置
- Rails < 7.0 默认 Cookie Session 使用 Marshal 序列化，`secret_key_base` 泄露 = RCE
- `Oj.load(json, mode: :object)` 在 API 端点接受外部 JSON

**判定规则**:
- `Marshal.load` + 不可信数据源 = **Critical (RCE)**
- `YAML.load` (Ruby < 3.1) + 不可信数据 = **Critical (RCE)**
- `YAML.safe_load` = 安全（仅允许基本类型）
- `secret_key_base` 泄露 + Cookie Session + Marshal = **Critical (RCE)**

## D5: 文件操作

**关键问题**:
1. 文件上传: CarrierWave / ActiveStorage / Paperclip 是否校验文件类型白名单？`content_type` 是否可伪造？
2. 文件读取: `File.read(params[:path])` / `send_file(params[:file])` 路径是否含用户输入？
3. 路径遍历: 用户输入是否经过 `File.expand_path` + `start_with?` 验证不超出基础目录？
4. 文件名: `original_filename` 是否直接用于存储？是否过滤 `../` 和空字节 `\0`？
5. Zip 解压: `Zip::File.open` 是否检查条目路径中的 `../`？（Zip Slip）

**易漏场景**:
- `send_file "#{Rails.root}/uploads/#{params[:filename]}"` 路径遍历
- CarrierWave `store_dir` 基于用户输入构建目录路径
- `File.expand_path` 未与基础目录对比即使用
- 空字节截断: `params[:file] + ".txt"` 在旧 Ruby 版本中 `%00` 截断扩展名

**判定规则**:
- `send_file(user_input)` / `File.read(user_input)` 无路径校验 = **Critical (任意文件读取)**
- `File.write(user_controlled_path, ...)` 无校验 = **Critical (任意文件写入)**
- 上传无扩展名白名单 + 可 Web 访问 = **High**
- Zip Slip 未校验 = **High**

## D6: SSRF

**关键问题**:
1. `Net::HTTP` / `RestClient` / `HTTParty` / `Faraday` / `open-uri` 的 URL 是否来自用户输入？
2. `URI.open(user_url)` (Ruby 3.0+ 的 `open-uri`) 是否有协议和目标限制？
3. Webhook 回调 URL 是否由用户配置？是否校验目标不为内网？
4. 图片处理: `image_url` 等远程资源获取是否校验 URL？
5. URL 校验是否考虑 DNS rebinding / `0x7f000001` / IPv6 `::1`？

**易漏场景**:
- `open(params[:url])` 在旧版 Ruby 中 `open` 可执行命令（以 `|` 开头）
- `HTTParty.get(params[:callback_url])` 无限制访问内网
- `Faraday.get(url)` 跟随 302 重定向到内网
- Webhook URL 验证仅在创建时校验，DNS rebinding 后实际指向内网

**判定规则**:
- `open(user_input)` (旧 Ruby) = **Critical (可能 RCE，`|command` 语法)**
- URL 用户可控 + 无白名单 = **High (SSRF)**
- SSRF + 可达云元数据 = **Critical**

## D7: 加密

**关键问题**:
1. 密码哈希是否使用 `BCrypt::Password` / `has_secure_password`？还是 `Digest::MD5` / `Digest::SHA1`？
2. `ActiveSupport::MessageEncryptor` 的密钥是否硬编码？
3. `OpenSSL::Cipher` 的 key/iv 是否硬编码？是否使用 ECB 模式？
4. 随机数: 安全场景是否使用 `SecureRandom`？还是 `rand` / `Random.new`？
5. `secret_key_base` 是否足够长且随机？是否在不同环境使用相同值？

**判定规则**:
- 硬编码 AES 密钥 / IV = **High（加密形同虚设）**
- `Digest::MD5` / `SHA1` 用于密码哈希 = **Medium**
- `rand` 用于安全场景（Token、验证码）= **High**
- `secret_key_base` 硬编码 = **Critical（可伪造 Session / 解密数据）**

## D8: 配置

**关键问题**:
1. CORS: `rack-cors` 配置是否 `origins '*'` + `credentials: true`？
2. CSRF: `skip_before_action :verify_authenticity_token` 是否在非 API Controller 上使用？
3. `config.force_ssl` 是否在生产环境启用？
4. `config.consider_all_requests_local` 是否在生产环境为 `true`？（泄露详细错误信息）
5. `config/credentials.yml.enc` 是否配套 `master.key`？`master.key` 是否被提交到源码仓库？
6. `config/secrets.yml` / `config/database.yml` 是否含明文密码并提交到仓库？
7. 日志中是否过滤了敏感参数？`config.filter_parameters` 是否包含 `:password`, `:token`, `:secret`？

**判定规则**:
- `origins '*'` + `credentials: true` = **High (CORS)**
- `verify_authenticity_token` 跳过 + 非 API = **High (CSRF)**
- `master.key` 在仓库中 = **Critical（可解密所有 credentials）**
- `consider_all_requests_local = true` 在生产 = **Medium（信息泄露）**

## D9: 业务逻辑

**关键问题**:
1. Mass Assignment: `params.permit!` 是否放行所有参数？Strong Parameters 白名单是否包含不应由用户控制的字段（如 `role`、`admin`）？
2. 金额/数量是否在服务端重新计算？
3. 并发: 数据库操作是否使用乐观锁 (`lock_version`) 或悲观锁 (`lock!`)？
4. 多步流程（如支付 → 确认 → 发货）是否可跳步？
5. 回调链: `before_save` / `after_create` 中是否有可被绕过的安全逻辑？（`update_columns` 跳过回调）
6. `accepts_nested_attributes_for` 是否允许用户通过嵌套参数修改关联模型的敏感字段？

**判定规则**:
- `params.permit!` = **High（Mass Assignment，可修改任意字段）**
- Strong Parameters 包含 `role` / `admin` / `is_admin` = **Critical（权限提升）**
- 金额来自客户端 + 未重新计算 = **Critical（支付绕过）**
- `update_columns` 绕过回调中的安全逻辑 = **High**

## D10: 供应链

**依赖组件速查** (仅 `Gemfile` / `Gemfile.lock` 中存在时检查):

| 依赖 | 危险版本 | 漏洞类型 | 检查要点 |
|------|---------|---------|---------|
| rails | < 7.0.8 / < 6.1.7.6 | 多种 | 检查具体 CVE |
| nokogiri | < 1.15.4 | XXE/RCE | libxml2 漏洞 |
| rack | < 3.0.8 / < 2.2.8 | DoS/信息泄露 | ReDoS / Header 注入 |
| devise | < 4.9.0 | 认证绕过 | 特定配置下认证绕过 |
| carrierwave | < 3.0.0 | SSRF/路径遍历 | 远程文件下载 + 路径校验 |
| puma | < 6.3.1 / < 5.6.7 | HTTP 走私 | 请求解析差异 |
| actionpack | < 对应 rails 版本 | XSS/CSRF | 视图渲染 / CSRF Token |
| activerecord | < 对应 rails 版本 | SQL 注入 | 特定查询方法绕过 |
| psych (YAML) | Ruby < 3.1 默认不安全 | RCE | `YAML.load` = `YAML.unsafe_load` |

**判定规则**:
- 危险版本 + 项目中实际使用了危险 API = **按对应 CVE 评级**
- 危险版本 + 项目未使用危险 API = **Medium（潜在风险）**
- Ruby 版本本身已终止支持 (EOL) = **Medium（无安全补丁）**
