// Build a random string with a fixed structure as the unique ID for the conversation
export function getUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0,
            v = c == 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// Return a random string
export function getRandomId() {
    return 'xxxxxxxx'.replace(/[x]/g, function (c) {
        const r = (Math.random() * 16) | 0,
            v = c == 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// Mask the phone number for display
export function maskPhoneNumber(phone: string): string {
    // Use a regular expression to replace the middle four digits with asterisks
    return phone.replace(/(\+86)(\d{3})\d{4}(\d{4})/, '$2****$3');
}

// Debounce function
export function debounce(fn: Function, delay = 300) {
    let timer: any = null;
    return function (...args: any[]) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            fn.apply(this, args);
            timer = null;
        }, delay);
    };
}

// Throttle function
export function throttle(fn: Function, delay = 300) {
    let timeout: any = null;
    let lastArgs: any = null;

    return function (...args: any[]) {
        if (timeout === null) {
            fn(...args);
            timeout = setTimeout(() => {
                timeout = null;
                if (lastArgs) {
                    fn(lastArgs);
                    lastArgs = null;
                }
            }, delay);
        } else {
            lastArgs = args;
        }
    };
}