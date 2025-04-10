<template>
  <div id="chatList" class="chat-list" v-if="chatList.length">
    <div
      class="chat-item"
      :class="{ answer: !item.isQuestion, hidden: !item.text }"
      v-for="(item, index) in chatList"
      :key="item.id || index"
    >
      <div class="item-content" v-if="item.text">
        <div
          class="user-info"
          @click="toggleAnswer(item)"
          :class="{ 'is-answer': !item.isQuestion }"
        >
          <div class="name-icon" v-if="item.isQuestion">
            <img src="@/assets/question-icon.svg" />
          </div>
          <div class="name-icon" v-else>
            <img v-if="item.usericon" :src="item.usericon" />
            <img v-else src="@/assets/answer-icon.png" />
          </div>
          <div class="question-name" v-if="item.isQuestion">{{ item.username }}</div>
          <div class="answer-name" v-else>
            <span class="name-text">{{ item.username?.split('|')[0] }}</span>
            <template v-if="item.username?.split('|')[0] !== 'ZGSM'">
              <span class="name-hr" v-if="item.username?.split('|')[1]"></span>
              <span class="name-tips">{{ item.username?.split('|')[1] }}</span>
            </template>
          </div>
          <div
            class="toggle-anwser"
            v-if="!item.isQuestion"
            :title="item.hideAnswer ? 'Expand' : 'Collapse'"
          >
            <IxIcon
              class="toggle-icon"
              :name="item.hideAnswer ? 'caret-down-filled' : 'caret-up-filled'"
            />
          </div>
        </div>
        <div class="question-tips" v-if="item.isQuestion && item.inputInfo?.actionName">
          <span class="question-tips-text">{{ item.inputInfo?.actionName }}:</span>
          <span class="question-tips-text">{{ item.inputInfo?.tooltip }}</span>
        </div>
        <div
          v-if="item.isQuestion"
          class="text-content markdown-body is-question"
          :class="{
            'show-part': item.showToggle && !item.showAll
          }"
        >
          <div :class="{ 'form-ide': item.isFromIde }" v-html="handleQuestion(item)"></div>
          <p v-if="item.selectCode">Selected code is:</p>
          <div v-if="item.selectCode" class="form-ide" v-html="handleSelectCode(item)"></div>
        </div>

        <div class="toggle-question" v-if="item.showToggle" @click="item.showAll = !item.showAll">
          <span>{{ item.showAll ? 'Collapse' : 'Expand' }}</span>
          <IxIcon
            class="toggle-icon"
            :name="item.showAll ? 'caret-up-filled' : 'caret-down-filled'"
          />
        </div>

        <div
          class="text-content markdown-body"
          :id="`chatIndex-${index}`"
          v-if="!item.isQuestion"
          v-show="!item.hideAnswer"
          v-html="item.text"
        ></div>

        <div
          class="evaluate-content"
          v-if="
            !isLoading &&
            !item.isQuestion &&
            !item.hideAnswer &&
            !['composePoem', 'writingCulture'].includes(item.inputInfo?.key || '')
          "
        >
          <div
            class="like-btn evaluate-btn"
            :class="{ active: item.isLike }"
            @click="evaluateChat(item, 'like')"
          >
            <IxIcon name="like-filled" />
          </div>
          <div
            class="dislike-btn evaluate-btn"
            :class="{ active: item.isDislike }"
            @click="evaluateChat(item, 'dislike')"
          >
            <IxIcon name="dislike-filled" />
          </div>
        </div>
      </div>
    </div>
    <div class="chat-item answer loading-content" v-if="isLoading">
      <img class="loading-icon" src="@/assets/answer-loading-icon.png" />
      <span class="loading-text">Generating...</span>
    </div>
    <div class="chat-item answer quick-link" v-if="!isLoading && adviseList.length > 0">
      <span class="loading-text">You may also want to:</span>
      <div>
        <p>
          <a href="sendQuestion" v-for="(item, index) in adviseList" :key="index" :title="item.prompt">
            {{ item.title }}
            <span v-if="adviseList.length > 1 && index < adviseList.length - 1"> | </span>
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { feedbackChatEvaluate } from '@/api'
import { useChatStore, useConfigStore, type Chat } from '@/stores'
import { mdi } from '@/utils/markdown'
import { computed } from 'vue'

