<template>
  <div class="chat-container" id="chatContainer" :class="{ 'has-chat': chatList.length }">
    <ChatList ref="chatListRef"></ChatList>
    <div class="chat-input-content">
      <div class="stop-chat" v-if="isLoading" @click="stopChat">
        <img class="notHover" src="@/assets/stop-chat-icon.svg" />
        <img class="isHover" src="@/assets/stop-chat-hover-icon.svg" />
        <span>Stop generating</span>
      </div>
      <IxPopconfirm
        placement="topCenter"
        title="Are you sure you want to clear the content?"
        :onOk="confirmClear"
        v-if="!isLoading"
      >
        <div class="clear-chat" :class="{ disabled: isLoading }" v-if="chatList.length">
          <img class="notHover" src="@/assets/clear-icon.svg" />
          <img class="isHover" src="@/assets/clear-hover-icon.svg" />
          <span>Clear conversation</span>
        </div>
      </IxPopconfirm>
      <div class="input-content">
        <div class="chat-input">
          <div class="chat-textarea">
            <Textarea
              id="inputBox"
              v-if="showInputBox"
              v-model:value="inputValue"
              :key="times"
              :auto-size="{ minRows: 3, maxRows: 8 }"
              placeholder="Enter information to start a conversation"
            >
            </Textarea>
          </div>
          <div
            class="operate-btn"
            :class="{ disbaled: !inputValue || isLoading }"
            @click="handleSubmit"
          >
            <img v-if="inputValue && !isLoading" src="@/assets/submit-icon.svg" />
            <img v-else src="@/assets/submit-disabled-icon.svg" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChatStore, useConfigStore } from '@/stores'
import { debounce } from '@/utils/common'
import { callBackIde } from '@/utils/ide'
import { scrollToBottom } from '@/utils/scroll'
import { Textarea } from 'ant-design-vue'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import ChatList from './chatList.vue'

const chatStore = useChatStore() // Use chatStore state management
const { setLoading, setInputInfo, chatList, addChat, clearChat, runChat, stopChat } = chatStore // Destructure the required methods and variables from chatStore
const isLoading = computed(() => chatStore.isLoading) // Computed property indicating whether it is currently loading

const configStore = useConfigStore() // Use configStore state management
const displayName = configStore.userInfo?.display_name

const inputValue = ref('') // The value of the input box
const times = ref(1) // Record the number of inputs
const showInputBox = ref(true) // Whether to show the input box

// Confirm to clear the chat history
const confirmClear = () => {
  clearChat()
}

// Handle the keydown event
const handleKeydown = async (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}

// Clear the input box
const setEmptyInput = async () => {
  inputValue.value = ''
}

// Get the selected code
const getSelectCode = async () => {
  return new Promise((resolve) => {
    callBackIde('ide.getSelectCode', {}, (data: any) => {
      resolve(data)
    })
  })
}

const debounceRunChat = debounce(runChat) // Debounced runChat method

// Handle the submit event
const handleSubmit = async () => {
  if (isLoading.value) return
  const message = String(inputValue.value)
  if (!message || message.trim() === '') return

  const selectCode: any = await getSelectCode()

  addChat({
    id: String(new Date().getTime() + Math.floor(Math.random() * 1000)),
    dateTime: new Date().toLocaleString(),
    text: message,
    selectCode: selectCode.code,
    isQuestion: true,
    username: displayName || '',
    isUseAgent: false,
    language: selectCode.language || ''
  })

  setInputInfo({
    prompt: message,
    code: '',
    context: '',
    key: 'normal_chat',
    actionName: '',
    language: '',
    filePath: '',
    acceptAction: '',
    ...selectCode,
    range: {
      startLine: selectCode.startLine,
      endLine: selectCode.endLine
    },
    acceptRange: {
      startLine: selectCode.startLine,
      endLine: selectCode.endLine
    }
  })
  setLoading(true)
  debounceRunChat()
  nextTick(() => {
    scrollToBottom()
    setEmptyInput()
  })
}

// Add keyboard event listener when the component is mounted
onMounted(() => {
  const inputBox = document.getElementById('inputBox')!
  inputBox && inputBox.addEventListener('keydown', handleKeydown, true)
})

// Remove keyboard event listener when the component is unmounted
onUnmounted(() => {
  const inputBox = document.getElementById('inputBox')!
  inputBox && inputBox.removeEventListener('keydown', handleKeydown, true)
})
</script>

