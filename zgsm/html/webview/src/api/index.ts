import type { ConfigState } from '@/stores';
import { post } from '@/utils/request';

/**
 * Evaluation content
 */
interface EvaluateArgs {
    agent_name: string;
    conversation_id: string;
    rating: 'like' | 'dislike';
    message_id?: string;
}

/**
 * Submit feedback evaluation for a conversation to the backend
 */
export function feedbackChatEvaluate<T>(config: ConfigState, args: EvaluateArgs) {
    return post<T>({
        url: `${config.appConfig.chatUrl}/api/feedbacks/evaluate`,
        headers: createHeaders(config),
        data: args,
    });
}

/**
 * User used code provided by LLM, report to server for logging. Usage methods: copy, diff, ctrlc, accept
 */
export async function useCode<T>(config: ConfigState, data: any) {
    return post<T>({
        url: `${config.appConfig.chatUrl}/api/feedbacks/use_code`,
        headers: createHeaders(config),
        data,
    });
}

/**
 * Uniformly construct headers for API requests
 */
export function createHeaders(config: ConfigState, dict: Record<string, any> = {}): Record<string, any> {
    const headers = {
        "api-key": config.userInfo.token,
        "ide": config.clientConfig.ide,
        "ide-version": config.clientConfig.extVersion,
        "ide-real-version": config.clientConfig.ideVersion,
        "host-ip": config.clientConfig.hostIp,
        ...dict
    };
    return headers;
}
