# 统一认证登陆服务

> 用于插件登陆统一认证服务, 获取登陆状态, 维护machine_code和access_token, refresh_token映射, 以及其他登陆信息和服务

## 状态码

```
code: {
    200: OK (请求成功)
    400: Bad Request (参数错误)
    401: Unauthorized (认证失败)
    403: Forbidden (无权限)
    500: Internal Server Error (服务器内部错误)
}
```

## 参数

`state: 用于防止CSRF攻击，UUID或其他随机生成字符串`

`machine_code: 设备唯一标识符，UUID格式字符串`

```
status: 登陆状态
枚举值
    logged_out: 未登录 (初始状态)
    actived:    登陆成功
    expired:    登陆过期
    unknown:    状态未知
```

## 登陆接口

> `url :  /oidc_auth/plugin/login `

> `请求方式:  GET`

> `请求参数:`

```json
?machine_code=550e8400-e29b-11d4-a716-446655440000
```

> `响应体:`

```json
{
    "status": "actived",
    "message": "Login successful"
}
{
    "status": "logged_out",
    "message": "Login failed"
}
```

注: 插件在登陆成功后, 获取不到这个返回结果，需要轮询status接口获取登陆状态

## 获取token接口

> 用于获取access_token和refresh_token

> `url :  /oidc_auth/plugin/login/token `

> `请求方式:  POST`

> `请求参数:`

```json
?machine_code=550e8400-e29b-11d4-a716-446655440000
```

响应体:

```json
{
	"access_token": "<access_token>",
	"refresh_token": "<refresh_token>"
}
```

## 状态检查接口

> 用于检查登陆状态, 如果登陆过期会自动refresh token, 如果申请新token失败, 则返回状态为logged_out

> `url :  /oidc_auth/plugin/login/status `

> `请求方式:  POST`

> `请求参数:`

```json
请求头:
Authorization: Bearer <access_token>
```

> `响应体:`

```json
{
	"status": "actived",
	"message": "Status check successful",
	"state": "test_zgsm",
	"access_token": "<access_token>"
}

// {
//     "status": "expired",
//     "message": "Token expired, refreshing",
//     "state": "test_zgsm"
// }

// {
//     "status": "unknown",
//     "message": "Unknown status"
// }

// {
//     "status": "logged_out",
//     "message": "Logged out",
//     "state": "test_zgsm"

// }
```

## 登出接口

> 用于登出统一认证服务, 清除登陆状态

> `url :  /oidc_auth/plugin/logout `

> `请求方式:  POST`

> `请求参数:`

```json
请求头:
Authorization: Bearer <your_token>
```

> `响应体:`

```json
{
    "status": "logged_out",
    "message": "Logout successful",
    "state": "test_zgsm"
}
{
    "status": "actived",
    "message": "Logout failed",
    "state": "test_zgsm"
}
// {
//     "status": "unknown",
//     "message": "Unknown status"
// }
{
    "status": "logged_out",
    "message": "Already logged out",
    "state": "test_zgsm"
}
```
