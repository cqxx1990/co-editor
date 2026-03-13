// editor.js - 编辑器逻辑

// =============================
// 用户标识
// =============================

// 生成设备 ID
const deviceId = localStorage.getItem('co-editor-device-id') || generateDeviceId();

function generateDeviceId() {
  const id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('co-editor-device-id', id);
  return id;
}

// =============================
// WebRTC 配置
// =============================

// TURN 服务器配置（部署时修改此处）
const TURN_SERVER = 'share.wuyuan.tech'; // 修改为你的服务器域名或 IP
const TURN_USER = 'co-editor-user';
const TURN_PASSWORD = 'oa90GJlg3lad.g3l;';

console.log('[WebRTC] 🚀 生产模式：使用 STUN + TURN 服务器');
console.log(`[WebRTC] TURN 服务器: ${TURN_SERVER}`);

const RTC_CONFIG = {
  iceServers: [
    // STUN 服务器（用于 NAT 穿透）
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // 自建 TURN 服务器（优先级最高）
    {
      urls: `turn:${TURN_SERVER}:3478`,
      username: TURN_USER,
      credential: TURN_PASSWORD
    },
    {
      urls: `turn:${TURN_SERVER}:3478?transport=tcp`,
      username: TURN_USER,
      credential: TURN_PASSWORD
    },
    // 免费备用 TURN 服务器（当自建服务器不可用时）
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceTransportPolicy: 'all', // 尝试所有可用的连接方式
  iceCandidatePoolSize: 10 // 预先收集候选
};

const socket = io();
const editor = document.getElementById('editor');
const connectionStatus = document.getElementById('connection-status');
const usersCount = document.getElementById('users-count');
const lastSaved = document.getElementById('last-saved');
const currentDocIdSpan = document.getElementById('current-doc-id');

// 从 URL 获取文档 ID
const docId = window.location.hash.slice(1) || '';
let currentRoom = null;

if (!docId) {
  window.location.href = '/';
} else {
  currentDocIdSpan.textContent = docId;
}

// 状态
const state = {
  isComposing: false,
  lastContent: '',
  throttleDelay: 300,
  throttleTimer: null,
  password: null,
  initialized: false  // 是否已收到服务器初始内容
};

// =============================
// WebRTC 文件分享
// =============================
const fileDropzone = document.getElementById('file-dropzone');
const fileListEl = document.getElementById('file-list');
const filePicker = document.getElementById('file-picker');
const filePickBtn = document.getElementById('file-pick-btn');

// server 侧共享列表（元数据）
const sharedFiles = new Map(); // fileId -> meta

// 本机实际文件（仅拥有者保存，用于发送）
const localFiles = new Map(); // fileId -> File
const pendingLocalAdds = new Map(); // clientTempId -> File

// WebRTC 会话：key = `${fileId}:${peerSocketId}`
const rtcSessions = new Map();

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const fixed = i === 0 ? 0 : (v < 10 ? 2 : 1);
  return `${v.toFixed(fixed)} ${units[i]}`;
}

// HTML 转义，防止 XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function ensureFileShareUI() {
  if (!fileDropzone || !fileListEl) return;

  // 文件选择
  if (filePickBtn && filePicker) {
    filePickBtn.addEventListener('click', () => filePicker.click());
    filePicker.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      filePicker.value = '';
      if (files.length) await shareFiles(files);
    });
  }

  // Drag & drop
  const setDrag = (on) => {
    fileDropzone.classList.toggle('dragover', !!on);
  };

  fileDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    setDrag(true);
  });
  fileDropzone.addEventListener('dragleave', () => setDrag(false));
  fileDropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    setDrag(false);

    const files = await extractFilesFromDataTransfer(e.dataTransfer);
    if (files.length) await shareFiles(files);
  });

  // 使用事件委托处理文件列表点击（避免重复绑定）
  fileListEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const action = btn.dataset.action;
    const fileItem = btn.closest('.file-item');
    const fileId = fileItem?.dataset?.fileId;

    if (action === 'remove' && fileId) {
      socket.emit('file-share-remove', { fileId });
    } else if (action === 'download' && fileId) {
      const meta = sharedFiles.get(fileId);
      if (meta) {
        await startDownload(meta);
      }
    }
  });
}

async function extractFilesFromDataTransfer(dt) {
  if (!dt) return [];

  // 支持文件夹拖拽（Chromium / WebKit）
  const items = Array.from(dt.items || []);
  const hasEntries = items.some((it) => typeof it.webkitGetAsEntry === 'function');

  if (!hasEntries) {
    return Array.from(dt.files || []);
  }

  const outFiles = [];

  const walkEntry = async (entry, path = '') => {
    if (!entry) return;

    if (entry.isFile) {
      await new Promise((resolve) => {
        entry.file((file) => {
          // 保存完整路径
          file.fullPath = path + file.name;
          outFiles.push(file);
          resolve();
        }, resolve);
      });
      return;
    }

    if (entry.isDirectory) {
      const reader = entry.createReader();
      const dirPath = path + entry.name + '/';

      const readBatch = async () => {
        const entries = await new Promise((resolve) => reader.readEntries(resolve));
        if (!entries || !entries.length) return;
        for (const child of entries) {
          await walkEntry(child, dirPath);
        }
        await readBatch();
      };
      await readBatch();
    }
  };

  for (const item of items) {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) await walkEntry(entry, '');
  }

  // fallback: 兜底补充 dt.files
  for (const f of Array.from(dt.files || [])) {
    if (!f.fullPath) f.fullPath = f.name;
    if (!outFiles.some((x) => x.name === f.name && x.size === f.size)) {
      outFiles.push(f);
    }
  }

  return outFiles;
}

