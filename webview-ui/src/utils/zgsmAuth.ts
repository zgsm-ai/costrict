import { vscode } from './vscode';
import { ApiConfiguration } from '../../../src/shared/api';
import { getZgsmAuthUrl } from '../oauth/urls';

/**
 * 生成 ZGSM 认证链接
 * @param uriScheme URI 方案
 * @returns 认证链接
 */
export function generateZgsmAuthUrl(uriScheme?: string): string {
  const stateId = Math.random().toString(36).substring(2) + Date.now().toString(36);
  return getZgsmAuthUrl(stateId, uriScheme);
}

/**
 * 发起 ZGSM 登录认证流程
 * @param apiConfiguration API 配置
 * @param uriScheme URI 方案
 */
export function initiateZgsmLogin(apiConfiguration: ApiConfiguration, uriScheme?: string): void {
  const authUrl = generateZgsmAuthUrl(uriScheme);
  // 发送消息到扩展，处理认证流程
  vscode.postMessage({ 
    type: 'zgsmLogin',
    authUrl,
    apiConfiguration
  });
} 