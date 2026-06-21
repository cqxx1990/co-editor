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

// =============================
// 断点续传
// =============================
// 内存 resumeStore：小文件（≤ RESUME_MEM_LIMIT）直接存内存
const resumeStore = new Map();
const STALL_TIMEOUT = 10000;   // 10秒无进展视为卡住
const MAX_RESUME_RETRIES = 10; // 最大重试次数
const RESUME_MEM_LIMIT = 50 * 1024 * 1024;  // ≤50MB 放内存
const RESUME_IDB_EXPIRY = 24 * 60 * 60 * 1000; // IndexedDB 缓存过期：24小时

// =============================
// IndexedDB 续传缓存（大文件）
// =============================
const IDB_NAME = 'co-editor-resume';
const IDB_VERSION = 1;
const IDB_STORE = 'chunks';
let _idb = null;

function openResumeDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'fileHash' });
      }
    };
    req.onsuccess = () => { _idb = req.result; resolve(_idb); };
    req.onerror = () => reject(req.error);
  });
}

async function idbSave(entry) {
  const db = await openResumeDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbLoad(fileHash) {
  const db = await openResumeDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(fileHash);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(fileHash) {
  const db = await openResumeDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(fileHash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll() {
  const db = await openResumeDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbClearAll() {
  const db = await openResumeDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 清理过期的 IndexedDB 缓存（超过 24 小时）
async function idbCleanExpired() {
  try {
    const all = await idbGetAll();
    const now = Date.now();
    let cleaned = 0;
    for (const entry of all) {
      if (now - (entry.lastActive || 0) > RESUME_IDB_EXPIRY) {
        await idbDelete(entry.fileHash);
        cleaned++;
      }
    }
    if (cleaned > 0) console.log(`[Resume] Cleaned ${cleaned} expired IndexedDB entries`);
  } catch (e) {
    console.warn('[Resume] Failed to clean expired entries:', e);
  }
}

// 判断文件是用内存还是 IndexedDB
function useIndexedDB(totalSize) {
  return totalSize > RESUME_MEM_LIMIT;
}

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
  throttleDelay: 1500,
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
const pendingLocalFolderAdds = new Map(); // clientTempId -> { name, files: File[] }

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

// 计算文件 SHA-256 hash（大文件使用部分采样）
async function computeFileHash(file) {
  const MAX_FULL_HASH = 100 * 1024 * 1024; // 100MB
  const SAMPLE = 2 * 1024 * 1024;          // 2MB
  let data;
  if (file.size <= MAX_FULL_HASH) {
    data = await file.arrayBuffer();
  } else {
    const first = new Uint8Array(await file.slice(0, SAMPLE).arrayBuffer());
    const last  = new Uint8Array(await file.slice(-SAMPLE).arrayBuffer());
    const sizeBuf = new Uint8Array(8);
    new DataView(sizeBuf.buffer).setFloat64(0, file.size);
    const combined = new Uint8Array(first.length + last.length + 8);
    combined.set(first, 0);
    combined.set(last, first.length);
    combined.set(sizeBuf, first.length + last.length);
    data = combined.buffer;
  }
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 保存断点续传进度（自动选择内存/IndexedDB）
async function saveResumeProgress(session) {
  const hash = session.fileHash;
  if (!hash || !session.recv) return;

  const totalSize = session.recv.expectedSize || 0;
  const entry = {
    fileHash: hash,
    fileId: session.fileId,
    received: session.recv.received,
    totalSize,
    name: session.recv.name,
    mime: session.recv.mime,
    retryCount: (session._retryCount || 0),
    lastActive: Date.now()
  };

  if (useIndexedDB(totalSize)) {
    // 大文件：把 chunks 合并为单个 ArrayBuffer 存 IndexedDB
    try {
      const merged = mergeChunks(session.recv.chunks);
      entry.blob = merged;   // 存为 ArrayBuffer
      entry.storage = 'idb';
      await idbSave(entry);
      console.log(`[Resume/IDB] Saved progress: ${formatBytes(entry.received)} / ${formatBytes(totalSize)}`);
    } catch (e) {
      console.error('[Resume/IDB] Failed to save:', e);
    }
  } else {
    // 小文件：存内存
    entry.chunks = session.recv.chunks.slice();
    entry.storage = 'mem';
    resumeStore.set(hash, entry);
    console.log(`[Resume/Mem] Saved progress: ${formatBytes(entry.received)} / ${formatBytes(totalSize)}`);
  }
}

// 加载断点续传进度
async function loadResumeProgress(fileHash, totalSize) {
  // 先查内存
  if (resumeStore.has(fileHash)) {
    return resumeStore.get(fileHash);
  }
  // 再查 IndexedDB
  try {
    const entry = await idbLoad(fileHash);
    if (entry && entry.blob) {
      // 恢复为 chunks 数组
      entry.chunks = [entry.blob];
      delete entry.blob;
    }
    return entry;
  } catch (e) {
    console.warn('[Resume] Failed to load from IndexedDB:', e);
    return null;
  }
}

// 删除断点续传进度
async function deleteResumeProgress(fileHash) {
  resumeStore.delete(fileHash);
  try { await idbDelete(fileHash); } catch {}
}

// 合并 chunks 为单个 ArrayBuffer
function mergeChunks(chunks) {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(new Uint8Array(c), offset);
    offset += c.byteLength;
  }
  return merged.buffer;
}

// 清理会话但保留 resume 数据
function cleanupSessionForResume(session) {
  if (session.stallTimer) { clearInterval(session.stallTimer); session.stallTimer = null; }
  if (session.timeoutId) { clearTimeout(session.timeoutId); session.timeoutId = null; }
  if (session.dc) { try { session.dc.close(); } catch {} }
  if (session.pc) { try { session.pc.close(); } catch {} }
  rtcSessions.delete(session.key);
}

// 调度断点续传重试
function scheduleResume(session) {
  if (session.retryScheduled || session.completed) return;
  session.retryScheduled = true;
  const meta = session.meta;
  if (!meta) return;
  cleanupSessionForResume(session);

  // 异步保存进度后再重试
  saveResumeProgress(session).then(async () => {
    const entry = await loadResumeProgress(session.fileHash, session.recv?.expectedSize || 0);
    if (entry && entry.retryCount >= MAX_RESUME_RETRIES) {
      setFileStatus(meta.fileId, `重试次数已达上限（${MAX_RESUME_RETRIES}次），请手动重新下载`, null);
      await deleteResumeProgress(session.fileHash);
      updateResumeCacheUI();
      return;
    }
    setFileStatus(meta.fileId, '连接中断，准备断点续传...', null);
    updateResumeCacheUI();
    setTimeout(() => startDownload(meta), 2000);
  });
}

// =============================
// 续传缓存管理 UI
// =============================
function getResumeCacheContainer() {
  return document.getElementById('resume-cache-section');
}

async function updateResumeCacheUI() {
  const container = getResumeCacheContainer();
  if (!container) return;

  // 收集内存+IndexedDB 所有条目
  const entries = [];

  for (const [, v] of resumeStore) {
    entries.push({ ...v, storage: 'mem' });
  }
  try {
    const idbEntries = await idbGetAll();
    for (const e of idbEntries) {
      entries.push({ ...e, storage: 'idb' });
    }
  } catch {}

  if (entries.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  let totalCacheSize = 0;
  for (const e of entries) {
    totalCacheSize += e.received || 0;
  }

  const listHtml = entries.map(e => {
    const pct = e.totalSize ? Math.round((e.received / e.totalSize) * 100) : 0;
    const storageLabel = e.storage === 'idb' ? '磁盘' : '内存';
    const age = Date.now() - (e.lastActive || 0);
    const ageText = age < 60000 ? '刚刚' : age < 3600000 ? `${Math.floor(age / 60000)}分钟前` : `${Math.floor(age / 3600000)}小时前`;
    return `
      <div class="resume-cache-item" data-hash="${escapeHtml(e.fileHash)}">
        <div class="resume-cache-item__info">
          <span class="resume-cache-item__name" title="${escapeHtml(e.name || '未知文件')}">${escapeHtml(e.name || '未知文件')}</span>
          <span class="resume-cache-item__detail">
            ${formatBytes(e.received)} / ${formatBytes(e.totalSize)} (${pct}%)
            · ${storageLabel}
            · ${ageText}
            · 已重试 ${e.retryCount || 0} 次
          </span>
        </div>
        <button class="btn btn-danger btn-sm" data-action="delete-cache" data-hash="${escapeHtml(e.fileHash)}">删除</button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="resume-cache-header">
      <span>📦 续传缓存 (${entries.length} 个文件，共 ${formatBytes(totalCacheSize)})</span>
      <button class="btn btn-danger btn-sm" id="resume-cache-clear-all">清空全部</button>
    </div>
    <div class="resume-cache-list">${listHtml}</div>
  `;

  // 绑定事件
  container.querySelector('#resume-cache-clear-all')?.addEventListener('click', async () => {
    if (!confirm('确定清空全部续传缓存？进行中的续传将需要重新开始。')) return;
    resumeStore.clear();
    try { await idbClearAll(); } catch {}
    updateResumeCacheUI();
  });

  container.querySelectorAll('[data-action="delete-cache"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const hash = btn.dataset.hash;
      if (!hash) return;
      await deleteResumeProgress(hash);
      updateResumeCacheUI();
    });
  });
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

  // 文件夹选择
  const folderPickBtn = document.getElementById('folder-pick-btn');
  const folderPicker = document.getElementById('folder-picker');
  if (folderPickBtn && folderPicker) {
    folderPickBtn.addEventListener('click', () => folderPicker.click());
    folderPicker.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      folderPicker.value = '';
      if (!files.length) return;
      // 从 webkitRelativePath 还原文件夹名和路径
      const folderName = files[0].webkitRelativePath.split('/')[0];
      await shareFolderFromFiles(folderName, files.map(f => {
        f._folderPath = f.webkitRelativePath.replace(/^[^/]+\//, '');
        return f;
      }));
    });
  }

  // Drag & drop
  const setDrag = (on) => fileDropzone.classList.toggle('dragover', !!on);

  fileDropzone.addEventListener('dragover', (e) => { e.preventDefault(); setDrag(true); });
  fileDropzone.addEventListener('dragleave', () => setDrag(false));
  fileDropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    setDrag(false);

    const items = Array.from(e.dataTransfer?.items || []);
    const dirEntries = items
      .map(it => it.webkitGetAsEntry?.())
      .filter(entry => entry?.isDirectory);

    if (dirEntries.length) {
      for (const entry of dirEntries) await shareFolderFromEntry(entry);
      // 非文件夹的文件也处理
      const fileItems = items.filter(it => it.kind === 'file' && !it.webkitGetAsEntry?.()?.isDirectory);
      if (fileItems.length) await shareFiles(fileItems.map(it => it.getAsFile()).filter(Boolean));
    } else {
      const files = await extractFilesFromDataTransfer(e.dataTransfer);
      if (files.length) await shareFiles(files);
    }
  });

  // 文件列表点击委托
  fileListEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const action = btn.dataset.action;

    // 文件夹操作
    const folderItem = btn.closest('.folder-share-item');
    if (folderItem) {
      const folderId = folderItem.dataset.folderId;
      if (action === 'remove-folder' && folderId) {
        socket.emit('file-share-remove', { fileId: folderId });
      } else if (action === 'download-folder' && folderId) {
        const meta = sharedFiles.get(folderId);
        if (meta?.files) {
          for (const f of meta.files) {
            const fileMeta = sharedFiles.get(f.fileId) || { ...f, ownerSocketId: meta.ownerSocketId };
            await startDownload(fileMeta);
          }
        }
      } else if (action === 'toggle-folder' && folderId) {
        const body = folderItem.querySelector('.folder-share-body');
        const arrow = btn.querySelector('.folder-arrow') || btn;
        if (body) {
          const open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'block';
          btn.textContent = (open ? '▶ ' : '▼ ') + folderItem.dataset.folderName;
        }
      }
      return;
    }

    // 普通文件操作
    const fileItem = btn.closest('.file-item');
    const fileId = fileItem?.dataset?.fileId;
    if (action === 'remove' && fileId) {
      socket.emit('file-share-remove', { fileId });
    } else if (action === 'download' && fileId) {
      const meta = sharedFiles.get(fileId);
      if (meta) await startDownload(meta);
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
    const clientTempId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    pendingLocalAdds.set(clientTempId, file);

    // 获取文件显示名称（去掉路径）
    const displayName = file.fullPath ? file.fullPath : file.name;
    const isFolder = displayName.includes('/');

    // 计算文件 hash 用于断点续传标识
    let fileHash = '';
    try {
      fileHash = await computeFileHash(file);
      console.log(`[Resume] File hash for ${file.name}: ${fileHash.slice(0, 16)}...`);
    } catch (e) {
      console.warn('[Resume] Failed to compute file hash:', e);
    }

    socket.emit('file-share-add', {
      name: file.name,  // 文件名
      path: file.fullPath || file.name,  // 完整路径（如果有）
      displayName: displayName,  // 显示名称
      size: file.size,
      mime: file.type || 'application/octet-stream',
      ownerUserLabel: '我',
      clientTempId,
      isFolder: isFolder,
      hash: fileHash
    });
  }
}

async function shareFolderFromEntry(dirEntry) {
  const files = [];
  const walkEntry = async (entry, path) => {
    if (entry.isFile) {
      await new Promise(resolve => entry.file(f => { f._folderPath = path + f.name; files.push(f); resolve(); }, resolve));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = async () => {
        const entries = await new Promise(res => reader.readEntries(res));
        if (!entries?.length) return;
        for (const child of entries) await walkEntry(child, path + entry.name + '/');
        await readBatch();
      };
      await readBatch();
    }
  };
  await walkEntry(dirEntry, '');
  await shareFolderFromFiles(dirEntry.name, files);
}

async function shareFolderFromFiles(folderName, files) {
  if (!socket || !socket.connected) { alert('未连接服务器，无法分享文件夹'); return; }
  if (!files.length) return;

  const clientTempId = `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  pendingLocalFolderAdds.set(clientTempId, { name: folderName, files });

  const filesMeta = await Promise.all(files.map(async f => ({
    path: f._folderPath || f.webkitRelativePath || f.name,
    size: f.size,
    mime: f.type || 'application/octet-stream',
    hash: await computeFileHash(f).catch(() => '')
  })));

  socket.emit('file-share-add-folder', { name: folderName, files: filesMeta, clientTempId });
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

  const allEntries = Array.from(sharedFiles.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!allEntries.length) {
    fileListEl.innerHTML = '<div class="loading" style="padding: 10px;">暂无共享文件</div>';
    return;
  }

  const folders = allEntries.filter(e => e.type === 'folder');
  const plainFiles = allEntries.filter(e => e.type !== 'folder' && !e.folderId); // exclude folder-child entries

  let html = '';

  // 渲染文件夹
  for (const folder of folders) {
    const isOwner = folder.ownerSocketId === socket.id;
    html += renderFolderEntry(folder, isOwner);
  }

  // 渲染普通文件（使用现有树渲染）
  if (plainFiles.length) {
    const tree = buildFileTree(plainFiles);
    html += renderFileTree(tree);
  }

  fileListEl.innerHTML = html;
}

function renderFolderEntry(folder, isOwner) {
  const fileRows = (folder.files || []).map(f => {
    const icon = getFileIcon(f.mime);
    return `
      <div class="file-item" data-file-id="${escapeHtml(f.fileId)}" style="padding-left:16px">
        <div class="file-item__meta">
          <div class="file-item__name" title="${escapeHtml(f.path)}">${icon} ${escapeHtml(f.name || f.path.split('/').pop())}</div>
          <div class="file-item__sub">${escapeHtml(f.path)} · ${formatBytes(f.size)}</div>
          <div class="progress" style="display:none"><div></div></div>
          <div class="file-item__sub file-item__status" style="display:none"></div>
        </div>
        <div class="file-item__actions">
          <button class="btn btn-primary" data-action="download">下载</button>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="folder-share-item" data-folder-id="${escapeHtml(folder.folderId)}" data-folder-name="${escapeHtml(folder.name)}">
      <div class="file-item">
        <div class="file-item__meta" style="flex:1">
          <button class="btn btn-secondary" data-action="toggle-folder" style="text-align:left;width:100%">
            ▶ 📁 ${escapeHtml(folder.name)}
            <span style="font-size:12px;color:#888;margin-left:8px">${folder.files?.length || 0} 个文件 · ${formatBytes(folder.totalSize)}</span>
          </button>
        </div>
        <div class="file-item__actions">
          ${isOwner
            ? `<button class="btn btn-danger" data-action="remove-folder">移除</button>`
            : `<button class="btn btn-secondary" data-action="download-folder">全部下载</button>`}
        </div>
      </div>
      <div class="folder-share-body" style="display:none">${fileRows}</div>
    </div>`;
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
      // 下载方有断点续传时，由 scheduleResume 处理重试
      if (session.fileHash && session.role === 'downloader' && !session.completed) {
        // 如果 data channel 从未建立过，从 ICE 层面触发重试
        if (!session.dc || session.dc.readyState !== 'open') {
          scheduleResume(session);
        }
        // 否则让 dc.onclose 处理
      } else {
        setFileStatus(fileId, '连接失败，请重试', null);
        setTimeout(() => cleanupSession(key), 3000);
      }
    } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      console.log(`[WebRTC] Connection established for ${fileId}`);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`[WebRTC] Connection state for ${fileId}:`, pc.connectionState);
    if (pc.connectionState === 'failed') {
      if (session.fileHash && session.role === 'downloader' && !session.completed) {
        if (!session.dc || session.dc.readyState !== 'open') {
          scheduleResume(session);
        }
      } else {
        setFileStatus(fileId, '连接失败，请检查网络', null);
        setTimeout(() => cleanupSession(key), 3000);
      }
    } else if (pc.connectionState === 'disconnected') {
      if (!(session.fileHash && session.role === 'downloader')) {
        setFileStatus(fileId, '连接已断开', null);
        setTimeout(() => cleanupSession(key), 3000);
      }
    }
  };

  rtcSessions.set(key, session);
  return session;
}

async function startDownload(meta) {
  const fileId = meta.fileId;
  const owner = meta.ownerSocketId;
  const fileHash = meta.hash || '';
  if (!owner) {
    alert('缺少文件拥有者信息');
    return;
  }

  // 防止重复点击：如果已经有活跃的下载会话，且连接状态正常，则忽略
  const existingKey = sessionKey(fileId, owner);
  const existingSession = rtcSessions.get(existingKey);
  if (existingSession && existingSession.role === 'downloader' && !existingSession.completed && !existingSession.retryScheduled) {
    const dcState = existingSession.dc?.readyState;
    const pcState = existingSession.pc?.iceConnectionState;
    if (dcState === 'open' || dcState === 'connecting' || pcState === 'new' || pcState === 'checking' || pcState === 'connected') {
      console.log(`[WebRTC] Download already in progress for ${fileId}, ignoring duplicate click`);
      return;
    }
  }

  // 检查断点续传记录（内存+IndexedDB）
  let resumeEntry = null;
  if (fileHash) {
    try {
      resumeEntry = await loadResumeProgress(fileHash, meta.size || 0);
    } catch (e) {
      console.warn('[Resume] Failed to load progress:', e);
    }
  }
  if (resumeEntry) {
    if (resumeEntry.retryCount >= MAX_RESUME_RETRIES) {
      await deleteResumeProgress(fileHash);
      updateResumeCacheUI();
      setFileStatus(fileId, `重试次数已达上限（${MAX_RESUME_RETRIES}次），请手动重新下载`, null);
      return;
    }
    resumeEntry.retryCount++;
    // 更新重试计数
    if (useIndexedDB(resumeEntry.totalSize || 0)) {
      try { await idbSave({ ...resumeEntry, blob: resumeEntry.chunks ? mergeChunks(resumeEntry.chunks) : undefined }); } catch {}
    } else {
      resumeStore.set(fileHash, resumeEntry);
    }
    const pct = resumeEntry.totalSize ? resumeEntry.received / resumeEntry.totalSize : 0;
    setFileStatus(fileId, `断点续传（第${resumeEntry.retryCount}次重试）：已有 ${formatBytes(resumeEntry.received)}`, pct);
    console.log(`[Resume] Resuming ${fileId}, hash=${fileHash.slice(0, 12)}..., offset=${resumeEntry.received}, retry #${resumeEntry.retryCount}`);
  } else {
    setFileStatus(fileId, '正在建立连接...', 0);
  }

  console.log(`[WebRTC] Starting download for file: ${fileId}`);
  console.log(`[WebRTC] Connecting to owner: ${owner}`);

  // 清理旧的会话
  const oldKey = sessionKey(fileId, owner);
  if (rtcSessions.has(oldKey)) cleanupSession(oldKey);

  const session = createPeerConnection(fileId, owner, 'downloader');
  const { pc } = session;
  session.fileHash = fileHash;
  session.meta = meta;
  session.completed = false;
  session.retryScheduled = false;

  // 设置连接超时（60秒）
  const timeoutId = setTimeout(() => {
    const isConnected = pc.iceConnectionState === 'connected' || 
                       pc.iceConnectionState === 'completed' ||
                       (session.dc && session.dc.readyState === 'open');
    
    if (!isConnected) {
      console.error(`[WebRTC] Connection timeout for file: ${fileId}`);
      if (fileHash) {
        // 超时后自动重试
        scheduleResume(session);
      } else {
        setFileStatus(fileId, '连接超时，请检查网络或尝试刷新页面', null);
        cleanupSession(sessionKey(fileId, owner));
      }
    }
  }, 60000);
  
  session.timeoutId = timeoutId;
  session.connectionStartTime = Date.now();

  // downloader 创建 datachannel
  const dc = pc.createDataChannel(`file:${fileId}`, { ordered: true });
  session.dc = dc;
  wireDownloaderDataChannel(session, meta);

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

function wireDownloaderDataChannel(session, meta) {
  const { dc, fileId } = session;
  if (!dc) return;

  dc.binaryType = 'arraybuffer';

  dc.onopen = async () => {
    const elapsed = session.connectionStartTime ? Date.now() - session.connectionStartTime : 0;
    console.log(`[WebRTC] Data channel opened for ${fileId} (耗时: ${Math.round(elapsed/1000)}秒)`);
    
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }

    // 从断点续传恢复已有数据（可能来自内存或 IndexedDB）
    const fileHash = session.fileHash;
    let resumeEntry = null;
    try {
      resumeEntry = fileHash ? await loadResumeProgress(fileHash) : null;
    } catch (e) {
      console.warn('[Resume] Failed to load progress on channel open:', e);
    }
    if (resumeEntry && resumeEntry.received > 0) {
      session.recv.chunks = resumeEntry.chunks ? resumeEntry.chunks.slice() : [];
      session.recv.received = resumeEntry.received;
      session.recv.expectedSize = resumeEntry.totalSize || null;
      session.recv.name = resumeEntry.name || session.recv.name;
      session.recv.mime = resumeEntry.mime || session.recv.mime;
      session._retryCount = resumeEntry.retryCount || 0;
      console.log(`[Resume] Restored progress: ${formatBytes(resumeEntry.received)} already received`);
    }

    const offset = session.recv.received || 0;

    // 告知上传方从哪个偏移开始发送
    dc.send(JSON.stringify({ type: 'request', offset }));

    if (offset > 0) {
      const pct = session.recv.expectedSize ? offset / session.recv.expectedSize : 0;
      setFileStatus(fileId, `断点续传：从 ${formatBytes(offset)} 继续`, pct);
    } else {
      setFileStatus(fileId, '连接已建立，等待传输...', 0);
    }

    // 启动卡住检测（10秒无进展则重试）
    session.recv.lastProgressTime = Date.now();
    session.stallTimer = setInterval(() => {
      const elapsed = Date.now() - (session.recv.lastProgressTime || Date.now());
      if (session.recv.received > 0 && elapsed > STALL_TIMEOUT && !session.completed) {
        console.warn(`[Resume] Transfer stalled for ${Math.round(elapsed / 1000)}s, retrying...`);
        scheduleResume(session);
      }
    }, 2000);

    // 记录连接类型
    setTimeout(() => {
      if (!session.pc) return;
      session.pc.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const lc = stats.get(report.localCandidateId);
            const rc = stats.get(report.remoteCandidateId);
            if (lc && rc) {
              console.log(`[WebRTC] Connection type: ${lc.candidateType} -> ${rc.candidateType}`);
            }
          }
        });
      }).catch(() => {});
    }, 1000);
  };
  
  dc.onerror = (error) => {
    console.error(`[WebRTC] Data channel error for ${fileId}:`, error);
    if (session.fileHash && !session.completed) {
      scheduleResume(session);
    } else {
      setFileStatus(fileId, '数据通道错误', null);
    }
  };
  
  dc.onclose = () => {
    console.log(`[WebRTC] Data channel closed for ${fileId}`);
    // 未完成的传输自动续传
    if (session.fileHash && !session.completed && session.recv.received > 0 &&
        session.recv.received < (session.recv.expectedSize || Infinity)) {
      scheduleResume(session);
    }
  };

  dc.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'meta') {
          session.recv.expectedSize = msg.size;
          session.recv.mime = msg.mime || 'application/octet-stream';
          session.recv.name = msg.name || 'download';
          // received & chunks 保持现有值（续传或新的 0）
          const progress = msg.size ? session.recv.received / msg.size : 0;
          setFileStatus(fileId, `接收中：${formatBytes(session.recv.received)} / ${formatBytes(msg.size)}`, progress);
          session.recv.lastProgressTime = Date.now();
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

    // binary chunk
    const buf = ev.data;
    if (buf && buf.byteLength) {
      session.recv.chunks.push(buf);
      session.recv.received += buf.byteLength;
      session.recv.lastProgressTime = Date.now();

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

  // 清除卡住检测
  if (session.stallTimer) { clearInterval(session.stallTimer); session.stallTimer = null; }

  // 清除断点续传记录（内存+IndexedDB）
  if (session.fileHash) {
    deleteResumeProgress(session.fileHash).then(() => {
      console.log(`[Resume] Cleared resume data for ${session.fileHash.slice(0, 12)}...`);
      updateResumeCacheUI();
    }).catch(() => {});
  }
  
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

  dc.onopen = () => {
    const elapsed = session.connectionStartTime ? Date.now() - session.connectionStartTime : 0;
    console.log(`[WebRTC] Uploader data channel opened for ${fileId} (耗时: ${Math.round(elapsed/1000)}秒)`);
    
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }

    // 等待下载方发送 request 消息后再开始传输
    setFileStatus(fileId, '等待下载方确认...', 0);
  };

  // 接收下载方的 request 消息（含断点偏移）
  dc.onmessage = async (ev) => {
    if (typeof ev.data !== 'string') return;
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'request') {
        const startOffset = msg.offset || 0;
        if (startOffset > 0) {
          console.log(`[Resume] Uploader: resuming from offset ${formatBytes(startOffset)}`);
        }
        await sendFileFromOffset(session, startOffset);
      }
    } catch (e) {
      console.error('[WebRTC] Error handling request:', e);
    }
  };
}

