# 战斗模式（Battle Mode）

## 概述

战斗模式（Battle Mode）是 CoStrict 的智能错误恢复系统，旨在提升系统在面对连续错误时的鲁棒性。当 AI 助手在执行任务时遇到错误，战斗模式会自动启用三层恢复机制，确保任务能够继续执行而不中断。

### 核心特性

- **自动错误恢复**：无需用户干预，自动处理常见错误
- **三级恢复策略**：根据错误严重程度智能选择恢复策略
- **上下文智能清理**：自动识别并清理导致错误的对话片段
- **智能模型切换**：当当前模型无法解决问题时，自动切换到备用模型
- **完整的事件追踪**：记录所有恢复操作，便于调试和分析

## 恢复策略层次

战斗模式采用三级递进式恢复策略，随着错误次数增加，采用更积极的恢复措施。

### Level 1: 忽略继续（错误计数 < 3）

当错误次数较少时，战斗模式会：

- 记录错误信息
- 不中断当前任务
- 继续执行下一步操作

**适用场景**：

- 偶发的网络错误
- 暂时的 API 限制
- 不影响整体任务执行的小错误

### Level 2: 上下文清理（错误计数 3-4）

当错误次数达到中等阈值时，战斗模式会：

- 分析对话历史，识别导致错误的对话片段
- 移除相关消息（如失败的助手响应、工具调用结果）
- 保留关键信息（系统提示、最后用户消息）
- 使用清理后的上下文继续执行任务

**适用场景**：

- 上下文累积导致的 token 限制
- 对话循环导致的错误
- 上下文冲突导致的失败

### Level 3: 模型切换（错误计数 ≥ 5）

当错误次数达到高阈值时，战斗模式会：

- 按配置的备用模型列表顺序尝试切换
- 验证新模型的可用性
- 使用新模型重试任务
- 限制最大切换次数以防止无限循环

**适用场景**：

- 当前模型能力不足
- 模型特定的兼容性问题
- 长时间连续错误表明当前模型不适合当前任务

## 配置说明

### 基本配置

战斗模式默认是关闭的，需要手动启用。以下是完整的配置选项：

```typescript
{
  enabled: false,  // 是否启用战斗模式

  errorThresholds: {
    level1: 3,  // Level 1 阈值：错误计数小于此值时忽略继续
    level2: 5   // Level 2 阈值：错误计数达到此值时执行上下文清理
  },

  contextCleanup: {
    keepLastUserMessage: true,    // 保留最后的用户消息
    keepLastSystemMessage: true,  // 保留系统消息
    maxMessagesToRemove: 10        // 最多移除的消息数量
  },

  modelSwitching: {
    fallbackModels: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro'],  // 备用模型列表
    maxSwitches: 3  // 最大切换次数
  }
}
```

### 配置参数详解

#### enabled

- **类型**: `boolean`
- **默认值**: `false`
- **说明**: 是否启用战斗模式。设置为 `true` 后，战斗模式会自动处理错误。

#### errorThresholds

- **level1**: Level 1 恢复策略的触发阈值。错误计数小于此值时，只记录错误继续执行。
- **level2**: Level 2 恢复策略的触发阈值。错误计数达到此值时，执行上下文清理。错误计数超过此值时，执行模型切换。

#### contextCleanup

- **keepLastUserMessage**: 在清理上下文时，是否保留最后的用户消息。保留用户消息可以确保任务上下文不丢失。
- **keepLastSystemMessage**: 是否保留系统消息。系统消息通常包含重要的指令和约束。
- **maxMessagesToRemove**: 最多可以移除的消息数量。此限制可以防止过度清理导致上下文不足。

#### modelSwitching

- **fallbackModels**: 备用模型列表，按优先级排序。当需要切换模型时，会依次尝试这些模型。
- **maxSwitches**: 最大模型切换次数。达到此次数后，即使继续出错也不再切换模型。

## 使用指南

### 启用战斗模式

在代码中创建 `BattleModeManager` 实例并启用：

```typescript
import { BattleModeManager } from "./src/core/battle-mode/BattleModeManager"

// 创建战斗模式管理器
const battleMode = new BattleModeManager({
	enabled: true,
	errorThresholds: {
		level1: 3,
		level2: 5,
	},
	contextCleanup: {
		keepLastUserMessage: true,
		keepLastSystemMessage: true,
		maxMessagesToRemove: 10,
	},
	modelSwitching: {
		fallbackModels: ["gpt-4o", "claude-3-5-sonnet"],
		maxSwitches: 3,
	},
})

// 初始化
battleMode.initialize()
```