const chatStore = useChatStore()
const { chatList, makeMarkedResponse } = chatStore
const isLoading = computed(() => chatStore.isLoading)
const adviseList = computed(() => chatStore.advises)

const configStore = useConfigStore()

// Function to handle questions
const handleQuestion = (item: Chat) => {
  let allText = item.text
  // If there is selected code, append it to the text
  if (item.selectCode) {
    allText = allText + '\n' + item.selectCode
  }
  // If the number of text lines exceeds 4, show the toggle button
  if (allText.split('\n').length > 4) {
    item.showToggle = true
  }
  // Call different rendering functions depending on whether it is from the IDE
  if (item.isFromIde) {
    return makeMarkedResponse(item.text, true, item.language)
  } else {
    return mdi.render(item.text)
  }
}

// Function to handle selected code
const handleSelectCode = (item: Chat) => {
  return makeMarkedResponse(item.selectCode || '', true, item.language)
}

// Chat evaluation
const evaluateChat = (item: Chat, type: 'like' | 'dislike') => {
  if (type === 'like') {
    // If already liked, return
    if (item.isLike) return
    item.isDislike = false
    item.isLike = true
  } else {
    // If already disliked, return
    if (item.isDislike) return
    item.isDislike = true
    item.isLike = false
  }
  try {
    // Feedback on chat evaluation
    feedbackChatEvaluate(configStore, {
      agent_name: item.username || '',
      conversation_id: item.inputInfo?.conversation_id || '',
      message_id: item.messageId || '',
      rating: type
    })
  } catch (error) {
    console.log(error)
  }
}

// Expand or collapse the answer
const toggleAnswer = (item: Chat) => {
  if (item.isQuestion) return
  item.hideAnswer = !item.hideAnswer
  document.getElementById('#app')?.click()
}
</script>

<style scoped lang="less">
.chat-list {
  width: 100%;
  height: 100%;
  padding-top: 12px;
  overflow: auto;
  .chat-item {
    position: relative;
    width: 100%;
    padding: 12px;
    background-color: rgb(136 136 136 / 0.1);
    margin-bottom: 8px;
    &.answer {
      .user-info {
        user-select: none;
        .name-icon {
          background: none;
        }
        .toggle-anwser {
          margin-left: auto;
          cursor: pointer;
        }
        &.is-answer {
          cursor: pointer;
        }
      }
      .question-tips {
        margin-bottom: 0;
      }
    }
    &.hidden {
      display: none;
    }
    .user-info {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      .name-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 20px;
        background: #007acc;
        color: #fff;
        font-weight: 600;
        margin-right: 12px;
        font-size: 17px;
        img {
          width: 100%;
          height: 100%;
        }
      }
      .question-name {
        font-size: 14px;
        font-weight: 600;
      }
      .answer-name {
        display: flex;
        align-items: center;
        line-height: 18px;
        font-size: 14px;
        font-weight: 600;
        .name-text {
          font-weight: 600;
        }
        .name-hr {
          width: 1px;
          height: 14px;
          margin: 0 10px;
          background: var(--border-color);
        }
        .name-tips {
          font-size: 12px;
          color: var(--desc-color, var(--text-color));
        }
      }
    }
    .question-tips {
      display: flex;
      align-items: center;
      line-height: 20px;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .text-content {
      font-size: 14px;
      line-height: 20px;
    }
    .evaluate-content {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      .evaluate-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 5px;
        border-radius: 2px;
        margin-right: 12px;
        margin-top: 12px;
        color: var(--desc-color, var(--text-color));
        font-size: 16px;
        cursor: pointer;
        &:hover {
          opacity: 0.8;
        }
        &.active {
          color: #61a0f2;
        }
      }
    }

    .toggle-question {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: -4px;
      margin-top: 8px;
      color: var(--text-color);
      cursor: pointer;
      .toggle-icon {
        margin-left: 5px;
      }
    }
  }
  .loading-content {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 52px;
    color: var(--text-color);
    margin-top: 8px;
    .loading-icon {
      width: 16px;
      height: 16px;
      margin-right: 12px;
      animation: loading 1s linear infinite;
    }
  }
}

@keyframes loading {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