async function sendFileFromOffset(session, startOffset) {
  const { fileId, peerSocketId, dc } = session;
  const file = localFiles.get(fileId);
  if (!file) {
    console.error(`[WebRTC] Local file missing for ${fileId}`);
    setFileStatus(fileId, '本机文件缺失，无法发送', null);
    try { dc.close(); } catch {}
    return;
  }

  try {
    // 发送 meta 信息
    dc.send(JSON.stringify({
      type: 'meta',
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      resumeOffset: startOffset
    }));

    const chunkSize = 64 * 1024;
    let offset = startOffset;
    const label = peerSocketId.slice(0, 6);

    setFileStatus(fileId, `发送给 ${label}：${formatBytes(offset)} / ${formatBytes(file.size)}`, offset / file.size);

    while (offset < file.size) {
      const slice = file.slice(offset, offset + chunkSize);
      const buf = await slice.arrayBuffer();

      // 流控：避免 send buffer 堵塞
      while (dc.bufferedAmount > 4 * 1024 * 1024) {
        await new Promise((r) => setTimeout(r, 50));
      }

      dc.send(buf);
      offset += buf.byteLength;
      setFileStatus(fileId, `发送给 ${label}：${formatBytes(offset)} / ${formatBytes(file.size)}`, offset / file.size);
    }

    dc.send(JSON.stringify({ type: 'done' }));
    console.log(`[WebRTC] File transfer complete for ${fileId}`);
    setFileStatus(fileId, `发送完成：${formatBytes(file.size)}`, 1);
    
    setTimeout(() => {
      try { dc.close(); } catch {}
    }, 1000);
  } catch (error) {
    console.error(`[WebRTC] Error during file transfer:`, error);
    setFileStatus(fileId, `发送失败：${error.message}`, null);
    try { dc.close(); } catch {}
  }
}

