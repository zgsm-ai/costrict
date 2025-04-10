/*
 * @Author: czc
 * @Date: 2024-05-24 16:21:30
 * @LastEditors: czc
 * @LastEditTime: 2024-08-13 10:45:26
 * @Descripttion: Communicate with the IDE
 */

// Callback functions
export const callbacks: any = {};
export function callBackIde(action: string, params: object | null, cb?: Function) {
    console.log("[ZGSM] callBackIde start: " + action, params);
    const data: any = {
        action,
        params: params || {}
    };
    if (cb) {
        // Timestamp plus a 5-digit random number
        const cbid = Date.now() + '' + Math.round(Math.random() * 100000);
        callbacks[cbid] = cb;
        data.cbid = cbid;
    }
    (window as any).postMessageToIde(data);
}

/**
 * Register to receive action messages actively pushed by the IDE. Use ideMessageHandler to receive and process them uniformly.
 * It needs to be called on the business code side.
 * @param {function} ideMessageHandler
 */
export function registerIdeMessageListener(ideMessageHandler: Function) {
    window.addEventListener('message', event => {
        console.log("[ZGSM] receiveMessageFromIde: ", event);
        const message = event.data;
        if (message) {
            switch (message.action) {
            // The result response event after the IDE processes the corresponding action actively triggered by postMessageToIde.
            case 'ideCallback':
                (callbacks[message.cbid] || function () { })(message.data);
                delete callbacks[message.cbid];
                break;
            default:
                // Receive action messages actively pushed by the IDE (except for the ideCallback event).
                // Use receiveMessageFromIde to receive and process them uniformly.
                ideMessageHandler(message);
                break;
            }
        }
    });
}

// Initialize the configuration
export function initConfig(getConfig: Function) {
    getConfig();
}

// If vscodeApi is not null, it means it is in VSCode; otherwise, it is in JetBrains.
(window as any).vscodeApi = null;
if ((window as any).acquireVsCodeApi) {
    (window as any).vscodeApi = (window as any).acquireVsCodeApi();
}
// Compatibility handling for JetBrains
if (!(window as any).vscodeApi) {
    (window as any).HTML_BASE_URL = '.';
}

// Send a message to the IDE
(window as any).postMessageToIde = (data: any) => {
    // Fixed format: {"action": "", "params": {}}
    // This function is used to send messages to the IDE. Different IDEs inject different methods. JetBrains will modify this function.
    (window as any).vscodeApi.postMessage(data);
};