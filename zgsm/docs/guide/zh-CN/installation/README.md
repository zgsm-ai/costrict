# 诸葛神码部署指南

为了让您更快的部署诸葛神码，本文档提供清晰的安装手册。你可以选择以下2种部署方式：

1. [安装插件](#安装插件)
2. [安装插件，同时部署后端服务](#安装插件同时部署后端服务)

方式1适合新用户初步体验诸葛神码，开箱即用，但由于使用的是诸葛神码官方的服务器资源，因为资源有限，体验可能不如方式2

方式2适合长期使用，并期望得到最佳体验的用户，我们提供了一键安装的脚本，并且不需要太多的服务器资源，推荐使用这种方式进行部署

## 安装插件

### 安装前检查

1. 客户端能访问网络

2. 客户端：vscode（版本号 > v1.70.2）

> 目前诸葛千流插件仅上架了 vscode，后续也会增加支持 jetbrain 系列

### 插件安装

在 vscode 插件商店搜索 “Shenma”，点击 “Install” 进行安装

![alt text](/images/install/extensions.png)

### 登录账户

点击“登录”按钮，在接下来的界面依次输入手机号，图形验证码和短信验证码即可完成登录

![alt text](/images/install/login.png)

账户登录后，就可以开始体验诸葛神码了

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

2. 修改部署脚本的以下配置

- 服务器地址

- 对话大模型的 地址，类型，API key

- 补全大模型的 地址，类型，API key

![alt text](/images/install/deploy.png)

3. 运行部署脚本

```
bash deploy.sh
```

### 登录账户

#### 修改插件配置

将诸葛神码的后端地址修改为“服务器IP地址:9080”

![alt text](/images/install/configure.png)

#### 登录

![alt text](/images/install/login.png)

在接下来的认证界面输入

账户名：zgsm

密码：123

就可以开始体验诸葛神码了
