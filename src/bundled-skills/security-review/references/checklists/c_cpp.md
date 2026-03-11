# C/C++ 安全审计语义提示 (Semantic Hints)

> 本文件为覆盖率矩阵 (`coverage_matrix.md`) 的补充。
> **仅对未覆盖的维度按需加载对应 `## D{N}` 段落**，无需全量加载。
> LLM 自行决定搜索策略（Grep/Read/LSP/代码推理均可）。

## D1: 注入

**关键问题**:
1. `system()` / `popen()` / `exec*()` 是否拼接用户输入？是否使用 `execvp` 参数数组替代字符串拼接？
2. `printf(user_input)` 是否将用户输入直接作为格式化字符串？（格式化字符串漏洞 → 信息泄露/任意写）
3. SQL (嵌入式 SQLite/MySQL C API): `sqlite3_exec()` / `mysql_query()` 是否拼接用户输入？是否用 `sqlite3_prepare_v2` + `sqlite3_bind_*` 参数化？
4. 环境变量注入: `getenv()` 返回值是否未校验直接用于路径/命令？
5. `dlopen()` / `LoadLibrary()` 的路径是否用户可控？（库注入）

**易漏场景**:
- `snprintf(cmd, sizeof(cmd), "grep %s file.txt", user_input)` 后 `system(cmd)` — 分号/管道注入
- `printf(buf)` 而非 `printf("%s", buf)` — `%n` 可写入任意内存
- `sqlite3_exec(db, sql, ...)` 中 `sql` 由 `sprintf` 拼接
- `setenv` / `putenv` 被用于设置 `LD_PRELOAD` 路径

**判定规则**:
- `system(user_controlled_string)` = **Critical (命令注入/RCE)**
- `printf(user_input)` 无固定格式串 = **Critical (格式化字符串漏洞)**
- `sqlite3_exec` + 字符串拼接 = **确认 SQL 注入 (Critical)**
- `dlopen(user_path)` = **Critical (库注入/RCE)**

## D2: 认证

**关键问题**:
1. 密码比较是否使用常量时间比较函数？（`memcmp` 存在时序侧信道，应使用 `CRYPTO_memcmp` / `timingsafe_bcmp`）
2. 自定义认证协议: Token/密码校验逻辑是否有短路返回导致时序攻击？
3. 硬编码密码/后门账户: 源码中是否有 `if (strcmp(password, "backdoor") == 0)` 类似逻辑？
4. 密码存储: 是否使用 `crypt()` / `bcrypt` / `argon2`？还是自行实现 MD5/SHA1？
5. 认证状态管理: Session Token 是否足够随机？是否用 `/dev/urandom` 或 `getrandom()`？

**易漏场景**:
- `strcmp(input_password, stored_password)` 可通过时序攻击逐字节猜测
- 嵌入式设备固件中硬编码默认密码
- `srand(time(NULL))` + `rand()` 生成 Session Token — 可预测
- 认证检查在 `#ifdef DEBUG` 宏内被条件编译跳过

**判定规则**:
- `strcmp` / `memcmp` 用于密码/Token 比较 = **Medium (时序攻击)**
- 硬编码密码/后门 = **Critical**
- `rand()` / `srand(time)` 用于安全 Token = **High (可预测)**

## D3: 授权

**关键问题**:
1. 权限检查是否在每次操作前执行？是否有 TOCTOU 间隙（检查权限→执行操作之间状态改变）？
2. `setuid` / `setgid` 程序: 是否在完成特权操作后立即降权？是否有权限泄露窗口？
3. 文件权限: `open()` / `creat()` 的 mode 是否过宽（如 `0777`）？`umask` 设置是否合理？
4. 共享内存 / IPC: `shmget` / `msgget` 权限是否过宽？是否允许非预期进程访问？
5. 能力(Capabilities): 是否申请了超出实际需要的 Linux Capabilities？

**易漏场景**:
- `access(path, R_OK)` 检查后 `open(path, ...)` — TOCTOU 竞态
- setuid 程序中 `system()` 继承 root 权限执行命令
- 临时文件 `open("/tmp/file", O_CREAT, 0666)` 权限过宽
- `chroot` 后未 `chdir("/")`，可通过 `../` 逃逸