### 在任务中使用

在任务执行过程中，遇到错误时调用战斗模式：

```typescript
try {
	// 执行任务代码
	await executeTask()
} catch (error) {
	// 构建错误上下文
	const errorContext: ErrorContext = {
		timestamp: Date.now(),
		taskId: "task-123",
		conversationHistory: getConversationHistory(),
		currentModel: getCurrentModel(),
		errorType: error.fatal ? "fatal" : "recovery",
	}

	// 交给战斗模式处理
	const result = await battleMode.handleError(error, errorContext)

	if (result.success) {
		// 恢复成功，根据 result.action 执行相应操作
		switch (result.action) {
			case "continue":
				// 继续执行
				break
			case "retry":
				// 重试操作
				await retryTask()
				break
			case "switch_model":
				// 使用新模型重试
				await retryWithModel(result.details.switchedToModel)
				break
			case "abort":
				// 放弃任务
				handleAbort(result.details.reason)
				break
		}
	} else {
		// 恢复失败，中止任务
		handleAbort(result.details.reason)
	}
}
```

### 监听战斗模式事件

可以监听战斗模式的各种事件来了解其运行状态：

```typescript
// 监听状态变化
battleMode.on("stateChange", (status) => {
	console.log("战斗模式状态变化:", status)
})

// 监听错误事件
battleMode.on("error", (data) => {
	console.log("捕获到错误:", data.error, data.context)
})

// 监听恢复事件
battleMode.on("recovery", (result) => {
	console.log("执行恢复操作:", result)
})

// 监听模型切换事件
battleMode.on("modelSwitch", (data) => {
	console.log("模型切换:", data.fromModel, "->", data.toModel)
})
```

### 动态配置更新

可以在运行时更新战斗模式的配置：

```typescript
// 更新配置
battleMode.updateConfig({
	errorThresholds: {
		level1: 5, // 提高阈值，减少上下文清理频率
		level2: 8,
	},
})

// 暂停战斗模式
battleMode.pause()

// 恢复战斗模式
battleMode.resume()

// 停用战斗模式
battleMode.deactivate()
```

### 获取统计信息

可以获取战斗模式的运行统计：

```typescript
// 获取当前状态
const status = battleMode.getStatus();
console.log('战斗模式状态:', status);

// 获取统计信息
const stats = battleMode.getStatistics();
console.log('统计信息:', {
  总错误数: stats.totalErrors,
  总恢复次数: stats.totalRecoveries,
  Level 1 恢复: stats.recoveryByLevel.level1,
  Level 2 恢复: stats.recoveryByLevel.level2,
  Level 3 恢复: stats.recoveryByLevel.level3,
  模型切换次数: stats.totalModelSwitches
});
```

## 错误恢复策略详解

### Level 1: 忽略继续策略

当错误次数较少时，系统采用保守的恢复策略：

**实现原理**：

```typescript
async executeLevel1Strategy(error: Error, context: ErrorContext): Promise<RecoveryResult> {
  // 只记录错误，不做任何干预
  this.status.statistics.recoveryByLevel.level1++;
  this.emit('recovery', {
    strategy: 'level1',
    error,
    context
  });

  return {
    action: 'continue',
    details: {
      reason: 'Error count below threshold, continuing execution',
      strategyLevel: 'level1'
    },
    success: true
  };
}
```

**使用场景**：

- 网络抖动导致的临时错误
- API 返回偶发的 429 错误（限流）
- 不影响任务整体执行的小问题

**优缺点**：

- ✅ 优点：不中断任务执行，保持流畅性
- ❌ 缺点：如果错误持续发生，可能会延迟解决

### Level 2: 上下文清理策略

当错误次数达到中等阈值时，系统会分析并清理对话历史：

**实现原理**：

