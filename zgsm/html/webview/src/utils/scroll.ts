export function scrollToBottom() {
    const chatList = document.getElementById("chatList");
    if (chatList) {
        chatList.scrollTop = chatList.scrollHeight;
    }
}