# 多独立仓库 Checkpoint 功能

## 概述

CoStrict 的 checkpoint 功能现在支持在一个工作区中管理多个独立的 Git 仓库。这使得在 monorepo 或包含多个相关项目的工作区中，可以为每个仓库独立管理 checkpoint。

## 功能特性

- ✅ 自动检测工作区中的独立 Git 仓库
- ✅ 通过配置文件选择性启用/禁用仓库
- ✅ 每个仓库独立的 checkpoint 历史
- ✅ 统一的保存、恢复和 diff 操作
- ✅ 完整的错误处理和日志记录
- ✅ 向后兼容单仓库场景

## 使用场景

### 场景 1：Monorepo 项目

```
/my-monorepo/
  ├── .costrict-checkpoint.json
  ├── frontend/.git/          # 前端仓库
  ├── backend/.git/            # 后端仓库
  └── shared/.git/            # 共享库仓库
```

### 场景 2：多项目工作区

```
/my-workspace/
  ├── .costrict-checkpoint.json
  ├── project-a/.git/
  ├── project-b/.git/
  └── project-c/.git/
```

### 场景 3：选择性启用

如果某些仓库不需要 checkpoint 功能，可以通过配置文件禁用。

## 配置文件

在**工作区根目录**创建 `.costrict-checkpoint.json` 文件：

### 基本配置

```json
{
	"checkpoints": {
		"enabledRepos": ["repo1", "repo2"],
		"disabledRepos": [],
		"defaultBehavior": "disabled"
	}
}
```

### 配置选项

| 选项              | 类型                      | 默认值      | 说明                               |
| ----------------- | ------------------------- | ----------- | ---------------------------------- |
| `enabledRepos`    | `string[]`                | `[]`        | 明确启用 checkpoint 的仓库名称列表 |
| `disabledRepos`   | `string[]`                | `[]`        | 明确禁用 checkpoint 的仓库名称列表 |
| `defaultBehavior` | `'enabled' \| 'disabled'` | `'enabled'` | 未在列表中指定的仓库的默认行为     |

### 配置规则

1. **优先级**：`enabledRepos` > `disabledRepos` > `defaultBehavior`
2. **仓库名称**：相对于工作区根目录的路径
3. **工作区根仓库**：使用 `.` 表示

### 配置示例

#### 示例 1：选择性启用

只对特定仓库启用 checkpoint：

```json
{
	"checkpoints": {
		"enabledRepos": ["frontend", "backend"],
		"disabledRepos": [],
		"defaultBehavior": "disabled"
	}
}
```

#### 示例 2：选择性禁用

对所有仓库启用，但禁用特定仓库：

```json
{
	"checkpoints": {
		"enabledRepos": [],
		"disabledRepos": ["temp-projects"],
		"defaultBehavior": "enabled"
	}
}
```

#### 示例 3：全部启用

```json
{
	"checkpoints": {
		"enabledRepos": [],
		"disabledRepos": [],
		"defaultBehavior": "enabled"
	}
}
```

#### 示例 4：全部禁用

```json
{
	"checkpoints": {
		"enabledRepos": [],
		"disabledRepos": [],
		"defaultBehavior": "disabled"
	}
}
```

## 使用方法

### 1. 创建配置文件

在工作区根目录创建 `.costrict-checkpoint.json`：

```bash
cd /path/to/workspace
cat > .costrict-checkpoint.json << 'EOF'
{
  "checkpoints": {
    "enabledRepos": ["repo1", "repo2"],
    "defaultBehavior": "disabled"
  }
}
EOF
```

### 2. 打开 VSCode

在包含多个仓库的父目录打开 VSCode：

```bash
code /path/to/workspace
```

### 3. 使用 CoStrict

正常使用 CoStrict 的 checkpoint 功能：

- 保存 checkpoint：会为所有启用的仓库保存
- 恢复 checkpoint：会同时恢复所有启用的仓库
- 查看 diff：可以查看整体 diff 或单个仓库的 diff

## 仓库识别规则

### 独立仓库 vs 嵌套仓库

**独立仓库**：

- 直接在工作区根目录下
- 不被其他仓库包含
- 会被 checkpoint 管理

**嵌套仓库**：

- 位于其他仓库的子目录中
- 会被自动排除，不被 checkpoint 管理

### 示例

```
/workspace/
  ├── repo1/.git/          # ✅ 独立仓库（会被管理）
  ├── repo2/
  │   └── .git/            # ✅ 独立仓库（会被管理）
  └── repo3/
      └── submodule/
          └── .git/        # ❌ 嵌套仓库（自动排除）
```

## API 说明

### MultiRepoCheckpointService

```typescript
interface MultiRepoCheckpointService {
	// 初始化所有仓库的 checkpoint 服务
	initialize(): Promise<void>

	// 为所有启用的仓库保存 checkpoint
	saveCheckpoint(message: string, options?: Options): Promise<MultiCheckpointResult[]>

	// 恢复所有仓库到指定 checkpoint
	restoreCheckpoint(commitHash: string): Promise<MultiCheckpointResult[]>

	// 获取 diff（可选指定仓库）
	getDiff(options: { from?: string; to?: string; repoName?: string }): Promise<MultiDiffResult[]>

	// 获取所有仓库的 checkpoint 列表
	getCheckpoints(): Promise<Map<string, string[]>>

	// 获取启用的仓库列表
	getEnabledRepos(): string[]

	// 获取所有仓库的状态
	getReposStatus(): RepoCheckpointService[]
}
```