// 尝试从 localStorage 获取密码（按文档 ID 单独存储）
const savedPassword = localStorage.getItem(`doc-password-${docId}`);

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
  const savedPassword = state.password || localStorage.getItem(`doc-password-${docId}`);
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

  // 初始化续传缓存 UI 及清理过期缓存
  idbCleanExpired().then(() => updateResumeCacheUI()).catch(() => {});
});

// 文件分享：全量列表（含普通文件和文件夹）
socket.on('file-share-list', (payload) => {
  sharedFiles.clear();
  for (const f of (payload?.files || [])) {
    if (f?.folderId && f?.type === 'folder') {
      sharedFiles.set(f.folderId, f);
    } else if (f?.fileId) {
      sharedFiles.set(f.fileId, f);
    }
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

socket.on('file-share-removed', ({ fileId, folderId }) => {
  if (folderId) {
    const meta = sharedFiles.get(folderId);
    if (meta?.files) meta.files.forEach(f => { sharedFiles.delete(f.fileId); localFiles.delete(f.fileId); });
    sharedFiles.delete(folderId);
  } else if (fileId) {
    sharedFiles.delete(fileId);
    localFiles.delete(fileId);
  }
  renderSharedFiles();
});

// 文件夹分享：新增
socket.on('file-share-folder-added', (meta) => {
  if (!meta?.folderId) return;
  sharedFiles.set(meta.folderId, meta);
  // 单独存储每个子文件，便于 WebRTC 下载查询 ownerSocketId
  for (const f of (meta.files || [])) {
    sharedFiles.set(f.fileId, { ...f, ownerSocketId: meta.ownerSocketId, folderId: meta.folderId });
  }

  if (meta.ownerSocketId === socket.id && meta.clientTempId) {
    const folderData = pendingLocalFolderAdds.get(meta.clientTempId);
    if (folderData) {
      pendingLocalFolderAdds.delete(meta.clientTempId);
      const pathToFileId = new Map(meta.files.map(f => [f.path, f.fileId]));
      for (const file of folderData.files) {
        const filePath = file._folderPath || file.webkitRelativePath || file.name;
        const fileId = pathToFileId.get(filePath);
        if (fileId) localFiles.set(fileId, file);
      }
    }
  }

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
      
      // 清理已有的上传会话，防止重复 offer 导致并行上传
      const existingSession = rtcSessions.get(key);
      if (existingSession) {
        console.warn(`[WebRTC] Cleaning up existing uploader session for ${fileId} from ${from}`);
        cleanupSession(key);
      }

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
    localStorage.removeItem(`doc-password-${docId}`);
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

  // 粘贴事件：图片 → 文件分享；文本 → 插入编辑器
  editor.addEventListener('paste', async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
      .map(i => {
        const file = i.getAsFile();
        if (!file) return null;
        const ext = i.type.split('/')[1] || 'png';
        return new File([file], `screenshot-${Date.now()}.${ext}`, { type: i.type });
      })
      .filter(Boolean);

    if (imageFiles.length) {
      e.preventDefault();
      await shareFiles(imageFiles);
      return;
    }

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

    const saveMode = document.querySelector('input[name="pwd-save"]:checked')?.value || 'remember';
    state.password = password;
    if (saveMode === 'remember') {
      localStorage.setItem(`doc-password-${docId}`, password);
    }

    joinDocument(docId, password);
  });

  // 非编辑器焦点时，粘贴文件/图片 → 文件分享
  document.addEventListener('paste', async (e) => {
    if (document.activeElement === editor) return;
    const items = Array.from(e.clipboardData?.items || []);
    const files = items
      .filter(i => i.kind === 'file')
      .map(i => {
        const file = i.getAsFile();
        if (!file) return null;
        if (i.type.startsWith('image/')) {
          const ext = i.type.split('/')[1] || 'png';
          return new File([file], `screenshot-${Date.now()}.${ext}`, { type: i.type });
        }
        return file;
      })
      .filter(Boolean);
    if (files.length) {
      e.preventDefault();
      await shareFiles(files);
    }
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
