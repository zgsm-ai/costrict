# Costrict部署指南

本指南介绍 Costrict 的两种安装方式：仅安装插件 / 安装插件并部署后端服务。  

- **方式一：仅安装插件**  
  - 适合：新用户快速体验  
  - 优点：开箱即用，配置简单  
  - 限制：依赖官方服务器资源，性能与稳定性有限
    
- **方式二：安装插件 + 部署后端服务**  
  - 适合：长期使用、追求稳定与最佳性能的用户  
  - 优点：独立运行，性能可控，数据安全性更高  
  - 推荐：生产环境部署

## 安装插件

### 安装前检查

1. 客户端能访问网络

2. 客户端：Visual Studio Code（版本号 > v1.86）

> 目前Costrict插件仅上架了 VS Code，后续也会增加支持 JetBrains 系列

### 插件安装

在 VS Code 插件商店搜索 “Costrict”，点击 “Install” 进行安装

    ![alt text](/assets/images/install/extensions.png)

### 登录账户

点击“登录Costrict”按钮，在接下来的界面依次输入手机号，图形验证码和短信验证码即可完成登录

    ![alt text](/assets/images/install/login_ide.png)

    ![alt text](/assets/images/install/login_web.png)

账户登录后，就可以开始体验Costrict了

## 安装插件，同时部署后端服务

### 安装前检查

1. 服务器能访问外网

2. 操作系统：Ubuntu 22.04 (64-bit)

3. docker 和 docker compose

4. 支持 openai 标准的问答大模型，例如 qwen2.5-coder-32b

5. 支持 openai 标准并且支持 FIM 的补全大模型，例如 deepseek-coder-v2-lite-base

> 本安装脚本基于 Ubuntu 22.04，其它 Linux 发行版、macOS 也能安装，不过需要根据脚本手动安装。

> 暂时只提供了 docker compose 的安装方式，后续也会支持 k8s 一键安装

### 插件安装

请参考 [安装插件](#安装插件)

### 部署后端服务

1. 下载部署脚本

```
git clone git@github.com:zgsm-ai/zgsm-backend-deploy.git
```

2. 根据需要修改部署脚本中的以下配置

- 服务器地址

- 对话大模型的 地址，类型，API key

- 补全大模型的 地址，类型，API key

3. 运行部署脚本

```
bash deploy.sh
```

### 登录账户

- 访问one api地址，本地通过访问http://127.0.0.1:30000，也可以通过启动时分配的地址如http://172.xxx.xxx.xxx:30000进行访问

在接下来的认证界面输入

    ![alt text](/assets/images/install/login_backend.png)

账户名：root

密码：123456
 
- **首次登录必须修改密码**  
  ```bash
  # 修改密码示例
  passwd root
  ```
- 推荐使用强密码（12 位以上，包含字母、数字和符号）。  

现在，你可以开始深入体验Costrict了👏
