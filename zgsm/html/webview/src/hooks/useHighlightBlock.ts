import { useCode } from "@/api";
import { useChatStore, useConfigStore } from '@/stores';
import { debounce } from "@/utils/common";
import { acceptSvg, clipboardSvg, diffSvg } from './const';

export function useHighlightBlock(str: string, lang?: string) {
  const chatStore = useChatStore();
  const { inputInfo } = chatStore;
  if (!lang) {
    lang = inputInfo.language;
  }

  return `<pre class="code-block-wrapper ${inputInfo.key}">
            <div class="code-block-header ${lang === 'text' ? 'hide' : ''}">
              <span class="code-block-header__lang">${lang}</span>
              <div class="button-list">
                <div class="button-item code-block-header__diff">
                  ${diffSvg}
                  <span>查看变更</span>
                </div>
                <div class="button-item code-block-header__accept">
                  ${acceptSvg}
                  <span>采纳</span>
                </div>
                <div class="button-item code-block-header__copy">
                  ${clipboardSvg}
                  <span>复制</span>
                </div>
              </div>
            </div>
            <code class="hljs code-block-body ${lang}">${str}</code>
          </pre>`;
}

// 点击事件监听
export function addClickListener(sendQuestion: Function) {
  // 点击事件
  document.addEventListener("click", async (e: any) => {
    console.log('onclick:', e);
    const linkEl = e.target.closest('a');
    if (linkEl) {
      const url = linkEl.getAttribute('href')
      const title = linkEl.getAttribute('title') || ''
      e.preventDefault(); // 阻止默认跳转行为
      if (url.includes('sendQuestion')) {
        sendQuestion(title)
      } else {
        (window as any).postMessageToIde({
          action: 'ide.jumpByPath',
          params: {
            filePath: url
          },
        });
      }
      return false;
    }
    const targetButton = e.target.closest('.button-item');
    if (!targetButton) return;
    if (targetButton?.classList?.contains("active")) return;
    e.preventDefault();

    const wrapper = e.target.closest('.code-block-wrapper');
    const outerWrapper = wrapper?.closest('.markdown-body');
    const codeWrapper = wrapper?.querySelector('.code-block-body');
    const chatIndex = Number(outerWrapper.id.split('-')[1]);

    const configStore = useConfigStore();
    const chatStore = useChatStore();
    const { chatList } = chatStore;
    const { inputInfo } = chatList[chatIndex];

    if (targetButton?.classList?.contains("code-block-header__copy")) {
      if ((window as any).vscodeApi) {
        await navigator.clipboard.writeText(codeWrapper.textContent);
      } else {
        (window as any).postMessageToIde({
          action: 'ide.useCode',
          params: {
            value: codeWrapper.textContent
          },
        });
      }

      targetButton.classList.add('active');
      targetButton.innerHTML = `${clipboardSvg}<span>复制成功</span>`;

      useCode(configStore, {
        conversation_id: inputInfo?.conversation_id,
        accept_num: codeWrapper.textContent.split("\n").length - 1,
        behavior: 'copy'
      });
      setTimeout(() => {
        targetButton.classList.remove('active');
        targetButton.innerHTML = `${clipboardSvg}<span>复制</span>`;;
      }, 3000);

      return;
    }

    if (targetButton?.classList?.contains("code-block-header__diff") || targetButton?.classList?.contains("code-block-header__accept")) {
      let action = 'ide.ideDiffCode';
      if (targetButton?.classList?.contains("code-block-header__accept")) {
        action = 'ide.insertCode';
        targetButton.classList.add('active');
        targetButton.innerHTML = `${clipboardSvg}<span>采纳成功</span>`;

        useCode(configStore, {
          conversation_id: inputInfo?.conversation_id,
          accept_num: codeWrapper.textContent.split("\n").length - 1,
          behavior: 'accept'
        });
        setTimeout(() => {
          targetButton.classList.remove('active');
          targetButton.innerHTML = `${clipboardSvg}<span>采纳</span>`;;
        }, 3000);
      } else {
        useCode(configStore, {
          conversation_id: inputInfo?.conversation_id,
          accept_num: 0,
          behavior: 'diff'
        });
      }

      const params = {
        key: inputInfo?.key || 'chat',
        actionName: inputInfo?.actionName || '',
        range: inputInfo?.acceptRange
          ? {
            startLine: inputInfo.acceptRange.startLine,
            endLine:
              inputInfo.key === 'addComment'
                ? (inputInfo?.acceptAction === 'replace' || inputInfo.language === 'python')
                  ? inputInfo.acceptRange.endLine
                  : inputInfo.acceptRange.startLine
                : inputInfo.acceptRange.endLine
          }
          : null,
        language: inputInfo?.language || null,
        filePath: inputInfo?.filePath || null,
        code: codeWrapper.textContent,
        acceptAction: inputInfo?.acceptAction || null,
      };

      console.log(params);

      (window as any).postMessageToIde({
        action,
        params,
      });
      return;
    }
  });
}

// 复制代码监听
export function addCopyCodeListener() {
  // 
  document.addEventListener('keydown', handleCopyEvent, true);

  // 阻止右键菜单弹出
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
}

// 处理复制事件的函数
function handleCopyEvent(event: KeyboardEvent) {
  if (event.ctrlKey && event.key === 'c') {
    debounceCopy();
  }
}

const debounceCopy = debounce(hanldeCopy, 300);

function hanldeCopy() {
  const selection = window.getSelection();
  if (!selection || !selection.toString()) {
    return;
  }
  const range = selection.getRangeAt(0);
  let selectedElement = range.commonAncestorContainer as HTMLElement;
  // 如果右键选中的区域正好是文本，selectedElement.closest()会因为找不到html元素而报错，可以用父节点代替
  if (selectedElement.nodeType === Node.TEXT_NODE) {
    selectedElement = selectedElement.parentNode as HTMLElement;
  }

  // 执行上传复制代码逻辑
  const answerWrapper = selectedElement.closest('.markdown-body');
  if (answerWrapper && selection) {
    const chatIndex = Number(answerWrapper.id.split('-')[1]);
    const configStore = useConfigStore();
    const chatStore = useChatStore();
    const { chatList } = chatStore;
    const { inputInfo } = chatList[chatIndex];

    useCode(configStore, {
      conversation_id: inputInfo?.conversation_id,
      accept_num: selection.toString().split("\n").length,
      behavior: 'ctrlc'
    });
  }
}