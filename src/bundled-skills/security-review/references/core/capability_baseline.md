# 代码审计技能 - 能力基准测试框架

> 版本: 1.0.0
> 目的: 防止技能更新导致检测能力丢失
> 机制: 类似软件回归测试，每次更新后验证所有能力项

---

## 1. 能力矩阵 (Capability Matrix)

### 1.1 PHP 漏洞检测能力清单

每次审计PHP项目时，**必须检查以下所有项目**（无一遗漏）:

| ID | 漏洞类型 | 检测模式 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| PHP-001 | **动态包含RCE** | `include/require $var` | `grep -rn "include\s*\\$\|require\s*\\$" --include="*.php"` | ☐ |
| PHP-002 | **eval代码执行** | `eval($user_input)` | `grep -rn "eval\s*(" --include="*.php"` | ☐ |
| PHP-003 | **反序列化** | `unserialize($data)` | `grep -rn "unserialize\s*(" --include="*.php"` | ☐ |
| PHP-004 | **SQL注入** | 字符串拼接SQL | `grep -rn "->query\|->exec\|mysql_query" --include="*.php"` | ☐ |
| PHP-005 | **命令注入** | `exec/system/passthru` | `grep -rn "exec\|system\|passthru\|shell_exec\|popen" --include="*.php"` | ☐ |
| PHP-006 | **文件上传** | 扩展名/类型验证 | `grep -rn "move_uploaded_file\|\\$_FILES" --include="*.php"` | ☐ |
| PHP-007 | **XXE** | XML解析无防护 | `grep -rn "simplexml_load\|DOMDocument\|XMLReader" --include="*.php"` | ☐ |
| PHP-008 | **SSRF** | curl/file_get_contents | `grep -rn "curl_exec\|file_get_contents.*http\|fsockopen" --include="*.php"` | ☐ |
| PHP-009 | **路径遍历** | 文件操作无过滤 | `grep -rn "file_get_contents\|fopen\|include.*\\$\|readfile" --include="*.php"` | ☐ |
| PHP-010 | **XSS** | 输出无转义 | `grep -rn "echo\s*\\$\|print\s*\\$" --include="*.php"` | ☐ |
| PHP-011 | **CSRF** | 表单无token | 检查form是否有csrf_token | ☐ |
| PHP-012 | **授权绕过** | 敏感操作无权限检查 | 对比CRUD方法的权限检查 | ☐ |
| PHP-013 | **会话固定** | session_regenerate_id | `grep -rn "session_start\|session_regenerate" --include="*.php"` | ☐ |
| PHP-014 | **密码存储** | 明文/弱哈希 | `grep -rn "md5\|sha1\|password" --include="*.php"` | ☐ |
| PHP-015 | **信息泄露** | 错误信息/调试信息 | `grep -rn "var_dump\|print_r\|debug" --include="*.php"` | ☐ |
| PHP-016 | **间接SSRF(配置驱动)** | 用户输入→配置→URL | `grep -rn "sprintf.*\$this->.*base\|rtrim.*\$.*createLink" --include="*.php"` | ☐ |
| PHP-017 | **ZIP Slip** | 解压路径遍历 | `grep -rn "ZipArchive::extractTo\|extractPackage\|unzip" --include="*.php"` | ☐ |
| PHP-018 | **Phar反序列化** | phar://协议 | `grep -rn "phar://\|Phar::\|file_exists.*phar\|is_file.*phar" --include="*.php"` | ☐ |
| PHP-019 | **POP Chain框架** | 框架Gadget | `grep -rn "__destruct\|__wakeup\|__toString\|__call" --include="*.php"` | ☐ |

### 1.2 Java 漏洞检测能力清单