```typescript
async executeLevel2Strategy(error: Error, context: ErrorContext): Promise<RecoveryResult> {
  const cleaner = new ConversationCleaner(this.config.contextCleanup);

  // 识别需要移除的消息
  const messagesToRemove = cleaner.identifyMessagesToRemove(
    context.conversationHistory,
    error,
    context
  );

  // 执行清理
  const cleanedHistory = cleaner.removeMessages(
    context.conversationHistory,
    messagesToRemove
  );

  // 验证清理后的历史
  if (!cleaner.validateCleanedHistory(cleanedHistory)) {
    throw new Error('Cleaned conversation history is invalid');
  }

  this.status.statistics.recoveryByLevel.level2++;
  this.emit('recovery', {
    strategy: 'level2',
    error,
    context,
    removedMessages: messagesToRemove.length,
    cleanedHistory
  });

  return {
    action: 'retry',
    details: {
      reason: 'Context cleaned, retrying with reduced history',
      removedMessages: messagesToRemove.length,
      clearedHistory: cleanedHistory,
      strategyLevel: 'level2'
    },
    success: true
  };
}
```

**清理规则**：

1. **保留规则**：
    - 保留最后的用户消息
    - 保留系统消息
    - 保留 condense 节点（摘要节点）

2. **移除规则**：
    - 移除导致错误的助手响应
    - 移除相关的工具调用结果
    - 移除连续失败的对话片段

3. **边界保护**：
    - 确保清理后仍有足够的上下文
    - 不移除关键的任务信息
    - 限制最大移除数量

**使用场景**：

- Token 限制导致的上下文溢出
- 对话循环导致的逻辑混乱
- 上下文冲突导致的解析错误

**优缺点**：

- ✅ 优点：解决上下文相关的问题，释放 token 空间
- ❌ 缺点：可能丢失一些有用的历史信息

### Level 3: 模型切换策略

当错误次数达到高阈值时，系统会尝试切换到备用模型：

**实现原理**：

```typescript
async executeLevel3Strategy(error: Error, context: ErrorContext): Promise<RecoveryResult> {
  const { fallbackModels, maxSwitches } = this.config.modelSwitching;

  // 检查切换次数限制
  if (this.status.modelSwitchCount >= maxSwitches) {
    return {
      action: 'abort',
      details: {
        reason: 'Maximum model switches reached',
        strategyLevel: 'level3'
      },
      success: false
    };
  }

  // 选择下一个备用模型
  const nextModel = this.selectNextFallbackModel(
    context.currentModel,
    fallbackModels
  );

  if (!nextModel) {
    return {
      action: 'abort',
      details: {
        reason: 'No fallback models available',
        strategyLevel: 'level3'
      },
      success: false
    };
  }

  // 更新状态
  this.status.modelSwitchCount++;
  this.status.currentModel = nextModel;
  this.status.statistics.totalModelSwitches++;
  this.status.statistics.recoveryByLevel.level3++;

  this.emit('modelSwitch', {
    fromModel: context.currentModel,
    toModel: nextModel,
    switchCount: this.status.modelSwitchCount
  });

  return {
    action: 'switch_model',
    details: {
      reason: 'Error threshold reached, switching to fallback model',
      switchedToModel: nextModel,
      strategyLevel: 'level3'
    },
    success: true
  };
}
```

**切换逻辑**：

1. 从备用模型列表中选择下一个模型
2. 跳过当前正在使用的模型
3. 验证新模型的可用性
4. 更新状态并通知监听器
5. 使用新模型重试任务

**使用场景**：

- 当前模型能力不足导致任务失败
- 模型特定的兼容性问题
- 长时间连续错误表明当前模型不适合当前任务

**优缺点**：

- ✅ 优点：解决模型能力或兼容性问题
- ❌ 缺点：可能增加成本，不同模型可能有不同的行为

## 错误恢复策略详解

### 错误分类

战斗模式将错误分为两类：

1. **recovery 错误**：可恢复的错误，战斗模式会尝试自动恢复
2. **fatal 错误**：致命错误，通常需要用户干预，战斗模式会直接中止

### 恢复失败处理

当恢复策略执行失败时，战斗模式会：

1. 记录失败原因
2. 返回 `action: 'abort'` 的恢复结果
3. 将 `success` 设置为 `false`
4. 在 `details.reason` 中说明失败原因

示例：

```typescript
{
  action: 'abort',
  details: {
    reason: 'Recovery failed: Context cleanup resulted in empty history'
  },
  success: false
}
```

### 边界情况处理

战斗模式对各种边界情况都有完善的处理：

