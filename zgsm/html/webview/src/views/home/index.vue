<!--
 * @Author: czc
 * @Date: 2024-05-23 10:26:37
 * @LastEditors: czc
 * @LastEditTime: 2024-10-14 10:15:55
 * @Descripttion:
-->
<template>
  <div class="qianliu-ai">
    <div class="intro-container" v-if="!chatList.length">
      <img class="ai-icon" src="@/assets/logo.png" />
      <p class="ai-title">ZHUGE</p>
      <p class="ai-desc">
        <span>Intelligent Programming Assistant</span>
      </p>

      <div v-if="!display_name" class="login-btn">
        <IxButton mode="primary" @click="login">Login</IxButton>
      </div>
    </div>
    <Chat v-if="display_name" />
  </div>
</template>

<script setup lang="ts">
import { addClickListener, addCopyCodeListener } from '@/hooks/useHighlightBlock'
import { useChatStore, useConfigStore } from '@/stores'
import { callBackIde, initConfig, registerIdeMessageListener } from '@/utils/ide'
import { computed, onMounted } from 'vue'
import Chat from '../chat/index.vue'
import { debounce } from '@/utils/common'

const configStore = useConfigStore()
const { setUser, getConfig, updateConfig } = configStore
const display_name = computed(() => configStore.userInfo?.display_name)

initConfig(getConfig)

const chatStore = useChatStore()
const { chatList, clearChat, setInputInfo, addChat, runChat } = chatStore

const debounceRunChat = debounce(runChat) // Debounced runChat method

/**
 * Receive messages from the IDE
 * @author zbc
 */
const receiveMessageFromIde = (message: any) => {
  switch (message.action) {
    case 'ide.logout':
      logout()
      break
    case 'ide.updateConfig':
      updateConfig(message.data)
      break
    case 'editor.codeLensButtonSend':
      console.log("editor.codeLensButtonSend:", message);
      if (!display_name.value) {
        const timer = setInterval(() => {
          if (display_name.value) {
            clearInterval(timer)
            setInputInfo({
              ...message.data,
              acceptRange: message.data.range,
              acceptAction: ''
            })
            runChat(message.data)
          }
        }, 1000)
      } else {
        setInputInfo({
          ...message.data,
          acceptRange: message.data.range,
          acceptAction: ''
        })
        runChat(message.data)
      }

      break
    default:
      break
  }
}

/**
 * Add a question
 */
const sendQuestion = (prompt: string) => {
  addChat({
    id: String(new Date().getTime() + Math.floor(Math.random() * 1000)),
    dateTime: new Date().toLocaleString(),
    text: prompt,
    isQuestion: true,
    username: display_name.value || '',
    isUseAgent: false
  })
  setInputInfo({
    prompt: prompt,
    code: '',
    context: '',
    key: 'normal_chat',
    actionName: '',
    range: null,
    acceptRange: null,
    language: '',
    filePath: '',
    acceptAction: ''
  })
  debounceRunChat()
}

// Login
const login = () => {
  callBackIde('ide.login', {}, (data: any) => {
    setUser(data)
  })
}

// Logout
const logout = () => {
  clearChat()
  setUser({})
}

// Listen for code block click events
addClickListener(sendQuestion)
// Listen for code block copy events
addCopyCodeListener()
// Listen for IDE push messages
registerIdeMessageListener(receiveMessageFromIde)

onMounted(() => {
  // Check if the token has expired. If not, log in directly and the user doesn't need to log in again.
  callBackIde('ide.checkToken', {}, (data: any) => {
    setUser(data)
  })
})
</script>

<style scoped lang="less">
.ix-spin {
  height: 100%;
  :deep(.ix-spin-spinner) {
    background: transparent;
    .ix-spin-spinner-tip {
      color: #007acc;
    }
  }
  :deep(.ix-spin-container) {
    height: 100%;
  }
}
.qianliu-ai {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-bottom: 24px;
  .intro-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    height: 100%;
    flex: 1;
    padding: 80px 16px 0;
    .ai-icon {
      width: 100px;
      height: 100px;
      margin-bottom: 8px;
    }
    .ai-title {
      font-size: 20px;
      line-height: 34px;
      font-weight: 600;
      margin-bottom: 5px;
    }
    .ai-desc {
      color: var(--desc-color, var(--text-color));
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      line-height: 24px;
      font-size: 14px;
    }
    .shortcut-keys-item {
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 24px;
      margin-bottom: 10px;
      color: var(--desc-color, var(--text-color));
      font-size: 14px;
      .shortcut-keys {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 24px;
        border-radius: 2px;
        background: var(--btn-bg-color);
        color: var(--btn-color);
        margin-left: 4px;
      }
    }
  }
  .login-btn {
    margin-top: 20px;
  }
}
</style>