| ID | 漏洞类型 | 检测模式 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| JAVA-001 | **反序列化** | ObjectInputStream | `grep -rn "ObjectInputStream\|readObject" --include="*.java"` | ☐ |
| JAVA-002 | **XXE** | DocumentBuilderFactory | `grep -rn "DocumentBuilderFactory\|SAXParser\|XMLReader" --include="*.java"` | ☐ |
| JAVA-003 | **SQL注入** | 字符串拼接 | `grep -rn "createQuery\|executeQuery.*+" --include="*.java"` | ☐ |
| JAVA-004 | **命令注入** | Runtime.exec | `grep -rn "Runtime.*exec\|ProcessBuilder" --include="*.java"` | ☐ |
| JAVA-005 | **SSRF** | URL/HttpClient | `grep -rn "new URL\|HttpClient\|RestTemplate" --include="*.java"` | ☐ |
| JAVA-006 | **路径遍历** | File操作 | `grep -rn "new File\|FileInputStream" --include="*.java"` | ☐ |
| JAVA-007 | **表达式注入** | OGNL/SpEL/EL | `grep -rn "OgnlUtil\|SpelExpression\|ELProcessor" --include="*.java"` | ☐ |
| JAVA-008 | **LDAP注入** | DirContext | `grep -rn "DirContext\|LdapContext" --include="*.java"` | ☐ |
| JAVA-009 | **Log4j** | 日志注入 | `grep -rn "log\.\|Logger\." --include="*.java"` | ☐ |
| JAVA-010 | **授权绕过** | 注解/Filter检查 | `grep -rn "@PreAuthorize\|@Secured\|hasRole" --include="*.java"` | ☐ |
| JAVA-011 | **JNDI注入** | InitialContext.lookup | `grep -rn "\.lookup\s*(\|InitialContext\|JdbcRowSetImpl" --include="*.java"` | ☐ |
| JAVA-012 | **JDBC协议注入** | 数据源URL协议 | `grep -rn "jdbc:\|dataSourceName\|JdbcRowSet" --include="*.java"` | ☐ |
| JAVA-013 | **协议黑名单绕过** | iiop/corbaname/dns | `grep -rn "iiop://\|corbaname:\|iiopname:\|corbaloc:\|dns://" --include="*.java"` | ☐ |
| JAVA-014 | **数据源配置安全** | illegalParameters检查 | `grep -rn "illegalParameters\|getIllegal.*Parameters\|blacklist" --include="*.java"` | ☐ |
| JAVA-015 | **JWT签名验证绕过** | JWT.decode无verify | `grep -rn "JWT.decode\|JWTVerifier\|jwt.verify" --include="*.java"` | ☐ |
| JAVA-016 | **硬编码密钥** | AES/DES密钥硬编码 | `grep -rn "AES\|DES\|SecretKey\|getBytes.*UTF" --include="*.java"` | ☐ |
| JAVA-017 | **弱默认密码** | 配置文件弱密码 | `grep -rn "password.*123456\|password.*admin" --include="*.yml" --include="*.properties"` | ☐ |
| JAVA-018 | **SSH隧道配置** | SSH隧道安全 | `grep -rn "useSSH\|sshHost\|sshPassword\|JSch" --include="*.java"` | ☐ |
| JAVA-019 | **Fastjson版本** | < 1.2.83高危 | `grep -rn "fastjson.*version" pom.xml build.gradle` | ☐ |
| JAVA-020 | **Fastjson @type** | AutoType反序列化 | `grep -rn "JSON\.parse\|@type\|setAutoTypeSupport" --include="*.java"` | ☐ |
| JAVA-021 | **Commons-Collections** | Gadget依赖 | `grep -rn "commons-collections.*version" pom.xml` | ☐ |
| JAVA-022 | **Text4Shell** | CVE-2022-42889 | `grep -rn "StringSubstitutor\|createInterpolator" --include="*.java"` | ☐ |
| JAVA-023 | **SnakeYAML RCE** | CVE-2022-1471 | `grep -rn "new Yaml()\|yaml\.load" --include="*.java"` | ☐ |
| JAVA-024 | **GroovyShell** | 代码执行 | `grep -rn "GroovyShell\|GroovyScriptEngine\|\.evaluate" --include="*.java"` | ☐ |
| JAVA-025 | **Nashorn脚本** | 脚本引擎RCE | `grep -rn "ScriptEngineManager\|getEngineByName\|nashorn" --include="*.java"` | ☐ |

### 1.3 Python 漏洞检测能力清单

每次审计Python项目时，**必须检查以下所有项目**:

| ID | 漏洞类型 | 检测模式 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| PY-001 | **Pickle反序列化** | `pickle.load/loads` | `grep -rn "pickle\.load\|pickle\.loads\|cPickle" --include="*.py"` | ☐ |
| PY-002 | **PyYAML不安全加载** | `yaml.load(Loader=...)` | `grep -rn "yaml\.load\|yaml\.unsafe_load" --include="*.py"` | ☐ |
| PY-003 | **eval/exec代码执行** | `eval()/exec()` | `grep -rn "eval\s*(\|exec\s*(" --include="*.py"` | ☐ |
| PY-004 | **命令注入** | `os.system/subprocess` | `grep -rn "os\.system\|subprocess\.\|os\.popen" --include="*.py"` | ☐ |
| PY-005 | **SQL注入** | 字符串拼接SQL | `grep -rn "execute\|cursor\.\|\.raw(" --include="*.py"` | ☐ |
| PY-006 | **SSTI模板注入** | `render_template_string` | `grep -rn "render_template_string\|Template\|Jinja2" --include="*.py"` | ☐ |
| PY-007 | **路径遍历** | 文件操作无过滤 | `grep -rn "open\s*(\|os\.path\.join" --include="*.py"` | ☐ |
| PY-008 | **SSRF** | requests/urllib | `grep -rn "requests\.\|urllib\.\|httpx\." --include="*.py"` | ☐ |
| PY-009 | **XXE** | XML解析 | `grep -rn "xml\.etree\|lxml\.\|defusedxml" --include="*.py"` | ☐ |
| PY-010 | **DEBUG模式** | Flask/Django DEBUG | `grep -rn "DEBUG\s*=\s*True\|app\.run.*debug" --include="*.py"` | ☐ |
| PY-011 | **SECRET_KEY泄露** | 硬编码密钥 | `grep -rn "SECRET_KEY\|secret_key" --include="*.py"` | ☐ |
| PY-012 | **不安全的反序列化** | marshal/shelve | `grep -rn "marshal\.load\|shelve\.open" --include="*.py"` | ☐ |
| PY-013 | **jsonpickle** | JSON反序列化RCE | `grep -rn "jsonpickle\.decode\|jsonpickle\.loads" --include="*.py"` | ☐ |
| PY-014 | **dill反序列化** | 增强pickle | `grep -rn "dill\.load\|dill\.loads" --include="*.py"` | ☐ |