<style scoped lang="less">
.chat-container {
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;
  overflow: hidden;
  &.has-chat {
    height: 100%;
  }
  .chat-input-content {
    padding-top: 4px;
    width: 100%;
    .guide-btn {
      display: flex;
      align-items: center;
      width: fit-content;
      height: 32px;
      line-height: 32px;
      padding: 0 12px;
      background: linear-gradient(90deg, #00b1d5 0%, #0255e4 100%);
      color: #fff;
      border-radius: 5px;
      font-size: 14px;
      margin-bottom: 12px;
      margin-left: 24px;
      cursor: pointer;
      .ix-icon {
        margin-left: 12px;
      }
    }
    .question-list {
      padding: 0 16px;
      margin-bottom: 8px;
      .question-item {
        display: flex;
        align-items: center;
        width: fit-content;
        max-width: 100%;
        height: 28px;
        padding: 0 8px;
        padding-right: 16px;
        margin-bottom: 2px;
        color: #8caae7;
        cursor: pointer;
        &:hover {
          color: #51a0f2;
        }
        .question-text {
          margin-left: 4px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }
    }
    .stop-chat,
    .clear-chat {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 82px;
      height: 28px;
      line-height: 28px;
      margin: 0 auto 8px;
      border-radius: 2px;
      background: var(--btn-bg-color);
      color: var(--btn-color);
      cursor: pointer;
      z-index: 10;
      & span {
        margin-left: 5px;
      }
      &.disabled {
        cursor: not-allowed;
      }
      .notHover {
        display: flex;
      }
      .isHover {
        display: none;
      }
      &:hover {
        color: #91bbf2;
        background: var(--btn-hover-bg-color, var(--btn-bg-color));
        .notHover {
          display: none;
        }
        .isHover {
          display: flex;
        }
      }
    }
    .input-content {
      position: relative;
      display: flex;
      align-items: center;
      flex-direction: column;
      padding: 0 16px;
      .chat-input {
        position: relative;
        display: flex;
        flex: 1;
        margin: 0 auto;
        overflow: auto;
        padding: 11px 8px 11px 0;
        position: relative;
        width: 100%;
        z-index: 2;
        border-radius: 4px;
        background: var(--vscode-widget-border, #ffffff66);
        &::before {
          content: '';
          position: absolute;
          top: 1px;
          left: 1px;
          bottom: 1px;
          right: 1px;
          border-radius: 4px;
          background-color: var(--input-bg-color);
        }
        .chat-textarea {
          height: 100%;
          position: relative;
          width: calc(100% - 42px);
          .ant-input {
            background-color: transparent !important;
            border: 0;
            box-shadow: none !important;
            color: var(--text-color) !important;
            font-size: 14px;
            line-height: normal;
            line-height: 20px;
            min-height: 28px;
            padding: 0 0 0 12px;
            outline: 0;
            resize: none;
            transition: none !important;
            width: 100%;
            &::placeholder {
              color: var(--desc-color, var(--input-color)) !important;
            }
          }
          &.show-agent {
            padding-left: 32px;
            .placeholder {
              left: 44px;
            }
          }
          .placeholder {
            position: absolute;
            top: 0;
            left: 12px;
            color: #84878c;
            font-size: 14px;
            z-index: -1;
          }
        }
        .agent-icon {
          position: absolute;
          left: 12px;
          top: 2px;
        }

        .operate-btn {
          position: absolute;
          right: 8px;
          bottom: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          border-radius: 4px;
          cursor: pointer;
          &.disbaled {
            cursor: not-allowed;
          }
        }
      }

      .agent-panel {
        position: absolute;
        top: -34px;
        left: 16px;
        width: calc(100% - 32px);
        border-radius: 4px;
        background: var(--input-bg-color);
        z-index: 10;
        .agent-panel-item {
          display: flex;
          align-items: center;
          height: 32px;
          padding: 0 12px;
          background: #0e458c;
          color: #fff;
          border-radius: 2px;
          cursor: pointer;
          font-size: 14px;
          img {
            margin-right: 8px;
          }
        }
      }
    }
  }
}
</style>
<style lang="less">
.ix-popconfirm {
  .ix-popconfirm-wrapper {
    background: var(--input-bg-color);
    color: var(--input-color);
  }
  .ix-overlay-arrow::after {
    border-top-color: var(--input-bg-color) !important;
  }
}
</style>