**判定规则**:
- `access()` + `open()` 模式 = **High (TOCTOU)**
- setuid 程序调用 `system()` = **Critical (权限提升)**
- 临时文件 mode `0666` / `0777` = **Medium (权限过宽)**
- `chroot` 后无 `chdir("/")` = **High (chroot 逃逸)**

## D4: 内存安全

**关键问题**:
1. **缓冲区溢出**: `strcpy` / `strcat` / `sprintf` / `gets` / `scanf("%s")` 是否在使用？是否用 `strncpy` / `snprintf` / `fgets` 替代？替代函数的 `n` 参数是否正确？
2. **Use-After-Free**: `free(ptr)` 后 `ptr` 是否置 `NULL`？是否在其他代码路径继续使用？回调函数中引用的对象是否可能已释放？
3. **Double-Free**: 同一指针是否在不同错误处理路径中被多次 `free`？
4. **整数溢出**: `malloc(n * sizeof(T))` 中 `n` 是否可能溢出导致小分配？`size_t` 到 `int` 转换是否可能截断？
5. **堆栈溢出**: 递归是否有深度限制？`alloca()` / VLA 的大小是否用户可控？
6. **未初始化变量**: 栈变量是否在使用前初始化？`malloc` 返回的内存是否在读取前写入？（`calloc` 自动清零）
7. **Off-by-One**: 循环边界条件是否正确？`strncpy(dst, src, sizeof(dst))` 是否保证 NUL 终止？
8. **空指针解引用**: `malloc` / `realloc` 返回值是否检查 `NULL`？指针参数是否在解引用前校验？

**易漏场景**:
- `strncpy(dst, src, sizeof(dst))` 不保证 NUL 终止 — 后续 `strlen(dst)` 读越界
- `int len = strlen(input); char buf[len];` — `len` 为 `size_t`，超大值导致栈溢出
- `realloc` 返回 `NULL` 时原指针未释放造成内存泄漏，或 `realloc` 成功后旧指针变野指针
- `snprintf` 返回值 > buffer size 时截断，后续假设字符串完整导致逻辑错误
- C++ 中 `std::vector::operator[]` 无边界检查（`at()` 有）
- 异常安全: C++ 构造函数中 `new` 抛异常导致部分初始化对象泄漏

**判定规则**:
- `strcpy` / `gets` / `sprintf` = **High (缓冲区溢出)**
- `strncpy` 但未手动添加 NUL 终止 = **Medium (潜在越界读)**
- `free(ptr)` 后未置 NULL + 后续路径可达 = **Critical (Use-After-Free → RCE)**
- `malloc(n * m)` 无溢出检查 = **High (堆溢出)**
- `alloca(user_size)` = **High (栈溢出)**
- 递归无深度限制 + 输入可控递归深度 = **Medium (栈耗尽 DoS)**

## D5: 文件操作

**关键问题**:
1. 路径遍历: 用户输入是否经过 `realpath()` 验证且结果在预期目录下？
2. 符号链接: `open()` 是否使用 `O_NOFOLLOW`？临时文件创建是否用 `mkstemp()` 而非 `tmpnam()` / `tempnam()`？
3. 竞态条件: `stat()` + `open()` 之间是否有 TOCTOU？（应直接 `open` + `fstat`）
4. 临时文件: 是否在 `/tmp` 中使用可预测文件名？是否用 `mkstemp` / `mkdtemp`？
5. 文件描述符泄漏: `open()` 后是否在所有错误路径都有 `close()`？`fork` 后子进程是否继承了不必要的 fd？

**易漏场景**:
- `snprintf(path, sizeof(path), "/data/%s", user_filename)` 中 `user_filename = "../../etc/passwd"`
- `tmpnam(NULL)` 返回的文件名可预测，攻击者可预先创建同名符号链接
- `open(path, O_CREAT|O_WRONLY, 0666)` 跟随符号链接写入任意文件
- `fork` + `exec` 未设置 `O_CLOEXEC`，子进程继承敏感 fd

