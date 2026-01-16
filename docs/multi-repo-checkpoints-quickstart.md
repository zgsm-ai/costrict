# 多独立仓库 Checkpoint 快速入门

## 5 分钟快速开始

### 步骤 1：准备工作区

确保你的工作区包含多个独立的 Git 仓库：

```bash
/my-workspace/
  ├── frontend/.git/
  ├── backend/.git/
  └── shared/.git/
```

### 步骤 2：创建配置文件

在工作区根目录创建 `.costrict-checkpoint.json`：

```bash
cat > .costrict-checkpoint.json << 'EOF'
{
  "checkpoints": {
    "enabledRepos": ["frontend", "backend"],
    "disabledRepos": [],
    "defaultBehavior": "disabled"
  }
}
EOF
```

### 步骤 3：打开工作区

在 VSCode 中打开工作区：

```bash
code /my-workspace
```

### 步骤 4：开始使用

使用 CoStrict 的 checkpoint 功能：

- 保存 checkpoint：会同时保存 frontend 和 backend
- 恢复 checkpoint：会同时恢复两个仓库
- 查看 diff：可以查看整体变更

## 常用配置模板

### 模板 1：全部启用

```json
{
	"checkpoints": {
		"defaultBehavior": "enabled"
	}
}
```

### 模板 2：只启用生产代码

```json
{
	"checkpoints": {
		"enabledRepos": ["app", "api"],
		"disabledRepos": ["tests", "docs"],
		"defaultBehavior": "disabled"
	}
}
```

### 模板 3：禁用临时项目

```json
{
	"checkpoints": {
		"disabledRepos": ["temp", "experiments"],
		"defaultBehavior": "enabled"
	}
}
```

## 验证配置

创建配置后，可以通过日志验证：

```
[Task#getCheckpointService] 多仓库检测: 是
[Task#getCheckpointService] 使用 MultiRepoCheckpointService
[MultiRepoCheckpointService#initialize] 发现 3 个仓库
[MultiRepoCheckpointService#initialize] 将为 2 个仓库启用 checkpoint
```

## 故障排查

### 问题：没有检测到多个仓库

**检查：**

1. 确认每个子目录都有独立的 `.git` 目录
2. 确认不是嵌套仓库（父目录没有 `.git`）
3. 查看日志确认扫描结果

### 问题：某些仓库没有被启用

**检查：**

1. 确认配置文件格式正确
2. 确认仓库名称拼写正确
3. 确认 `defaultBehavior` 设置

### 问题：操作失败

**检查：**

1. 查看日志了解具体错误
2. 确认 Git 已正确安装
3. 确认仓库没有被其他进程占用

## 下一步

- 阅读完整文档：`docs/multi-repo-checkpoints.md`
- 查看示例配置
- 了解高级功能和最佳实践
