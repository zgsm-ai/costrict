# Costrict Deployment Guide

To help you deploy Costrict more efficiently, this document provides a clear installation manual. You can choose between the following two deployment methods:

1. [Install the Extension](#install-the-extension)
2. [Install the Extension and Deploy Backend Services](#install-the-extension-and-deploy-backend-services)

**Method 1** is suitable for new users to experience Costrict quickly. It works out-of-the-box but uses official server resources, which may limit performance due to resource constraints.

**Method 2** is recommended for long-term use with optimal performance. We provide a one-click installation script requiring minimal server resources.

---

## Install the Extension

### Prerequisites

1. Client has internet access.
2. Client: VS Code (version > v1.70.2).

> Currently, the Costrict extension is only available for VS Code. Support for JetBrains IDEs will be added later.

### Installation Steps

1. Search for "Costrict" in the VS Code Marketplace and click **Install**.

    ![alt text](/assets/images/install/extensions.png)

### Login

1. Click the **Login** button.
2. Enter your phone number, graphical CAPTCHA, and SMS verification code.

    ![alt text](/assets/images/install/login_ide.png)

    ![alt text](/assets/images/install/login_web.png)

After logging in, you can start using Costrict.

---

## Install the Extension and Deploy Backend Services

### Prerequisites

1. Server has internet access.
2. OS: Ubuntu 22.04 (64-bit).
3. Docker and Docker Compose installed.
4. An OpenAI-compatible LLM for Q&A (e.g., `qwen2.5-coder-32b`).
5. An OpenAI-compatible LLM with FIM support for code completion (e.g., `deepseek-coder-v2-lite-base`).

> The installation script is tested on Ubuntu 22.04. Other Linux distributions or macOS may require manual adjustments.
> Currently, only Docker Compose is supported. Kubernetes support will be added later.

### Extension Installation

Follow the steps in [Install the Extension](#install-the-extension).

### Backend Deployment

1. **Download the deployment script**:

```bash
git clone git@github.com:zgsm-ai/zgsm-backend-deploy.git
```

2. Modify the following configurations in the deployment script as needed

- Server address
- Dialog large model's address, type, API key
- Completion large model's address, type, API key

3. Run the deployment script

```bash
bash deploy.sh
```

### Login Account

- Visit one API address, local by visiting http://127.0.0.1:30000, but can be by startup assigned address such as http://172.xxx.xxx.xxx:30000 for a visit

    ![alt text](/assets/images/install/login_backend.png)

On the authentication interface, enter:

Username: root

Password: 123456

You can now start experiencing Costrict.