### 1.4 Go 漏洞检测能力清单

每次审计Go项目时，**必须检查以下所有项目**:

| ID | 漏洞类型 | 检测模式 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| GO-001 | **SQL注入** | 字符串拼接SQL | `grep -rn "fmt\.Sprintf.*SELECT\|Exec\|Query" --include="*.go"` | ☐ |
| GO-002 | **命令注入** | exec.Command | `grep -rn "exec\.Command\|os\.StartProcess" --include="*.go"` | ☐ |
| GO-003 | **路径遍历** | 文件操作 | `grep -rn "os\.Open\|ioutil\.ReadFile\|filepath\.Join" --include="*.go"` | ☐ |
| GO-004 | **SSRF** | http.Get/Client | `grep -rn "http\.Get\|http\.Post\|http\.NewRequest" --include="*.go"` | ☐ |
| GO-005 | **竞态条件** | goroutine数据竞争 | `grep -rn "go\s\+func\|sync\.Mutex\|atomic\." --include="*.go"` | ☐ |
| GO-006 | **不安全的TLS** | 证书验证跳过 | `grep -rn "InsecureSkipVerify\|tls\.Config" --include="*.go"` | ☐ |
| GO-007 | **unsafe包** | 内存不安全操作 | `grep -rn "unsafe\.\|reflect\.SliceHeader" --include="*.go"` | ☐ |
| GO-008 | **模板注入** | html/template | `grep -rn "template\.HTML\|template\.JS\|template\.URL" --include="*.go"` | ☐ |
| GO-009 | **JSON/XML解析** | 不安全反序列化 | `grep -rn "json\.Unmarshal\|xml\.Unmarshal" --include="*.go"` | ☐ |
| GO-010 | **CORS配置** | 过宽的跨域设置 | `grep -rn "Access-Control-Allow-Origin\|AllowAllOrigins" --include="*.go"` | ☐ |
| GO-011 | **Channel竞态** | goroutine数据竞争 | `grep -rn "go\s\+func\|<-\s*chan" --include="*.go"` + `go build -race` | ☐ |
| GO-012 | **cgo边界** | FFI内存安全 | `grep -rn "import \"C\"\|C\.\|cgo" --include="*.go"` | ☐ |

### 1.5 JavaScript/Node.js 漏洞检测能力清单

每次审计JavaScript/Node.js项目时，**必须检查以下所有项目**:

| ID | 漏洞类型 | 检测模式 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| JS-001 | **原型污染** | `__proto__/prototype` | `grep -rn "__proto__\|prototype\[" --include="*.js" --include="*.ts"` | ☐ |
| JS-002 | **eval代码执行** | `eval/Function` | `grep -rn "eval\s*(\|new Function\|setTimeout.*string" --include="*.js"` | ☐ |
| JS-003 | **命令注入** | child_process | `grep -rn "child_process\|exec\|spawn\|execSync" --include="*.js"` | ☐ |
| JS-004 | **SQL注入** | 字符串拼接SQL | `grep -rn "\.query\|\.execute\|sequelize\." --include="*.js"` | ☐ |
| JS-005 | **XSS** | innerHTML/dangerously | `grep -rn "innerHTML\|dangerouslySetInnerHTML\|v-html" --include="*.js" --include="*.jsx" --include="*.vue"` | ☐ |
| JS-006 | **路径遍历** | fs模块 | `grep -rn "fs\.readFile\|fs\.writeFile\|path\.join" --include="*.js"` | ☐ |
| JS-007 | **SSRF** | axios/fetch/request | `grep -rn "axios\.\|fetch\s*(\|request\s*(" --include="*.js"` | ☐ |
| JS-008 | **不安全的反序列化** | node-serialize/serialize-js | `grep -rn "unserialize\|serialize\|JSON\.parse" --include="*.js"` | ☐ |
| JS-009 | **SSTI模板注入** | ejs/pug/handlebars | `grep -rn "\.render\|ejs\.\|pug\.\|handlebars\." --include="*.js"` | ☐ |
| JS-010 | **JWT不安全配置** | alg=none/弱密钥 | `grep -rn "jsonwebtoken\|jwt\.\|algorithms.*none" --include="*.js"` | ☐ |
| JS-011 | **正则DoS** | 危险正则 | `grep -rn "new RegExp\|\.match\|\.replace" --include="*.js"` | ☐ |
| JS-012 | **依赖投毒** | postinstall脚本 | 检查package.json scripts字段 | ☐ |