### 操作结果

```typescript
interface MultiCheckpointResult {
	repoName: string // 仓库名称
	success: boolean // 是否成功
	commitHash?: string // 提交 hash（成功时）
	error?: string // 错误信息（失败时）
}

interface MultiDiffResult {
	repoName: string // 仓库名称
	changes?: CheckpointDiff[] // 变更列表
	error?: string // 错误信息
}
```

## 工作原理

### 1. 自动检测

当创建任务时，CoStrict 会：

1. 扫描工作区，识别所有 Git 仓库
2. 区分独立仓库和嵌套仓库
3. 加载配置文件（如果存在）
4. 根据配置过滤需要启用的仓库

### 2. 服务选择

- **单仓库场景**：使用 `RepoPerTaskCheckpointService`
- **多仓库场景**：使用 `MultiRepoCheckpointService`

### 3. Checkpoint 存储

每个仓库的 checkpoint 存储在独立的位置：

```
~/.vscode/extensions/.../tasks/{taskId}/checkpoints/{repoName}/
```

## 错误处理

### 单个仓库失败

如果某个仓库的操作失败，不会影响其他仓库：

```typescript
const results = await checkpointService.saveCheckpoint("Test checkpoint")
// [
//   { repoName: "repo1", success: true, commitHash: "abc123" },
//   { repoName: "repo2", success: false, error: "Git error" },
//   { repoName: "repo3", success: true, commitHash: "def456" }
// ]
```

### 检测失败

如果仓库扫描失败，系统会自动回退到单仓库模式，确保功能的可用性。

## 最佳实践

### 1. 配置管理

- 将 `.costrict-checkpoint.json` 添加到版本控制
- 团队成员共享相同的配置
- 定期审查配置，确保符合项目需求

### 2. 仓库组织

- 保持独立仓库的清晰结构
- 避免过深的嵌套
- 使用有意义的仓库名称

### 3. 性能优化

- 只为需要的仓库启用 checkpoint
- 定期清理旧的 checkpoint
- 监控初始化和操作时间

### 4. 错误监控

- 查看日志了解仓库初始化状态
- 关注操作失败的仓库
- 及时处理错误信息

## 常见问题

### Q1: 如何知道当前启用了哪些仓库？

在任务日志中查看：

```
[MultiRepoCheckpointService#initialize] 发现 3 个仓库
[MultiRepoCheckpointService#initialize] 将为 2 个仓库启用 checkpoint
[MultiRepoCheckpointService#initialize] 仓库 repo1 初始化成功
[MultiRepoCheckpointService#initialize] 仓库 repo2 初始化成功
```

### Q2: 嵌套仓库可以被管理吗？

目前不支持。嵌套仓库会被自动排除，以确保功能的稳定性。

### Q3: 可以动态启用/禁用仓库吗？

需要修改配置文件并重启任务。不支持运行时动态切换。

### Q4: 如何查看某个仓库的 checkpoint 历史？

使用 `getCheckpoints()` 方法获取所有仓库的 checkpoint 列表：

```typescript
const checkpoints = await checkpointService.getCheckpoints()
// Map {
//   "repo1" => ["abc123", "def456", "ghi789"],
//   "repo2" => ["xyz123", "uvw456"]
// }
```

### Q5: 单仓库场景会受到影响吗？

不会。单仓库场景的行为与之前完全一致，自动使用 `RepoPerTaskCheckpointService`。

### Q6: 配置文件格式错误会怎样？

系统会记录警告日志，并使用默认配置（所有独立仓库启用）。

### Q7: 可以为不同仓库使用不同的 shadow 目录吗？

目前不支持。所有仓库使用相同的全局存储目录，但会为每个仓库创建独立的子目录。

## 向后兼容性

此功能完全向后兼容：

- ✅ 单仓库场景行为不变
- ✅ 不影响现有的 checkpoint 配置
- ✅ 无需修改现有代码
- ✅ 可选功能，按需使用

## 技术细节

### 依赖项

- `simple-git`: Git 操作
- `p-wait-for`: 异步等待
- `ripgrep`: 文件搜索

### 文件结构

```
src/services/checkpoints/
├── CheckpointConfigParser.ts      # 配置解析器
├── RepoScanner.ts                 # 仓库扫描器
├── MultiRepoCheckpointService.ts  # 多仓库管理服务
├── RepoPerTaskCheckpointService.ts # 单仓库服务
└── types/
    └── config.ts                  # 类型定义
```

### 性能指标

- 仓库扫描：< 1s（5个仓库）
- 初始化：< 10s（5个仓库）
- Checkpoint 保存：< 5s（5个仓库）

## 更新日志

### v1.0.0 (2026-01-16)

- ✨ 新增多独立仓库 checkpoint 支持
- ✨ 新增配置文件功能
- ✨ 新增仓库自动检测
- 🐛 修复嵌套仓库检测问题
- 📝 完善文档和测试

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

与 CoStrict 主项目保持一致。