1. **对话历史为空**：Level 2 策略会检测并拒绝执行
2. **无备用模型**：Level 3 策略会直接中止
3. **达到切换限制**：不再尝试模型切换
4. **配置无效**：使用默认配置并发出警告
5. **管理器已销毁**：抛出错误并拒绝所有操作

## 最佳实践

### 1. 合理设置阈值

根据任务复杂度和模型稳定性调整阈值：

- **简单任务**：可以设置较低阈值（level1: 2, level2: 4）
- **复杂任务**：建议使用默认值（level1: 3, level2: 5）
- **不稳定环境**：可以设置较高阈值（level1: 5, level2: 8）

### 2. 配置合适的备用模型

备用模型列表应该：

- 包含不同提供商的模型，避免单一提供商故障
- 按优先级排序，最可靠的模型在前
- 考虑成本，平衡性能和成本

示例：

```typescript
fallbackModels: [
	"claude-3-5-sonnet-20241022", // 性能优先
	"gpt-4o", // 平衡选择
	"gemini-1.5-pro", // 备用方案
]
```

### 3. 监控和日志

建议在生产环境中：

- 记录所有战斗模式事件
- 定期检查统计信息
- 分析失败模式并优化配置

### 4. 适度使用

战斗模式不是万能的，对于以下情况应该禁用：

- 需要严格错误处理的场景
- 错误需要人工干预的场景
- 成本敏感且预算有限的场景

### 5. 测试和验证

在启用战斗模式前：

- 在测试环境充分测试各种错误场景
- 验证恢复策略的有效性
- 确保不会引入新的问题

## 故障排除

### 问题 1: 战斗模式没有生效

**可能原因**：

- `enabled` 配置为 `false`
- 调用了 `deactivate()` 方法
- 错误上下文不完整

**解决方法**：

- 检查配置是否正确启用
- 检查 `isActive()` 方法返回值
- 确保错误上下文包含必需字段

### 问题 2: 上下文清理后任务失败

**可能原因**：

- 清理过于激进导致上下文不足
- 保留了错误的上下文
- 清理规则不适合当前任务

**解决方法**：

- 调整 `maxMessagesToRemove` 参数
- 检查 `keepLastUserMessage` 和 `keepLastSystemMessage` 设置
- 根据任务特点自定义清理策略

### 问题 3: 模型切换后仍然失败

**可能原因**：

- 所有备用模型都有相同的问题
- 问题不在模型，而在其他方面
- 切换次数限制已达到

**解决方法**：

- 检查备用模型配置是否合理
- 分析错误日志找出根本原因
- 考虑增加 `maxSwitches` 限制

### 问题 4: 性能下降

**可能原因**：

- 战斗模式执行频繁
- 上下文清理开销大
- 模型切换增加延迟

**解决方法**：

- 提高错误阈值减少触发频率
- 优化上下文清理逻辑
- 考虑禁用模型切换或减少备用模型数量

## 性能影响

战斗模式对性能的影响主要体现在：

1. **错误检测**：几乎没有影响（< 1ms）
2. **Level 1 恢复**：几乎无影响（仅记录日志）
3. **Level 2 恢复**：轻微影响（取决于对话历史长度，通常 10-50ms）
4. **Level 3 恢复**：中等影响（模型切换验证，通常 100-500ms）

总体来说，战斗模式的性能开销很小，对用户体验几乎没有影响。

## 限制和注意事项

1. **模型切换成本**：每次模型切换都会增加 API 调用成本
2. **上下文丢失**：Level 2 恢复会丢失部分对话历史
3. **不保证成功**：战斗模式尽力恢复，但不保证一定成功
4. **配置复杂性**：需要根据具体场景调整配置参数
5. **调试难度**：自动恢复可能使问题定位更困难

## 未来改进

计划在未来版本中添加：

1. **更智能的错误分析**：基于机器学习的错误模式识别
2. **自定义恢复策略**：允许用户实现自己的恢复策略
3. **学习模式**：根据历史数据自动优化配置
4. **可视化界面**：提供战斗模式运行状态的可视化展示
5. **更细粒度的控制**：允许为不同类型错误设置不同策略

## 相关文档

- [战斗模式架构设计](./openspec/changes/add-battle-mode/design.md)
- [战斗模式实现任务](./openspec/changes/add-battle-mode/tasks.md)
- [API 文档](./src/core/battle-mode/README.md)