async function shareFiles(files) {
  if (!socket || !socket.connected) {
    alert('未连接服务器，无法分享文件');
    return;
  }

  for (const file of files) {
    // 为本地保存建立临时关联，等待 server 分配 fileId
    const clientTempId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    pendingLocalAdds.set(clientTempId, file);

    // 获取文件显示名称（去掉路径）
    const displayName = file.fullPath ? file.fullPath : file.name;
    const isFolder = displayName.includes('/');

    socket.emit('file-share-add', {
      name: file.name,  // 文件名
      path: file.fullPath || file.name,  // 完整路径（如果有）
      displayName: displayName,  // 显示名称
      size: file.size,
      mime: file.type || 'application/octet-stream',
      ownerUserLabel: '我',
      clientTempId,
      isFolder: isFolder
    });
  }
}

/**
 * 构建文件树结构
 */
function buildFileTree(files) {
  const tree = {};

  for (const file of files) {
    const path = file.path || file.name;
    const parts = path.split('/').filter(p => p);  // 过滤空字符串

    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (!current[part]) {
        current[part] = {
          name: part,
          isFolder: !isFile,
          file: isFile ? file : null,
          children: {}
        };
      }

      if (isFile) {
        current[part].file = file;
      } else {
        current = current[part].children;
      }
    }
  }

  return tree;
}

/**
 * 渲染文件树
 */