### 1.6 通用检测能力清单

| ID | 漏洞类型 | 适用语言 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| GEN-001 | **硬编码密钥** | ALL | `grep -rn "password\|secret\|api_key\|token" --include="*.php" --include="*.java" --include="*.py" --include="*.js" --include="*.go"` | ☐ |
| GEN-002 | **不安全的随机数** | ALL | `grep -rn "rand\|random\|Math.random"` | ☐ |
| GEN-003 | **弱加密算法** | ALL | `grep -rn "DES\|MD5\|SHA1\|RC4"` | ☐ |
| GEN-004 | **不安全的TLS** | ALL | `grep -rn "SSLv3\|TLSv1.0\|VERIFY_NONE\|verify=False\|InsecureSkipVerify"` | ☐ |
| GEN-005 | **依赖漏洞** | ALL | 检查CVE数据库 (npm audit / pip-audit / go mod verify) | ☐ |

### 1.7 C/C++ 漏洞检测能力清单

每次审计C/C++项目时，**必须检查以下所有项目**:

| ID | 漏洞类型 | 检测模式 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| C-001 | **缓冲区溢出** | strcpy/sprintf/gets | `grep -rn "strcpy\|sprintf\|gets\|strcat" --include="*.c" --include="*.cpp"` | ☐ |
| C-002 | **格式化字符串** | printf(user) | `grep -rn "printf\s*(\s*[^\"]\|fprintf\s*(\s*[^,]*,\s*[^\"]" --include="*.c" --include="*.cpp"` | ☐ |
| C-003 | **命令注入** | system/popen/exec | `grep -rn "system\|popen\|exec[lv]p\?" --include="*.c" --include="*.cpp"` | ☐ |
| C-004 | **整数溢出** | malloc乘法 | `grep -rn "malloc\s*(.*\*\|calloc" --include="*.c" --include="*.cpp"` | ☐ |
| C-005 | **Use-After-Free** | free后使用 | `grep -rn "free\s*(" --include="*.c" --include="*.cpp"` (需数据流分析) | ☐ |
| C-006 | **Double-Free** | 重复释放 | `grep -rn "free\s*(" --include="*.c" --include="*.cpp"` (需数据流分析) | ☐ |
| C-007 | **路径遍历** | fopen用户路径 | `grep -rn "fopen\|open\s*(" --include="*.c" --include="*.cpp"` | ☐ |
| C-008 | **符号链接攻击** | TOCTOU | `grep -rn "access\|stat.*open\|lstat" --include="*.c" --include="*.cpp"` | ☐ |
| C-009 | **不安全临时文件** | tmpnam/tempnam | `grep -rn "tmpnam\|tempnam\|mktemp[^s]" --include="*.c" --include="*.cpp"` | ☐ |
| C-010 | **memcpy长度** | 长度未验证 | `grep -rn "memcpy\|memmove\|memset" --include="*.c" --include="*.cpp"` | ☐ |
| C-011 | **动态库加载** | dlopen用户路径 | `grep -rn "dlopen\|LoadLibrary" --include="*.c" --include="*.cpp"` | ☐ |
| C-012 | **未初始化变量** | 栈变量 | 编译器警告 `-Wuninitialized` | ☐ |

### 1.8 .NET/C# 漏洞检测能力清单

每次审计.NET项目时，**必须检查以下所有项目**:

| ID | 漏洞类型 | 检测模式 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| NET-001 | **反序列化** | BinaryFormatter | `grep -rn "BinaryFormatter\|ObjectStateFormatter\|SoapFormatter" --include="*.cs"` | ☐ |
| NET-002 | **TypeNameHandling** | JSON.NET不安全 | `grep -rn "TypeNameHandling\|JsonSerializerSettings" --include="*.cs"` | ☐ |
| NET-003 | **SQL注入** | SqlCommand拼接 | `grep -rn "SqlCommand\|ExecuteSql\|FromSqlRaw" --include="*.cs"` | ☐ |
| NET-004 | **命令执行** | Process.Start | `grep -rn "Process\.Start\|ProcessStartInfo" --include="*.cs"` | ☐ |
| NET-005 | **SSRF** | HttpClient | `grep -rn "HttpClient\|WebClient\|GetAsync\|PostAsync" --include="*.cs"` | ☐ |
| NET-006 | **路径遍历** | File操作 | `grep -rn "File\.Open\|File\.Read\|FileStream\|Path\.Combine" --include="*.cs"` | ☐ |
| NET-007 | **XXE** | XmlDocument | `grep -rn "XmlDocument\|XmlReader\|XmlTextReader" --include="*.cs"` | ☐ |
| NET-008 | **LDAP注入** | DirectorySearcher | `grep -rn "DirectorySearcher\|DirectoryEntry" --include="*.cs"` | ☐ |
| NET-009 | **ViewState反序列化** | EnableViewStateMac | `grep -rn "ViewState\|EnableViewStateMac\|machineKey" --include="*.cs" --include="*.config"` | ☐ |
| NET-010 | **授权绕过** | [Authorize]缺失 | `grep -rn "\[HttpPost\]\|\[HttpDelete\]" --include="*.cs"` 对比 `\[Authorize\]` | ☐ |
| NET-011 | **XSS** | Html.Raw | `grep -rn "Html\.Raw\|@Html\.Raw" --include="*.cshtml"` | ☐ |
| NET-012 | **LINQ注入** | 动态LINQ | `grep -rn "DynamicLinq\|System\.Linq\.Dynamic" --include="*.cs"` | ☐ |
| NET-013 | **正则DoS** | Regex超时 | `grep -rn "new Regex\|Regex\.Match" --include="*.cs"` | ☐ |
| NET-014 | **硬编码凭据** | appsettings | `grep -rn "Password\|ConnectionString\|Secret" --include="appsettings*.json"` | ☐ |
| NET-015 | **CORS配置** | AllowAnyOrigin | `grep -rn "AllowAnyOrigin\|WithOrigins\|EnableCors" --include="*.cs"` | ☐ |
| NET-016 | **JWT配置** | ValidateIssuer | `grep -rn "TokenValidationParameters\|ValidateIssuer\|ValidateAudience" --include="*.cs"` | ☐ |

### 1.9 Ruby/Rails 漏洞检测能力清单

每次审计Ruby项目时，**必须检查以下所有项目**:

| ID | 漏洞类型 | 检测模式 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| RB-001 | **Marshal反序列化** | Marshal.load | `grep -rn "Marshal\.load\|Marshal\.restore" --include="*.rb"` | ☐ |
| RB-002 | **YAML反序列化** | YAML.load | `grep -rn "YAML\.load[^_]\|Psych\.load[^_]" --include="*.rb"` | ☐ |
| RB-003 | **SQL注入** | where字符串 | `grep -rn "where\s*(\s*\"\|find_by_sql\|execute\s*(" --include="*.rb"` | ☐ |
| RB-004 | **命令注入** | system/exec | `grep -rn "system\s*(\|exec\s*(\|spawn\s*(\|\`" --include="*.rb"` | ☐ |
| RB-005 | **代码执行** | eval/instance_eval | `grep -rn "eval\s*(\|instance_eval\|class_eval\|module_eval" --include="*.rb"` | ☐ |
| RB-006 | **ERB注入** | render用户输入 | `grep -rn "render.*inline\|ERB\.new" --include="*.rb"` | ☐ |
| RB-007 | **send动态调用** | send(用户输入) | `grep -rn "\.send\s*(\|\.public_send\s*(" --include="*.rb"` | ☐ |
| RB-008 | **constantize** | 动态类加载 | `grep -rn "constantize\|const_get" --include="*.rb"` | ☐ |
| RB-009 | **路径遍历** | send_file | `grep -rn "send_file\|File\.read\|File\.open" --include="*.rb"` | ☐ |
| RB-010 | **SSRF** | HTTParty/Net::HTTP | `grep -rn "HTTParty\|Net::HTTP\|Faraday\|RestClient" --include="*.rb"` | ☐ |
| RB-011 | **授权绕过** | before_action缺失 | `grep -rn "def destroy\|def update" --include="*_controller.rb"` 对比 `before_action` | ☐ |
| RB-012 | **Mass Assignment** | permit缺失 | `grep -rn "params\[:\|params\.permit" --include="*.rb"` | ☐ |
| RB-013 | **开放重定向** | redirect_to | `grep -rn "redirect_to.*params\|redirect_to.*request" --include="*.rb"` | ☐ |
| RB-014 | **Secret Key泄露** | secret_key_base | `grep -rn "secret_key_base\|Rails\.application\.secrets" --include="*.rb" --include="*.yml"` | ☐ |

### 1.10 Rust 漏洞检测能力清单

每次审计Rust项目时，**必须检查以下所有项目**:

| ID | 漏洞类型 | 检测模式 | 搜索命令 | 必须验证 |
|----|----------|----------|----------|----------|
| RS-001 | **unsafe块** | 内存不安全 | `grep -rn "unsafe\s*{" --include="*.rs"` | ☐ |
| RS-002 | **unsafe函数** | 不安全API | `grep -rn "unsafe\s*fn" --include="*.rs"` | ☐ |
| RS-003 | **裸指针** | *const/*mut | `grep -rn "\*const\|\*mut\|as_ptr\|as_mut_ptr" --include="*.rs"` | ☐ |
| RS-004 | **transmute** | 类型双关 | `grep -rn "std::mem::transmute\|mem::transmute" --include="*.rs"` | ☐ |
| RS-005 | **FFI边界** | extern "C" | `grep -rn "extern\s*\"C\"\|#\[no_mangle\]\|libc::" --include="*.rs"` | ☐ |
| RS-006 | **Send/Sync伪造** | 不安全trait | `grep -rn "unsafe\s*impl.*Send\|unsafe\s*impl.*Sync" --include="*.rs"` | ☐ |
| RS-007 | **SQL注入** | format!拼接SQL | `grep -rn "format!.*SELECT\|format!.*INSERT\|sqlx::query\!" --include="*.rs"` | ☐ |
| RS-008 | **命令执行** | Command::new | `grep -rn "Command::new\|std::process::Command" --include="*.rs"` | ☐ |
| RS-009 | **路径遍历** | PathBuf用户输入 | `grep -rn "PathBuf::from\|Path::new\|\.join\s*(" --include="*.rs"` | ☐ |
| RS-010 | **反序列化** | serde不安全 | `grep -rn "deserialize_any\|serde_json::from_\|bincode::deserialize" --include="*.rs"` | ☐ |
| RS-011 | **from_raw_parts** | 切片构造 | `grep -rn "from_raw_parts\|from_raw_parts_mut" --include="*.rs"` | ☐ |
| RS-012 | **panic触发** | unwrap/expect | `grep -rn "\.unwrap()\|\.expect(" --include="*.rs"` (服务中应避免panic) | ☐ |
| RS-013 | **SSRF** | reqwest/hyper | `grep -rn "reqwest::\|hyper::\|Client::new" --include="*.rs"` | ☐ |
| RS-014 | **TLS配置** | 证书验证 | `grep -rn "danger_accept_invalid_certs\|add_root_certificate" --include="*.rs"` | ☐ |

---

## 2. 黄金测试用例 (Golden Test Cases)

### 目的
用已知漏洞代码样本验证技能检测能力，类似单元测试。

### 2.1 PHP 黄金测试用例

```php
// TEST-PHP-001: 动态包含RCE
// 期望: 必须检测到
if($preHookFile = $this->getHookFile($extension, $hook))
    include $preHookFile;  // VULN: Dynamic include

// TEST-PHP-002: 反序列化
// 期望: 必须检测到
$query->form = unserialize($query->form);  // VULN: Unsafe unserialize

// TEST-PHP-003: XXE
// 期望: 必须检测到
$parsedXML = simplexml_load_file($filePath, null, LIBXML_NOERROR);  // VULN: XXE

// TEST-PHP-004: SSRF
// 期望: 必须检测到
$url = sprintf($format, $this->modelConfig->base, $method);
curl_setopt($ch, CURLOPT_URL, $url);  // VULN: SSRF

// TEST-PHP-005: 命令注入
// 期望: 必须检测到
$exec = "$binPath :memory: \"$sql\" -json 2>&1";
shell_exec($exec);  // VULN: Command Injection

// TEST-PHP-006: 授权绕过
// 期望: 必须检测到
public function delete($fileID) {
    // 无 checkPriv() 调用
    $this->dao->delete()->from(TABLE_FILE)->where('id')->eq($fileID)->exec();
}

// TEST-PHP-016: 间接SSRF (配置驱动) (v2.1.1新增)
// 期望: 必须检测到
$url = sprintf('%s/%s', rtrim($this->modelConfig->base, '/'), $apiPath);
curl_setopt($ch, CURLOPT_URL, $url);  // VULN: Indirect SSRF via config

// TEST-PHP-017: ZIP Slip (v2.1.1新增)
// 期望: 必须检测到
$zip = new ZipArchive();
$zip->extractTo($dest);  // VULN: ZIP Slip (no path validation after extraction)
```

### 2.2 Python 黄金测试用例

```python
# TEST-PY-001: Pickle反序列化
# 期望: 必须检测到
import pickle
data = pickle.loads(user_input)  # VULN: Unsafe pickle

# TEST-PY-002: PyYAML不安全加载
# 期望: 必须检测到
import yaml
config = yaml.load(yaml_string)  # VULN: yaml.load without Loader

# TEST-PY-003: eval代码执行
# 期望: 必须检测到
result = eval(user_expression)  # VULN: eval on user input

# TEST-PY-004: SSTI模板注入
# 期望: 必须检测到
from flask import render_template_string
return render_template_string(user_template)  # VULN: SSTI

# TEST-PY-005: DEBUG模式
# 期望: 必须检测到
app.run(debug=True)  # VULN: Debug mode enabled
```

### 2.3 Go 黄金测试用例

```go
// TEST-GO-001: SQL注入
// 期望: 必须检测到
query := fmt.Sprintf("SELECT * FROM users WHERE id = %s", userID)
db.Query(query)  // VULN: SQL Injection

// TEST-GO-002: 命令注入
// 期望: 必须检测到
cmd := exec.Command("sh", "-c", userCommand)
cmd.Run()  // VULN: Command Injection

// TEST-GO-003: 不安全的TLS
// 期望: 必须检测到
config := &tls.Config{InsecureSkipVerify: true}  // VULN: TLS verification disabled

// TEST-GO-004: SSRF
// 期望: 必须检测到
resp, _ := http.Get(userProvidedURL)  // VULN: SSRF

// TEST-GO-005: 竞态条件
// 期望: 必须检测到
var counter int
go func() { counter++ }()  // VULN: Race condition (no sync)
```

### 2.4 JavaScript 黄金测试用例

```javascript
// TEST-JS-001: 原型污染
// 期望: 必须检测到
function merge(target, source) {
    for (let key in source) {
        target[key] = source[key];  // VULN: Prototype pollution
    }
}

// TEST-JS-002: eval代码执行
// 期望: 必须检测到
eval(userInput);  // VULN: eval on user input

// TEST-JS-003: 命令注入
// 期望: 必须检测到
const { exec } = require('child_process');
exec(userCommand);  // VULN: Command Injection

// TEST-JS-004: XSS
// 期望: 必须检测到
element.innerHTML = userContent;  // VULN: XSS via innerHTML

// TEST-JS-005: 不安全的反序列化
// 期望: 必须检测到
const serialize = require('node-serialize');
serialize.unserialize(userInput);  // VULN: Unsafe deserialization
```

### 2.5 测试验证脚本

```bash
#!/bin/bash
# capability_test.sh - 能力回归测试

echo "=== 代码审计技能能力测试 ==="

# 测试用例目录
TEST_DIR="references/tests/golden_cases"

# PHP能力测试
echo ""
echo "[PHP Tests]"
for test_file in $TEST_DIR/php/*.php; do
    test_name=$(basename "$test_file" .php)
    expected_vuln=$(grep "// VULN:" "$test_file" | head -1)

    echo -n "Testing $test_name... "

    # 这里应该调用审计技能检测
    # 如果检测到，PASS；否则，FAIL

    # 示例验证逻辑
    if grep -q "include\s*\$" "$test_file" && [[ "$test_name" == *"include"* ]]; then
        echo "PASS"
    else
        echo "FAIL - 未检测到: $expected_vuln"
    fi
done
```

---

## 3. 更新前检查清单 (Pre-Update Checklist)

### 每次更新技能前，必须完成以下检查:

```
□ 1. 导出当前能力基线
     - 列出当前版本能检测的所有漏洞类型
     - 记录每种类型的检测模式

□ 2. 变更影响分析
     - 识别将要修改的文件/章节
     - 分析修改可能影响的检测能力
     - 特别注意: 删除内容时检查是否包含检测模式

□ 3. 保留检测模式
     - 即使移除特定案例(CVE编号)
     - 必须保留抽象的检测模式
     - 例: 移除"CVE-2024-XXXX"但保留"include $var是危险模式"

□ 4. 更新能力矩阵
     - 如果新增检测能力，添加到矩阵
     - 如果修改检测方式，更新矩阵
     - 永不删除能力项(除非有意废弃)

□ 5. 运行回归测试
     - 用黄金测试用例验证所有能力
     - 所有测试必须PASS才能发布更新
```

---

## 4. 能力版本追踪

### 版本历史

| 版本 | 日期 | 变更 | 能力变化 |
|------|------|------|----------|
| 1.0 | 初始 | 基础框架 | 基线能力 (PHP/Java/通用) |
| 2.0 | 2026-01-26 | 移除CVE案例，添加反确认偏见 | ⚠️ 丢失PHP-001(动态包含) |
| 2.1 | 2026-01-26 | 补充完整能力矩阵 | ✅ 恢复PHP-001, +Python 12项, +Go 10项, +JS 12项 |
| 2.1.1 | 2026-01-26 | 新增2个PHP检测项 | +PHP-016(间接SSRF), +PHP-017(ZIP Slip) |
| 2.2.0 | 2026-02-05 | **新增8个Java安全检测项** | +JAVA-011~018 (JNDI/JDBC/JWT/密钥等) |
| 2.3.0 | 2026-02-05 | **全语言覆盖** | +JAVA-019~025 (Fastjson/Text4Shell/SnakeYAML/Groovy), +PHP-018~019 (Phar/POP), +PY-013~014 (jsonpickle/dill), +GO-011~012 (Channel/cgo), +C/C++ 12项, +.NET 16项, +Ruby 14项, +Rust 14项 |

### 能力覆盖率追踪

```
PHP 能力覆盖: 17/17 (100%)
  ✓ PHP-001 ~ PHP-017
  备注: PHP-001(动态包含) v2.0丢失，v2.1恢复
  备注: PHP-016(间接SSRF), PHP-017(ZIP Slip) v2.1.1新增

PHP 能力覆盖: 19/19 (100%)
  ✓ PHP-001 ~ PHP-019
  备注: PHP-018~019 (Phar/POP Chain) v2.3.0新增

Java 能力覆盖: 25/25 (100%)
  ✓ JAVA-001 ~ JAVA-025
  备注: JAVA-019~025 (Fastjson/Text4Shell/SnakeYAML/Groovy/Nashorn) v2.3.0新增

Python 能力覆盖: 14/14 (100%)
  ✓ PY-001 ~ PY-014
  备注: PY-013~014 (jsonpickle/dill) v2.3.0新增

Go 能力覆盖: 12/12 (100%)
  ✓ GO-001 ~ GO-012
  备注: GO-011~012 (Channel竞态/cgo边界) v2.3.0新增

JavaScript 能力覆盖: 12/12 (100%)
  ✓ JS-001 ~ JS-012

C/C++ 能力覆盖: 12/12 (100%)
  ✓ C-001 ~ C-012 (v2.3.0新增)

.NET/C# 能力覆盖: 16/16 (100%)
  ✓ NET-001 ~ NET-016 (v2.3.0新增)

Ruby 能力覆盖: 14/14 (100%)
  ✓ RB-001 ~ RB-014 (v2.3.0新增)

Rust 能力覆盖: 14/14 (100%)
  ✓ RS-001 ~ RS-014 (v2.3.0新增)

通用能力覆盖: 5/5 (100%)
  ✓ GEN-001 ~ GEN-005
```

### 语言能力统计

| 语言 | 能力项 | 关键漏洞类型 |
|------|--------|-------------|
| PHP | 19项 | 动态包含RCE, 反序列化, XXE, SSRF, **Phar反序列化, POP Chain** |
| Java | 25项 | 反序列化, JNDI, JDBC协议, JWT, **Fastjson, Text4Shell, SnakeYAML, Groovy** |
| Python | 14项 | Pickle, PyYAML, SSTI, **jsonpickle, dill** |
| Go | 12项 | 竞态条件, unsafe, TLS, **Channel竞态, cgo边界** |
| JavaScript | 12项 | 原型污染, eval, 依赖投毒 |
| C/C++ | 12项 | **缓冲区溢出, 格式化字符串, Use-After-Free, 整数溢出** |
| .NET/C# | 16项 | **BinaryFormatter, TypeNameHandling, ViewState, LINQ注入** |
| Ruby | 14项 | **Marshal, YAML.load, ERB注入, send(), constantize** |
| Rust | 14项 | **unsafe块, transmute, FFI边界, Send/Sync伪造** |
| 通用 | 5项 | 硬编码密钥, 弱加密, TLS, 依赖CVE |
| **合计** | **143项** | - |

---

## 5. 自动化验证集成

### 在CI/CD中集成能力测试

```yaml
# .github/workflows/skill-test.yml
name: Skill Capability Test

on:
  push:
    paths:
      - 'skills/security-review/**'

jobs:
  capability-test:
    runs-on: ubuntu-latest
    steps:
      - name: Run Golden Tests
        run: |
          ./references/tests/capability_test.sh

      - name: Check Capability Matrix
        run: |
          # 验证所有能力项都有对应的检测规则
          python scripts/verify_capability_matrix.py

      - name: Fail on Capability Loss
        run: |
          # 如果任何能力丢失，阻止合并
          if grep -q "FAIL" test_results.txt; then
            echo "ERROR: Capability regression detected!"
            exit 1
          fi
```

---

## 6. 使用指南

### 审计开始时
1. 识别目标技术栈 (PHP/Java/Python/Go/...)
2. 加载对应的能力矩阵
3. 逐项检查，每完成一项打勾 ☑

### 审计结束时
1. 确认所有能力项都已检查
2. 未检查的项标注原因
3. 生成覆盖率报告

### 技能更新时
1. 运行能力回归测试
2. 确认无能力丢失
3. 更新版本追踪记录

---

**创建日期**: 2026-01-26
**维护者**: Security Audit Skill
**更新频率**: 每次技能更新后
