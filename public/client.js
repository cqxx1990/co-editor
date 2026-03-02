// client.js - Co-Editor 客户端逻辑

class CoEditor {
  constructor() {
    this.socket = null;
    this.editor = document.getElementById('editor');
    this.connectionStatus = document.getElementById('connection-status');
    this.usersCount = document.getElementById('users-count');
    this.lastSaved = document.getElementById('last-saved');

    this.isComposing = false; // 是否在中文输入中
    this.lastContent = ''; // 记录上一次内容
    this.throttleTimer = null; // 节流定时器
    this.throttleDelay = 300; // 300ms 节流

    this.init();
  }

  init() {
    this.connectSocket();
    this.bindEvents();
  }

  // 连接 Socket.io
  connectSocket() {
    this.socket = io({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    // 连接成功
    this.socket.on('connect', () => {
      console.log('✅ 已连接到服务器');
      this.updateConnectionStatus(true);

      // 如果有本地内容，请求同步服务器
      if (this.editor.textContent) {
        this.socket.emit('sync-request');
      }
    });

    // 断开连接
    this.socket.on('disconnect', () => {
      console.log('❌ 与服务器断开连接');
      this.updateConnectionStatus(false);
    });

    // 重连尝试
    this.socket.io.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 重连中... (${attemptNumber})`);
      this.connectionStatus.textContent = `重连中 (${attemptNumber})`;
      this.connectionStatus.className = 'status offline';
    });

    // 重连成功
    this.socket.io.on('reconnect', () => {
      console.log('✅ 重连成功');
      this.socket.emit('sync-request');
    });

    // 接收初始状态
    this.socket.on('init', (data) => {
      console.log('📥 收到初始内容');
      this.setEditorContent(data.content);
      this.lastContent = data.content;
      this.updateLastSaved(data.updated_at);
      if (data.usersCount !== undefined) {
        this.usersCount.textContent = `👥 ${data.usersCount} 用户`;
      }
    });

    // 同步服务器内容
    this.socket.on('sync', (data) => {
      console.log('🔄 同步服务器内容');
      this.setEditorContent(data.content);
      this.lastContent = data.content;
      this.updateLastSaved(data.updated_at);
    });

    // 接收其他客户端的操作
    this.socket.on('operation', (data) => {
      console.log('📥 收到操作:', data);
      this.applyOperation(data);
    });

    // 操作确认
    this.socket.on('operation-ack', (data) => {
      this.updateLastSaved(data.timestamp);
    });

    // 用户加入
    this.socket.on('user-joined', (data) => {
      console.log(`👥 用户加入: ${data.usersCount} 用户`);
      this.usersCount.textContent = `👥 ${data.usersCount} 用户`;
    });

    // 用户离开
    this.socket.on('user-left', (data) => {
      console.log(`👥 用户离开: ${data.usersCount} 用户`);
      this.usersCount.textContent = `👥 ${Math.max(0, data.usersCount)} 用户`;
    });
  }

  // 绑定事件
  bindEvents() {
    const editor = this.editor;

    // 中文输入开始
    editor.addEventListener('compositionstart', () => {
      console.log('✍️ 开始输入中文');
      this.isComposing = true;
    });

    // 中文输入结束
    editor.addEventListener('compositionend', (e) => {
      console.log('✍️ 输入完成');
      this.isComposing = false;

      // 立即提交最终内容
      const currentContent = editor.textContent;
      this.submitContent(currentContent, true);
    });

    // 输入变化
    editor.addEventListener('input', (e) => {
      // 如果在中文输入中，不处理
      if (this.isComposing) return;

      const currentContent = editor.textContent;

      // 内容变化才提交
      if (currentContent !== this.lastContent) {
        // 节流提交
        this.throttleSubmit(currentContent);
      }
    });

    // 选择变化（用于计算光标位置）
    editor.addEventListener('selectionchange', this.handleSelectionChange.bind(this));

    // 粘贴事件
    editor.addEventListener('paste', (e) => {
      e.preventDefault();

      // 获取纯文本
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');

      // 插入到光标位置
      this.insertTextAtCursor(text);

      // 立即提交
      const currentContent = editor.textContent;
      this.submitContent(currentContent, true);
    });

    // 剪切事件
    editor.addEventListener('cut', (e) => {
      setTimeout(() => {
        const currentContent = editor.textContent;
        this.submitContent(currentContent, true);
      }, 0);
    });

    // 离焦事件（立即提交）
    editor.addEventListener('blur', () => {
      console.log('👀 编辑器失去焦点');
      if (this.throttleTimer) {
        clearTimeout(this.throttleTimer);
        this.throttleTimer = null;
      }
      const currentContent = editor.textContent;
      this.submitContent(currentContent, true);
    });

    // 页面关闭前提交
    window.addEventListener('beforeunload', () => {
      const currentContent = editor.textContent;
      if (currentContent !== this.lastContent) {
        // 使用 navigator.sendBeacon 或同步请求
        this.submitContent(currentContent, true, true);
      }
    });
  }

  // 节流提交
  throttleSubmit(content) {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
    }

    this.throttleTimer = setTimeout(() => {
      this.submitContent(content);
      this.throttleTimer = null;
    }, this.throttleDelay);
  }

  // 提交内容到服务器
  submitContent(content, immediate = false, sync = false) {
    if (!this.socket || !this.socket.connected) {
      console.log('⚠️ 未连接，暂不提交');
      return;
    }

    // 计算操作类型
    let operation = null;
    const oldContent = this.lastContent;

    if (!oldContent || content === '') {
      // 新建或清空
      operation = {
        type: 'set',
        text: content,
        position: 0,
        timestamp: Date.now()
      };
    } else {
      // 找出变化的起始位置
      let pos = 0;
      let i = 0;
      while (i < oldContent.length && i < content.length && oldContent[i] === content[i]) {
        i++;
        pos++;
      }

      // 判断是插入还是删除
      if (content.length > oldContent.length) {
        // 插入
        const insertedText = content.slice(pos, pos + (content.length - oldContent.length));
        operation = {
          type: 'insert',
          position: pos,
          text: insertedText,
          timestamp: Date.now()
        };
      } else if (content.length < oldContent.length) {
        // 删除
        const deletedLength = oldContent.length - content.length;
        operation = {
          type: 'delete',
          position: pos,
          length: deletedLength,
          text: '',
          timestamp: Date.now()
        };
      } else {
        // 修改
        operation = {
          type: 'set',
          text: content,
          position: 0,
          timestamp: Date.now()
        };
      }
    }

    console.log('📤 提交操作:', operation);

    // 发送到服务器
    this.socket.emit('operation', operation);

    // 更新本地记录
    this.lastContent = content;
  }

  // 应用其他客户端的操作
  applyOperation(data) {
    const currentContent = this.lastContent || this.editor.textContent;
    let newContent = '';

    if (data.type === 'set') {
      // 整体替换（需要判断是否是自己的操作）
      newContent = data.content;
    } else if (data.type === 'insert') {
      const before = currentContent.slice(0, data.position);
      const after = currentContent.slice(data.position);
      newContent = before + data.text + after;
    } else if (data.type === 'delete') {
      const before = currentContent.slice(0, data.position);
      const after = currentContent.slice(data.position + data.length);
      newContent = before + after;
    }

    // 更新编辑器内容（保留光标位置）
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const offset = this.getCaretCharacterOffsetWithin(range);

    this.setEditorContent(newContent, false);
    this.lastContent = newContent;
    this.updateLastSaved(data.updated_at);

    // 恢复光标位置
    this.setCaretPosition(offset);
  }

  // 获取光标字符位置
  getCaretCharacterOffsetWithin(range) {
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(this.editor);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  }

  // 设置光标位置
  setCaretPosition(offset) {
    const range = document.createRange();
    const selection = window.getSelection();

    let charCount = 0;
    let found = false;
    const walker = document.createTreeWalker(
      this.editor,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nodeLength = node.length;

      if (charCount + nodeLength >= offset) {
        range.setStart(node, offset - charCount);
        range.collapse(true);
        found = true;
        break;
      }

      charCount += nodeLength;
    }

    if (!found) {
      // 光标在末尾
      const lastNode = this.editor.lastChild;
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
      } else {
        range.setStart(this.editor, 0);
        range.collapse(true);
      }
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }

  // 在光标位置插入文本
  insertTextAtCursor(text) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // 移动光标到插入文本后面
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // 设置编辑器内容
  setEditorContent(content, saveSelection = true) {
    const oldContent = this.editor.textContent;

    // 内容相同则不更新
    if (oldContent === content) return;

    // 保存选择
    let offset = null;
    if (saveSelection) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        offset = this.getCaretCharacterOffsetWithin(range);
      }
    }

    // 更新内容
    this.editor.textContent = content;

    // 恢复光标位置
    if (saveSelection && offset !== null) {
      this.setCaretPosition(Math.min(offset, content.length));
    }
  }

  // 更新连接状态
  updateConnectionStatus(connected) {
    if (connected) {
      this.connectionStatus.textContent = '在线';
      this.connectionStatus.className = 'status online';
    } else {
      this.connectionStatus.textContent = '离线';
      this.connectionStatus.className = 'status offline';
    }
  }

  // 更新最后保存时间
  updateLastSaved(timestamp) {
    if (!timestamp) {
      this.lastSaved.textContent = '未保存';
      return;
    }

    const now = Date.now();
    const diff = now - timestamp;

    let text = '';
    if (diff < 1000) {
      text = '刚刚保存';
    } else if (diff < 60000) {
      text = `${Math.floor(diff / 1000)} 秒前保存`;
    } else {
      const date = new Date(timestamp);
      text = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} 保存`;
    }

    this.lastSaved.textContent = text;
  }

  // 处理选择变化
  handleSelectionChange() {
    // 可以在这里实现多人光标显示
  }
}

// 初始化编辑器
document.addEventListener('DOMContentLoaded', () => {
  window.editor = new CoEditor();
  console.log('🚀 Co-Editor 已启动');
});