function renderFileTree(tree, level = 0) {
  let html = '';

  for (const [name, node] of Object.entries(tree)) {
    const indent = level * 16;
    const icon = node.isFolder ? '📁' : getFileIcon(node.file?.mime || '');
    const fileId = node.file?.fileId || null;

    if (node.isFolder) {
      // 文件夹
      const folderId = `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      html += `
        <div class="file-tree-folder" data-folder-id="${folderId}" style="padding-left: ${indent}px">
          <div class="file-tree-folder-header" onclick="toggleFolder('${folderId}')">
            <span class="folder-icon">📁</span>
            <span class="folder-name">${escapeHtml(name)}</span>
            <span class="folder-arrow">▶</span>
          </div>
          <div class="file-tree-children" id="${folderId}-children" style="display: none;">
            ${renderFileTree(node.children, level + 1)}
          </div>
        </div>
      `;
    } else if (fileId) {
      // 文件
      const isOwner = node.file.ownerSocketId === socket.id;
      const ownerLabel = isOwner ? '我' : (node.file.ownerUserLabel || node.file.ownerSocketId.slice(0, 6));

      html += `
        <div class="file-item" data-file-id="${fileId}" style="padding-left: ${indent}px">
          <div class="file-item__meta">
            <div class="file-item__name" title="${escapeHtml(node.file.displayName || node.file.name)}">${escapeHtml(node.file.displayName || node.file.name)}</div>
            <div class="file-item__sub">
              <span>${icon} ${formatBytes(node.file.size)}</span>
              <span>来源: ${escapeHtml(ownerLabel)}</span>
            </div>
            <div class="progress" style="display:none"><div></div></div>
            <div class="file-item__sub file-item__status" style="display:none"></div>
          </div>
          <div class="file-item__actions">
            ${isOwner ? `<button class="btn btn-danger" data-action="remove">移除</button>` : `<button class="btn btn-primary" data-action="download">下载</button>`}
          </div>
        </div>
      `;
    }
  }

  return html;
}

/**
 * 切换文件夹展开/折叠
 */
function toggleFolder(folderId) {
  const childrenContainer = document.getElementById(`${folderId}-children`);
  const header = document.querySelector(`[data-folder-id="${folderId}"] .file-tree-folder-header`);
  const arrow = header.querySelector('.folder-arrow');
  const icon = header.querySelector('.folder-icon');

  if (childrenContainer) {
    const isExpanded = childrenContainer.style.display !== 'none';
    childrenContainer.style.display = isExpanded ? 'none' : 'block';
    arrow.textContent = isExpanded ? '▶' : '▼';
    icon.textContent = isExpanded ? '📁' : '📂';
  }
}

/**
 * 根据文件类型获取图标
 */
function getFileIcon(mimeType) {
  if (!mimeType) return '📄';

  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('7z')) return '📦';
  if (mimeType.includes('text/') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('javascript')) return '📝';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📑';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';

  return '📄';
}

function renderSharedFiles() {
  if (!fileListEl) return;

  const files = Array.from(sharedFiles.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!files.length) {
    fileListEl.innerHTML = '<div class="loading" style="padding: 10px;">暂无共享文件</div>';
    return;
  }

  // 构建文件树并渲染
  const tree = buildFileTree(files);
  const treeHtml = renderFileTree(tree);

  fileListEl.innerHTML = treeHtml;

  // 注意：移除了事件监听器的直接绑定，改为在页面初始化时使用事件委托
}

/**
 * 获取编辑器内容
 */
function getEditorTextContent() {
  return editor.value;
}

/**
 * 设置编辑器内容
 */
function setEditorTextContent(text) {
  editor.value = text || '';
}

function getFileItemEls(fileId) {
  const item = fileListEl?.querySelector(`.file-item[data-file-id="${fileId}"]`);
  if (!item) return {};
  return {
    item,
    progressWrap: item.querySelector('.progress'),
    progressBar: item.querySelector('.progress > div'),
    status: item.querySelector('.file-item__status')
  };
}

function setFileStatus(fileId, text, progress01 = null) {
  const { progressWrap, progressBar, status } = getFileItemEls(fileId);
  if (status) {
    status.style.display = text ? 'flex' : 'none';
    status.textContent = text || '';
  }
  if (progressWrap && progressBar) {
    const show = typeof progress01 === 'number';
    progressWrap.style.display = show ? 'block' : 'none';
    if (show) progressBar.style.width = `${Math.max(0, Math.min(1, progress01)) * 100}%`;
  }
}

function sessionKey(fileId, peer) {
  return `${fileId}:${peer}`;
}

function cleanupSession(key) {
  const session = rtcSessions.get(key);
  if (!session) return;
  
  console.log(`[WebRTC] Cleaning up session: ${key}`);
  
  if (session.dc) {
    try {
      session.dc.close();
    } catch (e) {
      console.error('Error closing data channel:', e);
    }
  }
  
  if (session.pc) {
    try {
      session.pc.close();
    } catch (e) {
      console.error('Error closing peer connection:', e);
    }
  }
  
  rtcSessions.delete(key);
}

function createPeerConnection(fileId, peerSocketId, role) {
  const key = sessionKey(fileId, peerSocketId);

  const pc = new RTCPeerConnection(RTC_CONFIG);
  const session = {
    key,
    fileId,
    peerSocketId,
    role,
    pc,
    dc: null,
    recv: {
      expectedSize: null,
      received: 0,
      chunks: [],
      mime: 'application/octet-stream',
      name: 'download'
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      console.log(`[WebRTC] ICE candidate for ${fileId}:`, e.candidate.type);
      socket.emit('webrtc-signal', {
        to: peerSocketId,
        fileId,
        data: { type: 'ice', candidate: e.candidate }
      });
    } else {
      console.log(`[WebRTC] ICE gathering complete for ${fileId}`);
    }
  };

  pc.onicegatheringstatechange = () => {
    console.log(`[WebRTC] ICE gathering state for ${fileId}:`, pc.iceGatheringState);
    if (pc.iceGatheringState === 'complete') {
      console.log(`[WebRTC] ICE gathering completed for ${fileId}`);
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[WebRTC] ICE connection state for ${fileId}:`, pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      setFileStatus(fileId, '连接失败，请重试', null);
      setTimeout(() => cleanupSession(key), 3000);
    } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      console.log(`[WebRTC] Connection established for ${fileId}`);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`[WebRTC] Connection state for ${fileId}:`, pc.connectionState);
    if (pc.connectionState === 'failed') {
      setFileStatus(fileId, '连接失败，请检查网络', null);
      setTimeout(() => cleanupSession(key), 3000);
    } else if (pc.connectionState === 'disconnected') {
      setFileStatus(fileId, '连接已断开', null);
      setTimeout(() => cleanupSession(key), 3000);
    }
  };

  rtcSessions.set(key, session);
  return session;
}

async function startDownload(meta) {
  const fileId = meta.fileId;
  const owner = meta.ownerSocketId;
  if (!owner) {
    alert('缺少文件拥有者信息');
    return;
  }

  setFileStatus(fileId, '正在建立连接...', 0);
  console.log(`[WebRTC] Starting download for file: ${fileId}`);
  console.log(`[WebRTC] Connecting to owner: ${owner}`);

  const session = createPeerConnection(fileId, owner, 'downloader');
  const { pc } = session;

  // 设置连接超时（60秒，给 TURN 服务器更多时间）
  const timeoutId = setTimeout(() => {
    // 检查连接是否成功建立
    const isConnected = pc.iceConnectionState === 'connected' || 
                       pc.iceConnectionState === 'completed' ||
                       (session.dc && session.dc.readyState === 'open');
    
    if (!isConnected) {
      console.error(`[WebRTC] Connection timeout for file: ${fileId}`);
      console.error(`[WebRTC] Final states - ICE: ${pc.iceConnectionState}, Connection: ${pc.connectionState}, ICE Gathering: ${pc.iceGatheringState}`);
      
      let errorMsg = '连接超时';
      if (pc.iceGatheringState !== 'complete') {
        errorMsg = '网络不稳定，无法收集连接信息';
      } else if (pc.iceConnectionState === 'failed') {
        errorMsg = '连接失败，可能需要 TURN 服务器支持';
      } else {
        errorMsg = '连接超时，请检查网络或尝试刷新页面';
      }
      
      setFileStatus(fileId, errorMsg, null);
      cleanupSession(sessionKey(fileId, owner));
      
      // 提示用户可能的解决方案
      console.warn('[WebRTC] 连接失败可能的原因：');
      console.warn('1. 双方都在严格的 NAT/防火墙后');
      console.warn('2. TURN 服务器不可用或配置错误');
      console.warn('3. 网络不稳定');
      console.warn('建议：尝试刷新页面或检查 TURN 服务器配置');
    }
  }, 60000); // 延长到 60 秒
  
  session.timeoutId = timeoutId;
  session.connectionStartTime = Date.now();

  // downloader 创建 datachannel
  const dc = pc.createDataChannel(`file:${fileId}`, { ordered: true });
  session.dc = dc;
  wireDownloaderDataChannel(session);

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    console.log(`[WebRTC] Sending offer for ${fileId}`);
    socket.emit('webrtc-signal', {
      to: owner,
      fileId,
      data: { type: 'offer', sdp: pc.localDescription }
    });
  } catch (error) {
    console.error(`[WebRTC] Error creating offer:`, error);
    setFileStatus(fileId, '连接失败：' + error.message, null);
    clearTimeout(timeoutId);
    cleanupSession(sessionKey(fileId, owner));
  }
}

