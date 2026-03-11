# False Positive Kill Switch - 误报过滤机制

> 漏洞判定失败条件，自动降级或标注"不可利用"

## 概述

并非所有检测到的"危险模式"都是真实可利用的漏洞。False Positive Kill Switch机制通过检查安全控制措施，自动过滤误报或降低漏洞严重性。

---

## 核心原则

**漏洞成立的4个条件** (缺一不可):
1. **输入可控**: 攻击者能够控制输入数据
2. **安全假设错误**: 代码错误地信任了不可信数据
3. **危险执行点**: 输入到达危险函数(sink)
4. **权限放大**: 漏洞利用能够产生权限提升或信息泄露

**Kill Switch判定**: 以下任一条件成立时，标注为"不可利用"或降级严重性：

---

## Kill Switch清单

### 1. Controller层强类型限制

```java
// ✅ Kill Switch触发: enum限制
@GetMapping("/api/users")
public List<User> getUsers(@RequestParam UserRole role) {  // enum类型
    return userService.findByRole(role);  // SQL注入不可能
}

enum UserRole {
    ADMIN, USER, GUEST  // 仅3个合法值
}

// ✅ Kill Switch触发: 白名单验证
@GetMapping("/api/sort")
public List<User> sort(@RequestParam String field) {
    if (!ALLOWED_FIELDS.contains(field)) {
        throw new IllegalArgumentException();  // 白名单检查在入口
    }
    return userRepo.sort(field);  // 即使用${field}拼接也安全
}
```

**判定规则**:
- ✅ 参数类型为enum → **降级为Info**
- ✅ Controller方法首行有白名单验证 → **降级为Low**
- ⚠️ Service层白名单 → **保持原严重性** (Controller可能有其他路径)

---

### 2. Bean Validation + 强类型DTO

```java
// ✅ Kill Switch触发: Bean Validation
public class CreateUserRequest {
    @NotNull
    @Email  // 正则验证
    private String email;

    @NotNull
    @Pattern(regexp = "^[a-zA-Z0-9_]+$")  // 仅字母数字下划线
    private String username;

    @NotNull
    @Min(18) @Max(120)
    private Integer age;  // 强类型Integer
}

@PostMapping("/api/users")
public User createUser(@Valid @RequestBody CreateUserRequest request) {  // @Valid触发验证
    return userService.create(request);  // 输入已经过验证
}
```

**判定规则**:
- ✅ DTO + `@Valid` + `@Pattern/@Email/@Size` → **降级为Low**
- ✅ Integer/Long/Boolean强类型参数 → **SQL注入降级为Info** (无法注入)
- ⚠️ String类型 + `@NotNull` → **保持原严重性** (NotNull不足以防止注入)

---

### 3. Security Filter在入口前生效

```java
// ✅ Kill Switch触发: OncePerRequestFilter
@Component
public class XssFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, ...) {
        XssHttpServletRequestWrapper wrappedRequest = new XssHttpServletRequestWrapper(request);
        filterChain.doFilter(wrappedRequest, response);  // 所有请求经过XSS过滤
    }
}

// 后续Controller无需担心XSS
@PostMapping("/api/comments")
public Comment create(@RequestParam String content) {
    return commentRepo.save(content);  // Filter已过滤XSS
}
```

**判定规则**:
- ✅ 全局XssFilter + 完整实现 → **XSS漏洞降级为Low** (需验证filter完整性)
- ✅ CSRF Filter + token验证 → **CSRF漏洞降级为Info**
- ⚠️ Filter存在但有excludeUrlPatterns → **保持原严重性**

---

### 4. ORM参数绑定（非拼接）

```java
// ✅ Kill Switch触发: MyBatis #{}参数化
<select id="findUser" resultType="User">
    SELECT * FROM users WHERE id = #{id}  <!-- #{} 参数化，安全 -->
</select>

// ✅ JPA @Query with :param
@Query("SELECT u FROM User u WHERE u.email = :email")  // :email参数化
User findByEmail(@Param("email") String email);

// ✅ Hibernate Criteria API type-safe
CriteriaBuilder cb = em.getCriteriaBuilder();
CriteriaQuery<User> query = cb.createQuery(User.class);
Root<User> root = query.from(User.class);
query.where(cb.equal(root.get("email"), email));  // Type-safe，无拼接
```

**判定规则**:
- ✅ MyBatis #{} 且无${}拼接 → **SQL注入降级为Info**
- ✅ JPA @Query with :param (无nativeQuery=true) → **降级为Info**
- ✅ Criteria API type-safe查询 → **降级为Info**
- ❌ MyBatis ${} 或 JPA nativeQuery + 拼接 → **保持Critical**

---

### 5. 真实权限校验存在（非注解摆设）