**判定规则**:
- 路径拼接用户输入 + 无 `realpath` 校验 = **Critical (任意文件读写)**
- `tmpnam` / `tempnam` = **Medium (可预测临时文件名)**
- `mkstemp` = 安全（原子创建 + 不可预测）
- 无 `O_NOFOLLOW` + 用户可控路径 = **High (符号链接攻击)**

## D6: 网络安全

**关键问题**:
1. 网络输入解析: 协议解析器是否正确处理恶意/畸形数据？长度字段是否在分配前校验？
2. TLS: 是否禁用了证书验证？`SSL_CTX_set_verify` 是否设为 `SSL_VERIFY_PEER`？
3. DNS: `gethostbyname` 返回值是否直接信任？是否有 DNS rebinding 防护？
4. 套接字: `recv()` 返回值是否检查？部分读取是否正确处理？
5. 序列化: 自定义二进制协议解析是否有长度/边界检查？

**易漏场景**:
- `recv(sock, buf, sizeof(buf), 0)` 假设一次 `recv` 返回完整消息
- 协议解析: `length = ntohs(*(uint16_t*)buf); malloc(length); recv(sock, data, length, 0)` — 未检查 length 合理性
- `SSL_CTX_set_verify(ctx, SSL_VERIFY_NONE, NULL)` 禁用证书验证
- `getaddrinfo` 返回多个地址时仅使用第一个，未检查是否为内网地址

**判定规则**:
- 禁用 TLS 证书验证 = **High (中间人攻击)**
- 网络数据长度字段直接用于 `malloc` 无上限检查 = **High (DoS/堆溢出)**
- 自定义协议解析无边界检查 = **High (内存损坏)**

## D7: 加密

**关键问题**:
1. 是否使用 `DES` / `RC4` / `MD5` / `SHA1` 用于安全目的？（应使用 AES-256 / SHA-256+）
2. AES 密钥/IV 是否硬编码？是否使用 ECB 模式？
3. 随机数: 是否使用 `rand()` / `srand(time(NULL))` 而非 `/dev/urandom` / `getrandom()` / `RAND_bytes()`？
4. 自定义加密算法: 是否有自行实现的加密/哈希？（几乎必定不安全）
5. 密码存储: 是否使用 `crypt()` (DES-based) 而非 `crypt_r()` with `$2b$` (bcrypt)？
6. 密钥/敏感数据是否在使用后通过 `explicit_bzero()` / `OPENSSL_cleanse()` 清零？（`memset` 可能被编译器优化掉）

**判定规则**:
- 硬编码密钥/IV = **High（加密形同虚设）**
- `rand()` / `srand()` 用于安全场景 = **High (可预测)**
- `DES` / `RC4` = **Medium（弱加密算法）**
- 自定义加密算法 = **High（几乎必定可破解）**
- `memset` 清零密钥（非 `explicit_bzero`）= **Low（可能被优化掉）**

## D8: 配置与编译

**关键问题**:
1. 编译选项: 是否启用 `-fstack-protector-strong` / `-D_FORTIFY_SOURCE=2` / `-fPIE -pie` / `-Wl,-z,relro,-z,now`？
2. ASLR: 可执行文件是否为 PIE (Position Independent Executable)？共享库是否为 PIC？
3. 是否启用 `-Wall -Wextra -Werror`？是否处理了所有编译器警告？
4. 调试信息: 生产构建是否包含 `-g`？是否有 `assert` / `#ifdef DEBUG` 残留？
5. `#define` 中是否有硬编码凭据、密钥、后门开关？
6. 敏感信息（密码、密钥）是否出现在命令行参数中？（`/proc/PID/cmdline` 可读）
7. 信号处理: 信号处理函数中是否调用了非异步信号安全函数（如 `malloc`、`printf`）？

**判定规则**:
- 无 Stack Protector + 无 ASLR/PIE = **High（利用难度大幅降低）**
- `FORTIFY_SOURCE` 未启用 = **Medium（缓冲区溢出检测缺失）**
- 硬编码凭据在 `#define` 中 = **Critical**
- 信号处理函数调用 `malloc`/`printf` = **Medium（信号处理竞态）**