function wireDownloaderDataChannel(session) {
  const { dc, fileId } = session;
  if (!dc) return;

  dc.binaryType = 'arraybuffer';

  dc.onopen = () => {
    const elapsed = session.connectionStartTime ? Date.now() - session.connectionStartTime : 0;
    console.log(`[WebRTC] Data channel opened for ${fileId} (耗时: ${Math.round(elapsed/1000)}秒)`);
    setFileStatus(fileId, '连接已建立，等待传输...', 0);
    
    // 清除超时定时器
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }
    
    // 记录连接类型（帮助诊断）
    setTimeout(() => {
      session.pc.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const localCandidate = stats.get(report.localCandidateId);
            const remoteCandidate = stats.get(report.remoteCandidateId);
            if (localCandidate && remoteCandidate) {
              console.log(`[WebRTC] Connection type: ${localCandidate.candidateType} -> ${remoteCandidate.candidateType}`);
              if (localCandidate.candidateType === 'relay' || remoteCandidate.candidateType === 'relay') {
                console.log('[WebRTC] 使用 TURN 中继连接');
              } else if (localCandidate.candidateType === 'srflx' || remoteCandidate.candidateType === 'srflx') {
                console.log('[WebRTC] 使用 STUN 穿透连接');
              } else {
                console.log('[WebRTC] 使用直接连接');
              }
            }
          }
        });
      }).catch(e => console.warn('[WebRTC] 无法获取连接统计:', e));
    }, 1000);
  };
  
  dc.onerror = (error) => {
    console.error(`[WebRTC] Data channel error for ${fileId}:`, error);
    setFileStatus(fileId, '数据通道错误', null);
  };
  
  dc.onclose = () => {
    console.log(`[WebRTC] Data channel closed for ${fileId}`);
  };

  dc.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'meta') {
          session.recv.expectedSize = msg.size;
          session.recv.mime = msg.mime || 'application/octet-stream';
          session.recv.name = msg.name || 'download';
          setFileStatus(fileId, `开始接收：0 / ${formatBytes(msg.size)}`, 0);
        } else if (msg.type === 'done') {
          // 防止重复下载：检查是否已经完成
          if (!session.recv.finalized) {
            session.recv.finalized = true;
            finalizeDownload(session);
          }
        }
      } catch {
        // ignore
      }
      return;
    }

    // binary
    const buf = ev.data;
    if (buf && buf.byteLength) {
      session.recv.chunks.push(buf);
      session.recv.received += buf.byteLength;

      const total = session.recv.expectedSize || 0;
      const p = total ? (session.recv.received / total) : null;
      setFileStatus(fileId, `接收中：${formatBytes(session.recv.received)} / ${formatBytes(total)}`, p);

      // 防止重复下载：检查是否已经完成
      if (total && session.recv.received >= total && !session.recv.finalized) {
        session.recv.finalized = true;
        finalizeDownload(session);
      }
    }
  };
}