```java
// ❌ 注解摆设: 仅有注解，无实际校验
@PreAuthorize("hasRole('ADMIN')")  // 注解存在
@GetMapping("/admin/users")
public List<User> getUsers() {
    return userRepo.findAll();  // 但SecurityConfig未启用method-level security
}

// ✓ 真实权限校验: 配置启用
@Configuration
@EnableGlobalMethodSecurity(prePostEnabled = true)  // 启用方法级安全
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    // ...
}

// ✓ 或手动校验
@GetMapping("/admin/users")
public List<User> getUsers() {
    if (!SecurityUtils.hasRole("ADMIN")) {  // 手动检查
        throw new ForbiddenException();
    }
    return userRepo.findAll();
}
```

**判定规则**:
- ✅ `@PreAuthorize` + `@EnableGlobalMethodSecurity(prePostEnabled=true)` → **降级为Low**
- ✅ 方法内首行权限检查 (`if (!hasRole()) throw;`) → **降级为Low**
- ❌ 仅有注解，无SecurityConfig配置 → **保持原严重性**

---

## 自动判定流程

```
1. 检测到危险模式 (如SQL注入、XSS)
   ↓
2. 检查Kill Switch条件:
   - Controller层参数类型 (enum/Integer/Long?)
   - Bean Validation (@Valid + @Pattern?)
   - 白名单验证 (ALLOWED_FIELDS.contains()?)
   - Security Filter (全局XssFilter?)
   - ORM绑定方式 (#{} vs ${}?)
   - 权限校验配置 (@EnableGlobalMethodSecurity?)
   ↓
3. Kill Switch触发:
   - 标注: "[可能误报] 已有安全控制"
   - 降级严重性: Critical→Low 或 High→Info
   ↓
4. 报告中注明:
   - 检测到的危险模式
   - 触发的Kill Switch条件
   - 建议: "验证安全控制是否完整"
```

---

## 判定示例

### 示例1: SQL注入 → Info (误报)

```java
// 检测: SQL注入 (Critical)
@GetMapping("/users")
public List<User> getUsers(@RequestParam UserStatus status) {  // enum类型
    return userService.findByStatus(status);
}

// Kill Switch触发:
// - 参数类型: enum (仅3个值: ACTIVE, INACTIVE, BANNED)
// - 即使SQL拼接也无法注入

// 判定: 降级为Info，标注"[误报] enum类型限制"
```

### 示例2: XSS → Low (有控制但需验证)

```java
// 检测: XSS (Medium)
@PostMapping("/comments")
public Comment create(@RequestParam String content) {
    return commentService.save(content);
}

// Kill Switch检查:
// - 存在XssFilter (OncePerRequestFilter)
// - Filter escapeHtml实现

// 判定: 降级为Low，标注"[有控制] XssFilter已过滤，需验证filter完整性"
```

### 示例3: IDOR → High (无Kill Switch)

```java
// 检测: IDOR (High)
@GetMapping("/orders/{id}")
public Order getOrder(@PathVariable Long id) {
    return orderService.findById(id);  // 无权限检查
}

// Kill Switch检查:
// - 无@PreAuthorize注解
// - 方法内无权限检查
// - 无EnableGlobalMethodSecurity配置

// 判定: 保持High，真实漏洞
```

---

## 报告格式

```markdown
### 漏洞: SQL注入 (原严重性: Critical)

**位置**: UserController.java:45
**危险模式**: MyBatis ${field} 字符串拼接

**Kill Switch判定**: ✅ 触发 → 降级为 **Low**

**原因**:
- Controller层白名单验证: `ALLOWED_FIELDS.contains(field)` (line 42)
- 仅允许: ["id", "name", "email"]

**建议**:
- ✓ 已有白名单保护
- ⚠️ 验证白名单是否覆盖所有调用路径
- 建议: 改为#{field}参数化更安全
```

---

## False Negative风险

**注意**: Kill Switch可能误判以下情况:

1. **白名单不完整**: `ALLOWED_FIELDS.contains(field)` 但ALLOWED_FIELDS包含危险值
2. **Filter有缺陷**: XssFilter存在但实现不正确
3. **多路径攻击**: Controller有验证，但Service暴露内部API
4. **配置未生效**: `@EnableGlobalMethodSecurity` 存在但条件性启用

**建议**: Kill Switch仅作为辅助判断，Critical漏洞即使触发Kill Switch也应人工复核。

---

## 配置选项

```yaml
# agent.md配置
false_positive_filter:
  enabled: true
  aggressive_mode: false  # true: 更激进降级，false: 保守判断
  rules:
    enum_parameter: downgrade_to_info
    bean_validation: downgrade_to_low
    whitelist_validation: downgrade_to_low
    security_filter: downgrade_to_low
    orm_parameterized: downgrade_to_info
    permission_check: downgrade_to_low
```

---

## 参考

- OWASP: False Positive Handling
- Secure Code Review Best Practices
- CVSS v3.1 Environmental Score (安全控制降低严重性)
