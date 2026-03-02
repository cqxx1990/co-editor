#!/bin/bash

echo "📤 使用 sessions_spawn 发送任务给 GPT-2 Codex"
echo "开始时间: $(date)"
echo "========================================"
echo ""

cd /Users/mac/Desktop/work/co-editor

echo "正在发送任务给 GPT-2 Codex..."
echo ""

# 发送任务
node -e "
const { spawn } = require('child_process').spawn;
const path = require('path');

const task = \"/model claude-15.3 /workspace /Users/mac/.openclaw/workspace \"Co-Editor WebRTC 文件分享功能

## 功能需求
在每个文档的编辑器底部添加文件分享区域，通过 WebRTC P2P 传输实现多文件同时下载。

## 实现步骤

## 一、依赖包（已安装）
- peerjs - P2P 核心库
- peerjs-peer-server - 降级中继（可选，用于 P2P 不稳定时）
- simple-peer - 简化版 WebRTC

## 二、后端修改（server.js）

### 1. 添加 Peerjs Server（可选）
在 server.js 顶部引入：
\`\`\javascript
const { ExpressPeerServer } = require('peerjs-peer-server');
const peerServer = new ExpressPeerServer(httpServer, {
  debug: true
});
peerServer.on('connection', (data) => {
  console.log('P2P Server 连接:', data.id);
});
\`\`\`

### 2. 新增 Socket 事件

#### file-share - 分享文件/文件夹
数据结构：
{
  type: 'file-share',
  docId: '文档 ID',
  files: [
    {
      name: '文件名',
      size: 文件大小（字节）,
      type: 'application/...',
      peerId: '分享者的 Peer ID',
      blobId: '文件 Blob ID',
      modifiedAt: 修改时间'
    }
  ],
  folders: [
    {
      name: '文件夹名',
      path: './path/to/folder',
      files: [文件列表],
      shareId: '分享 ID',
      modifiedAt: 修改时间'
    }
  ]
}

#### file-download-request - 请求下载
{
  type: 'file-download-request',
  docId: '文档 ID',
  fileId: '文件 ID 或 Blob ID',
  peerId: '目标用户 Peer ID'
}

#### file-chunk - 文件分片传输
{
  type: 'file-chunk',
  docId: '文档 ID',
  fileId: '文件 ID',
  chunk: '分片数据（Base64 编码）',
  chunkIndex: 0,
  totalChunks: 10
}

#### file-progress - 更新下载进度
{
  type: 'file-progress',
  docId: '文档 ID',
  fileId: '文件 ID',
  downloaded: 100,  // 已下载字节数
  total: 1024
}

#### file-list - 获取在线文件列表
{
  type: 'file-list',
  docId: '文档 ID'
}
{
  files: [...],
  folders: [...]
}

#### file-delete - 删除文件
{
  type: 'file-delete',
  docId: '文档 ID',
  fileId: '文件 ID',
  authorId: '创建人设备 ID'
}

## 三、前端修改（editor.html + editor.js）

### 1. editor.html 底部添加结构
</main class=\"editor-container\">
  <div id=\"editor\" class=\"editor\" contenteditable=\"true\" placeholder=\"开始输入...\"></div>


  \"文件分享区域\" id=\"file-share-area\">
    <div class=\"file-share-header\">
      <h3>📂 文件分享</h3>
      <button class=\"btn btn-primary\" onclick=\"openFileSelector()\">+ 选择文件</button>
    </div>

    <div class=\"file-share-content\">
      <div class=\"files-section\">
        <h4>我的文件</h4>
        <div id=\"my-files\" class=\"file-list\">
          <!-- 动态显示分享的文件 -->
        </div>
      </div>

      <div class="files-section\">
        <h4>在线文件</h4>
        <div id=\"shared-files\" class=\"file-list\">
          <!-- 显示其他用户分享的文件 -->
        </div>
      </div>
    </div>
  </div>
</main>

### 2. editor.js 文件分享逻辑

// Peerjs 连接
const peer = new Peer({ debug: 2 });

peer.on('open', (id) => {
  console.log('✅ P2P 连接建立:', id);
  
  // 连接成功后请求在线文件列表
  socket.emit('file-list', { docId: 当前文档 ID });
});

// 文件选择（使用 input[type=\"file\"] 和 input[type=\"file\"][webkitdirectory]，并递归读取文件）
async function handleFileSelect(files) {
  const fileArray = Array.from(files);
  
  for (const file of fileArray) {
    const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    // 发送文件元数据到服务器
    socket.emit('file-share', {
      docId: 当前文档 ID,
      files: [{
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        blobId: fileId,
        modifiedAt: Date.now()
      }]
    });
  }
}

// 打开文件选择器
function openFileSelector() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.webkitdirectory = true; // 支持文件夹
  input.click();
}

// 文件下载
async function downloadFile(fileId, fileName) {
  socket.emit('file-download-request', { docId, fileId });
  
  // 显示下载进度
  const progressId = 'progress-' + fileId;
  createProgressUI(progressId, fileName);
}

// 接收文件数据并下载
socket.on('file-download-data', async (data) => {
  const { docId, fileId, fileData, fileName } = data;
  
  // Blob 对象
  const byteCharacters = atob(fileData);
  const byteNumbers = new Array(byteCharacters.length)
    .map(char => byteCharacters.charCodeAt(0));
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray]);
  
  // 创建下载链接
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'download';
  document.body.appendChild(a);
  a.click();
  
  // 释放 URL
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
  
  // 更新进度
  updateProgress('progress-' + fileId, 100, progress-download-status-' + fileId);
});

// 显示文件列表
socket.on('file-list', (data) => {
  const sharedFilesDiv = document.getElementById('shared-files');
  const myFilesDiv = document.getElementById('my-files');
  
  // 清空列表
  sharedFilesDiv.innerHTML = '';
  myFilesDiv.innerHTML = '';
  
  // 显示在线文件
  data.files.forEach(file => {
    const ext = getIconClass(file.type);
    const icon = getIcon(ext);
    
    sharedFilesDiv.innerHTML += \`
      <div class=\"file-item\">
        <div class=\"file-icon\" \${icon}\</div>
        <div class=\"file-info\">
          <div class=\"file-name\">\${file.name}</div>
          <div class=\"file-meta\">
            <span>\${formatSize(file.size)}\</span>
            <span>\${file.modifiedAt ? formatDate(file.modifiedAt) : dateToolt('
            '}\${file.modifiedAt
            ')}
          </span>
            <span class=\\"file-author\"\>分享者：${file.peerId.substring(0, 8)}...</span>
          </div>
        </div>
        <div class=\"file-download\">
          <button class=\"btn btn-sm btn-primary\" onclick=\"downloadFile('${file.fileId}', '${file.name}')\">
            <span>&#x1F4C4;</span> 下载
          </button>
        </div>
      </div>
    \`;
  });
});

// 删除文件
socket.on('file-deleted', (data) => {
  alert('文件已删除');
  loadFilesList();
});

// 辅助函数
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  return date.toLocaleDateString('zh-CN');
}

function getIcon(type) {
  if (type.includes('text')) return '📄';
  if (type.includes('image')) return '🖼️';
  if (type.includes('video')) return '🎬';
  if (type.includes('audio')) return '🎵';
  if (type.includes('pdf')) return '📑';
  if (type.includes('zip') || type.includes('rar') || type.includes('压缩')) return '📦';
  return '📄';
}

// 创建进度UI
function createProgressUI(progressId, fileName) \ {
  \`\`\`
  \`\`\`</div>
}
\`\`
}
\`\`