function finalizeDownload(session) {
  const { fileId, dc, pc } = session;
  const { chunks, mime, name, expectedSize } = session.recv;

  console.log(`[WebRTC] Finalizing download for ${fileId}`);
  
  const blob = new Blob(chunks, { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = name || `file-${fileId}`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setFileStatus(fileId, `下载完成：${formatBytes(expectedSize || blob.size)}`, 1);

  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  // 清理资源
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }
  
  try { dc && dc.close(); } catch {}
  try { pc && pc.close(); } catch {}
  rtcSessions.delete(session.key);
}

function wireUploaderDataChannel(session) {
  const { fileId, peerSocketId, dc } = session;

  dc.binaryType = 'arraybuffer';
  
  dc.onerror = (error) => {
    console.error(`[WebRTC] Uploader data channel error for ${fileId}:`, error);
    setFileStatus(fileId, '发送错误', null);
  };
  
  dc.onclose = () => {
    console.log(`[WebRTC] Uploader data channel closed for ${fileId}`);
  };

  dc.onopen = async () => {
    const elapsed = session.connectionStartTime ? Date.now() - session.connectionStartTime : 0;
    console.log(`[WebRTC] Uploader data channel opened for ${fileId} (耗时: ${Math.round(elapsed/1000)}秒)`);
    
    // 清除超时定时器（如果有）
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }
    
    const file = localFiles.get(fileId);
    if (!file) {
      console.error(`[WebRTC] Local file missing for ${fileId}`);
      setFileStatus(fileId, '本机文件缺失，无法发送', null);
      try { dc.close(); } catch {}
      return;
    }

    try {
      // 先发 meta
      dc.send(JSON.stringify({
        type: 'meta',
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream'
      }));

      // 分片发送
      const chunkSize = 64 * 1024;
      let offset = 0;

      setFileStatus(fileId, `发送给 ${peerSocketId.slice(0, 6)}：0 / ${formatBytes(file.size)}`, 0);

      while (offset < file.size) {
        const slice = file.slice(offset, offset + chunkSize);
        const buf = await slice.arrayBuffer();

        // 简单流控：避免 send buffer 堵塞
        while (dc.bufferedAmount > 4 * 1024 * 1024) {
          await new Promise((r) => setTimeout(r, 50));
        }

        dc.send(buf);
        offset += buf.byteLength;
        setFileStatus(fileId, `发送给 ${peerSocketId.slice(0, 6)}：${formatBytes(offset)} / ${formatBytes(file.size)}`, offset / file.size);
      }

      dc.send(JSON.stringify({ type: 'done' }));
      console.log(`[WebRTC] File transfer complete for ${fileId}`);
      setFileStatus(fileId, `发送完成：${formatBytes(file.size)}`, 1);
      
      // 延迟关闭，确保对方收到 done 消息
      setTimeout(() => {
        try { dc.close(); } catch {}
      }, 1000);
    } catch (error) {
      console.error(`[WebRTC] Error during file transfer:`, error);
      setFileStatus(fileId, `发送失败：${error.message}`, null);
      try { dc.close(); } catch {}
    }
  };
}

// 尝试从 sessionStorage 获取密码
const savedPassword = sessionStorage.getItem(`doc-password-${docId}`);

// 不立即加入文档，等待 socket 连接成功后再加入
if (savedPassword) {
  state.password = savedPassword;
}

// 加入文档函数
function joinDocument(docId, password) {
  console.log('📄 加入文档:', docId, password ? '(有密码: ' + password.length + ' 字符)' : '(无密码)');
  console.log('📄 使用 user_id:', deviceId);
  state.initialized = false;  // 重置初始化状态，等待新的 init 事件
  editor.disabled = true;  // 禁用编辑器，等待初始化
  socket.emit('join-document', { docId, password, user_id: deviceId });
}

// Socket.io 事件处理
socket.on('connect', () => {
  console.log('✅ 已连接到服务器');
  updateConnectionStatus(true);

  // 连接成功后加入文档
  const savedPassword = state.password || sessionStorage.getItem(`doc-password-${docId}`);
  if (savedPassword) {
    console.log('🔑 使用保存的密码加入文档');
    joinDocument(docId, savedPassword);
  } else {
    console.log('📄 直接加入文档（无密码）');
    joinDocument(docId, '');
  }
});

socket.on('disconnect', () => {
  console.log('❌ 与服务器断开连接');
  updateConnectionStatus(false);
  state.initialized = false;  // 重置初始化状态
});

// Socket.IO v4 重连事件在 socket.io 管理器上触发
if (socket.io) {
  socket.io.on('reconnect_attempt', (attemptNumber) => {
    console.log(`🔄 重连中... (${attemptNumber})`);
    connectionStatus.textContent = `重连中 (${attemptNumber})`;
    connectionStatus.className = 'status offline';
  });

  socket.io.on('reconnect', () => {
    console.log('✅ 重连成功');
    if (currentRoom) {
      socket.emit('sync-request');
    }
  });
}

// 兼容旧事件名（如果服务端有自定义转发）
socket.on('io-reconnect_attempt', (attemptNumber) => {
  console.log(`🔄 重连中... (${attemptNumber})`);
  connectionStatus.textContent = `重连中 (${attemptNumber})`;
  connectionStatus.className = 'status offline';
});

socket.on('io-reconnect', () => {
  console.log('✅ 重连成功');
  if (currentRoom) {
    socket.emit('sync-request');
  }
});

socket.on('init', (data) => {
  console.log('📥 收到初始内容');
  console.log('📄 内容长度:', data.content?.length || 0);
  console.log('👥 用户数:', data.usersCount);

  showEditor();
  setEditorContent(data.content);
  state.lastContent = data.content;
  state.initialized = true;  // 标记已初始化
  editor.disabled = false;  // 启用编辑器
  editor.placeholder = '开始输入...';  // 更新提示文本
  updateUsersCount(data.usersCount);

  // 初始化文件分享 UI（需要等 editor 显示后）
  ensureFileShareUI();
});

// 文件分享：全量列表
socket.on('file-share-list', (payload) => {
  sharedFiles.clear();
  for (const f of (payload?.files || [])) {
    if (f?.fileId) sharedFiles.set(f.fileId, f);
  }
  renderSharedFiles();
});

// 文件分享：新增
socket.on('file-share-added', (meta) => {
  if (!meta?.fileId) return;
  sharedFiles.set(meta.fileId, meta);

  // 如果是我分享的文件，尝试把 fileId 与本地 File 绑定起来
  if (meta.ownerSocketId === socket.id && meta.clientTempId && pendingLocalAdds.has(meta.clientTempId)) {
    const file = pendingLocalAdds.get(meta.clientTempId);
    pendingLocalAdds.delete(meta.clientTempId);
    if (file) localFiles.set(meta.fileId, file);
  }

  renderSharedFiles();
});

socket.on('file-share-removed', ({ fileId }) => {
  if (!fileId) return;
  sharedFiles.delete(fileId);
  localFiles.delete(fileId);
  renderSharedFiles();
});

// WebRTC 信令
socket.on('webrtc-signal', async (payload) => {
  const { from, fileId, data } = payload || {};
  if (!from || !fileId || !data) return;

  const key = sessionKey(fileId, from);

  try {
    // offer: 作为发送方（拥有者）应答
    if (data.type === 'offer') {
      // 只有文件拥有者才应答
      const meta = sharedFiles.get(fileId);
      if (!meta || meta.ownerSocketId !== socket.id) {
        console.warn(`[WebRTC] Received offer but not owner of ${fileId}`);
        return;
      }

      console.log(`[WebRTC] Received offer for ${fileId} from ${from}`);
      
      const session = createPeerConnection(fileId, from, 'uploader');
      const { pc } = session;
      session.connectionStartTime = Date.now();

      pc.ondatachannel = (ev) => {
        console.log(`[WebRTC] Data channel received for ${fileId}`);
        session.dc = ev.channel;
        wireUploaderDataChannel(session);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log(`[WebRTC] Sending answer for ${fileId}`);
      socket.emit('webrtc-signal', {
        to: from,
        fileId,
        data: { type: 'answer', sdp: pc.localDescription }
      });
      return;
    }

    // answer: downloader 设置远端描述
    if (data.type === 'answer') {
      const session = rtcSessions.get(key);
      if (!session) {
        console.warn(`[WebRTC] Received answer but no session for ${fileId}`);
        return;
      }
      console.log(`[WebRTC] Received answer for ${fileId}`);
      await session.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      return;
    }

    // ICE
    if (data.type === 'ice') {
      const session = rtcSessions.get(key);
      if (!session) {
        console.warn(`[WebRTC] Received ICE candidate but no session for ${fileId}`);
        return;
      }
      try {
        await session.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log(`[WebRTC] Added ICE candidate for ${fileId}:`, data.candidate.type);
      } catch (e) {
        console.error(`[WebRTC] Error adding ICE candidate:`, e);
      }
    }
  } catch (error) {
    console.error(`[WebRTC] Error handling signal for ${fileId}:`, error);
    setFileStatus(fileId, '信令处理失败：' + error.message, null);
  }
});

socket.on('sync', (data) => {
  console.log('🔄 同步服务器内容');
  setEditorContent(data.content);
  state.lastContent = data.content;
  updateUsersCount(data.usersCount);
  updateLastSaved(data.updated_at);
});

socket.on('operation', (data) => {
  console.log('📥 收到操作:', data);
  applyOperation(data);
});

socket.on('operation-ack', (data) => {
  updateLastSaved(data.timestamp);
});

socket.on('user-joined', (data) => {
  console.log(`👥 用户加入: ${data.usersCount} 用户`);
  updateUsersCount(data.usersCount);
});

socket.on('user-left', (data) => {
  console.log(`👥 用户离开: ${data.usersCount} 用户`);
  updateUsersCount(data.usersCount);
});

socket.on('password-required', (data) => {
  console.log('🔒 需要密码');

  // 显示密码输入框
  document.getElementById('doc-id-display').textContent = `文档 ID: ${docId}`;
  document.getElementById('password-modal').style.display = 'flex';
  document.getElementById('password-overlay').style.display = 'flex';

  // 清空之前的错误信息
  document.getElementById('password-error').style.display = 'none';
  document.getElementById('password-input').value = '';

  // 自动聚焦密码输入框
  setTimeout(() => {
    document.getElementById('password-input').focus();
  }, 100);

  console.log('✅ 密码输入框已显示');
});

socket.on('error', (data) => {
  console.error('❌ 错误:', data.message);
  if (data.message === '密码错误') {
    document.getElementById('password-error').style.display = 'block';
    document.getElementById('password-input').value = '';
    document.getElementById('password-input').focus();

    // 清除保存的错误密码
    sessionStorage.removeItem(`doc-password-${docId}`);
    state.password = null;

    console.log('🗑️  已清除保存的密码');
  } else if (data.message.includes('文档不存在')) {
    alert('文档不存在，将返回列表');
    window.location.href = '/';
  } else {
    alert('错误: ' + data.message);
  }
});

// 绑定编辑器事件
bindEditorEvents();

function bindEditorEvents() {
  // 中文输入开始
  editor.addEventListener('compositionstart', () => {
    console.log('✍️ 开始输入中文');
    state.isComposing = true;
  });

  // 中文输入结束
  editor.addEventListener('compositionend', (e) => {
    console.log('✍️ 输入完成');
    state.isComposing = false;

    const currentContent = getEditorTextContent();
    submitContent(currentContent, true);
  });

  // 输入变化
  editor.addEventListener('input', (e) => {
    if (state.isComposing) return;

    const currentContent = getEditorTextContent();

    if (currentContent !== state.lastContent) {
      throttleSubmit(currentContent);
    }
  });

  // 粘贴事件
  editor.addEventListener('paste', (e) => {
    e.preventDefault();

    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    insertTextAtCursor(text);

    const currentContent = getEditorTextContent();
    submitContent(currentContent, true);
  });

  // 剪切事件
  editor.addEventListener('cut', (e) => {
    setTimeout(() => {
      const currentContent = getEditorTextContent();
      submitContent(currentContent, true);
    }, 0);
  });

  // 离焦事件
  editor.addEventListener('blur', () => {
    console.log('👀 编辑器失去焦点');
    if (state.throttleTimer) {
      clearTimeout(state.throttleTimer);
      state.throttleTimer = null;
    }
    const currentContent = getEditorTextContent();
    submitContent(currentContent, true);
  });

  // 密码表单
  document.getElementById('password-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const password = document.getElementById('password-input').value;
    if (!password) {
      alert('请输入密码');
      return;
    }

    state.password = password;
    sessionStorage.setItem(`doc-password-${docId}`, password);

    joinDocument(docId, password);
  });

  // 分享模态框 - 点击外部关闭
  const shareModal = document.getElementById('share-modal');
  if (shareModal) {
    shareModal.addEventListener('click', (e) => {
      if (e.target.id === 'share-modal') {
        closeShareModal();
      }
    });
  }
}

function throttleSubmit(content) {
  if (state.throttleTimer) {
    clearTimeout(state.throttleTimer);
  }

  state.throttleTimer = setTimeout(() => {
    submitContent(content);
    state.throttleTimer = null;
  }, state.throttleDelay);
}

function submitContent(content, immediate = false) {
  if (!socket || !socket.connected) {
    console.log('⚠️ 未连接，暂不提交');
    return;
  }

  // 防止在收到初始内容前提交（避免用空内容覆盖服务器）
  if (!state.initialized) {
    console.log('⚠️ 尚未初始化，暂不提交');
    return;
  }

  const oldContent = state.lastContent || '';
  
  // 内容没有变化，不提交
  if (content === oldContent) {
    return;
  }

  let operation = null;

  // 使用双端比较找出变化的精确位置
  // 从前往后找到第一个不同的位置
  let start = 0;
  while (start < oldContent.length && start < content.length && oldContent[start] === content[start]) {
    start++;
  }

  // 从后往前找到最后一个不同的位置
  let oldEnd = oldContent.length;
  let newEnd = content.length;
  while (oldEnd > start && newEnd > start && oldContent[oldEnd - 1] === content[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  // 计算删除和插入的内容
  const deletedLength = oldEnd - start;
  const insertedText = content.slice(start, newEnd);

  if (deletedLength === 0 && insertedText.length > 0) {
    // 纯插入
    operation = {
      type: 'insert',
      position: start,
      text: insertedText,
      timestamp: Date.now()
    };
  } else if (deletedLength > 0 && insertedText.length === 0) {
    // 纯删除
    operation = {
      type: 'delete',
      position: start,
      length: deletedLength,
      timestamp: Date.now()
    };
  } else if (deletedLength > 0 && insertedText.length > 0) {
    // 替换操作（先删后插）
    operation = {
      type: 'replace',
      position: start,
      length: deletedLength,
      text: insertedText,
      timestamp: Date.now()
    };
  } else {
    // 不应该到这里，但以防万一
    console.log('⚠️ 无法计算差异，跳过提交');
    return;
  }

  console.log('📤 提交操作:', operation.type, 'pos:', operation.position, 
              deletedLength > 0 ? 'del:' + deletedLength : '', 
              insertedText ? 'ins:' + JSON.stringify(insertedText.substring(0, 20)) : '');
  socket.emit('operation', operation);
  state.lastContent = content;
}

function applyOperation(data) {
  const currentContent = state.lastContent || getEditorTextContent();
  let newContent = '';

  if (data.type === 'set') {
    // 向后兼容，但不推荐使用
    newContent = data.text;
  } else if (data.type === 'insert') {
    const before = currentContent.slice(0, data.position);
    const after = currentContent.slice(data.position);
    newContent = before + data.text + after;
  } else if (data.type === 'delete') {
    const before = currentContent.slice(0, data.position);
    const after = currentContent.slice(data.position + data.length);
    newContent = before + after;
  } else if (data.type === 'replace') {
    // 替换操作：删除一段文本后插入新文本
    const before = currentContent.slice(0, data.position);
    const after = currentContent.slice(data.position + data.length);
    newContent = before + data.text + after;
  } else {
    console.log('⚠️ 未知操作类型:', data.type);
    return;
  }

  // 保存当前光标位置并根据操作调整
  let offset = editor.selectionStart || 0;
  
  // 智能调整光标位置
  if (data.type === 'insert' && offset >= data.position) {
    // 插入操作：如果光标在插入位置之后，需要向后偏移
    offset += data.text.length;
  } else if (data.type === 'delete' && offset > data.position) {
    // 删除操作：如果光标在删除位置之后，需要向前偏移
    if (offset <= data.position + data.length) {
      // 光标在删除范围内，移到删除位置
      offset = data.position;
    } else {
      // 光标在删除范围之后
      offset -= data.length;
    }
  } else if (data.type === 'replace' && offset > data.position) {
    // 替换操作：调整光标位置
    if (offset <= data.position + data.length) {
      // 光标在替换范围内，移到替换文本末尾
      offset = data.position + data.text.length;
    } else {
      // 光标在替换范围之后
      offset = offset - data.length + data.text.length;
    }
  }

  setEditorContent(newContent, false);
  state.lastContent = newContent;
  updateLastSaved(data.updated_at);

  // 恢复调整后的光标位置
  editor.selectionStart = editor.selectionEnd = Math.min(Math.max(0, offset), newContent.length);
}

function insertTextAtCursor(text) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const currentValue = editor.value;
  
  // 在光标位置插入文本
  editor.value = currentValue.substring(0, start) + text + currentValue.substring(end);
  
  // 将光标移到插入文本的末尾
  const newPos = start + text.length;
  editor.selectionStart = editor.selectionEnd = newPos;
  
  // 聚焦编辑器
  editor.focus();
}

function setEditorContent(content, saveSelection = true) {
  const oldContent = getEditorTextContent();

  if (oldContent === content) return;

  let offset = null;
  if (saveSelection) {
    offset = editor.selectionStart;
  }

  // 设置新内容
  setEditorTextContent(content);

  // 恢复光标位置
  if (saveSelection && offset !== null) {
    editor.selectionStart = editor.selectionEnd = Math.min(offset, content.length);
  }
}

function updateConnectionStatus(connected) {
  if (connected) {
    connectionStatus.textContent = '在线';
    connectionStatus.className = 'status online';
  } else {
    connectionStatus.textContent = '离线';
    connectionStatus.className = 'status offline';
  }
}

function updateUsersCount(count) {
  usersCount.textContent = `👥 ${Math.max(0, count)} 用户`;
}

function updateLastSaved(timestamp) {
  if (!timestamp) {
    lastSaved.textContent = '未保存';
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
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    text = `${hours}:${minutes} 保存`;
  }

  lastSaved.textContent = text;
}

function showEditor() {
  console.log('🎬 显示编辑器');
  const overlay = document.getElementById('password-overlay');
  const modal = document.getElementById('password-modal');
  const container = document.getElementById('editor-container');
  const shareBtn = document.getElementById('share-btn');

  if (overlay) {
    overlay.style.display = 'none';
    console.log('✅ 隐藏密码覆盖层');
  }
  if (modal) {
    modal.style.display = 'none';
    console.log('✅ 隐藏密码模态框');
  }
  if (container) {
    container.style.display = 'flex';
    console.log('✅ 显示编辑器容器');
  }
  if (editor) {
    editor.classList.add('active');
    // 聚焦编辑器
    editor.focus();
  }
  if (shareBtn) {
    shareBtn.style.display = 'inline-block';
    console.log('✅ 显示分享按钮');
  }
}

// =============================
// 分享功能
// =============================

/**
 * 显示分享模态框
 */
function showShareModal() {
  const shareUrl = window.location.href;
  const shareUrlInput = document.getElementById('share-url');
  const shareModal = document.getElementById('share-modal');
  const copyStatus = document.getElementById('copy-status');

  shareUrlInput.value = shareUrl;
  copyStatus.style.display = 'none';
  shareModal.style.display = 'flex';

  // 生成二维码
  generateQRCode(shareUrl);
}

/**
 * 关闭分享模态框
 */
function closeShareModal() {
  const shareModal = document.getElementById('share-modal');
  shareModal.style.display = 'none';
}

/**
 * 复制分享链接
 */
function copyShareUrl() {
  const shareUrlInput = document.getElementById('share-url');
  const copyStatus = document.getElementById('copy-status');

  shareUrlInput.select();
  shareUrlInput.setSelectionRange(0, 99999); // 移动设备兼容

  try {
    navigator.clipboard.writeText(shareUrlInput.value).then(() => {
      copyStatus.style.display = 'block';
      setTimeout(() => {
        copyStatus.style.display = 'none';
      }, 2000);
    });
  } catch (err) {
    // 降级方案
    document.execCommand('copy');
    copyStatus.style.display = 'block';
    setTimeout(() => {
      copyStatus.style.display = 'none';
    }, 2000);
  }
}

/**
 * 生成二维码
 */
async function generateQRCode(url) {
  const qrCodeContainer = document.getElementById('qr-code');
  qrCodeContainer.innerHTML = '二维码生成中...';

  try {
    // 使用免费的 QRCode API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    const img = new Image();
    img.alt = '文档二维码';
    img.style.maxWidth = '100%';

    img.onload = () => {
      qrCodeContainer.innerHTML = '';
      qrCodeContainer.appendChild(img);
    };

    img.onerror = () => {
      qrCodeContainer.innerHTML = '二维码生成失败';
    };

    img.src = qrUrl;
  } catch (error) {
    console.error('生成二维码失败:', error);
    qrCodeContainer.innerHTML = '二维码生成失败';
  }
}

console.log('🚀 Co-Editor 编辑器已启动 ');
