// server.js - Co-Editor 服务器 (v2)
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const CoEditorDB = require('./database');

const app = express();

// 从环境变量读取消 HTTPS 配置
let server;
let protocol = 'http';
const httpsEnabled = process.env.HTTPS_ENABLED === 'true';

if (httpsEnabled) {
  try {
    const keyPath = path.resolve(process.env.HTTPS_KEY_PATH || './certs/privkey.pem');
    const certPath = path.resolve(process.env.HTTPS_CERT_PATH || './certs/cert.pem');

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      throw new Error(`证书文件不存在: ${keyPath} 或 ${certPath}`);
    }

    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };

    server = https.createServer(options, app);
    protocol = 'https';
    console.log(`✅ HTTPS 已启用，证书: ${keyPath}`);
  } catch (err) {
    console.error(`❌ HTTPS 启动失败，回退到 HTTP: ${err.message}`);
    server = http.createServer(app);
    protocol = 'http';
  }
} else {
  server = http.createServer(app);
  protocol = 'http';
}

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 10000,
  pingInterval: 5000,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 管理后台密码（硬编码或环境变量）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 初始化数据库
const db = new CoEditorDB(process.env.DB_PATH);

// 简单哈希函数
function simpleHash(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 文档房间管理
function getRoomId(docId) {
  return `doc:${docId}`;
}

// WebRTC 文件分享：docId -> Map(fileId -> meta)
const fileSharesByDoc = new Map();
function getFileShareMap(docId) {
  if (!fileSharesByDoc.has(docId)) fileSharesByDoc.set(docId, new Map());
  return fileSharesByDoc.get(docId);
}

// HTTP API - 文档列表
app.get('/api/documents', (req, res) => {
  const userId = req.query.user_id || req.headers['x-user-id'];
  const docs = db.listDocuments(userId);
  res.json({ success: true, documents: docs });
});

// HTTP API - 创建文档
app.post('/api/documents', (req, res) => {
  const { id, password, creator_id } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: '缺少文档 ID' });
  }

  if (!creator_id) {
    return res.status(400).json({ success: false, error: '缺少创建人 ID' });
  }

  const passwordHash = password ? simpleHash(password) : null;
  const result = db.createDocument(id, creator_id, passwordHash);

  if (result.success) {
    res.json({ success: true, document: db.getDocumentMeta(id) });
  } else {
    res.status(400).json(result);
  }
});

// HTTP API - 删除文档（仅创建者可删）
app.delete('/api/documents/:id', (req, res) => {
  const { id } = req.params;
  const creatorId = req.body?.creator_id || req.headers['x-creator-id'];

  const docMeta = db.getDocumentMeta(id);
  if (!docMeta) {
    return res.status(404).json({ success: false, error: '文档不存在' });
  }

  if (!creatorId || docMeta.creator_id !== creatorId) {
    return res.status(403).json({ success: false, error: '无权限删除该文档' });
  }

  const result = db.deleteDocument(id);
  res.json(result);
});

// HTTP API - 更新文档密码
app.put('/api/documents/:id/password', (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  const passwordHash = password ? simpleHash(password) : null;
  const result = db.updateDocumentSettings(id, passwordHash);

  res.json(result);
});

// HTTP API - 管理后台登录
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: '密码错误' });
  }
});

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log(`👤 客户端连接: ${socket.id}`);

  // 房间管理
  let currentDocId = null;
  let currentRoom = null;

  // WebRTC 文件分享：每个 doc 维护一个共享文件表
  // file: { fileId, name, size, mime, ownerSocketId, ownerUserLabel, createdAt }
  // 说明：这里只存元数据，实际文件通过 WebRTC DataChannel 点对点传输

  // 加入文档房间
  socket.on('join-document', (data) => {
    const { docId, password, user_id } = data;

    if (!docId) {
      socket.emit('error', { message: '缺少文档 ID' });
      return;
    }

    // 验证文档是否存在
    const docMeta = db.getDocumentMeta(docId);
    if (!docMeta) {
      socket.emit('error', { message: '文档不存在' });
      return;
    }

    // 如果有密码保护，需要验证
    const needsPassword = docMeta.password_hash && docMeta.password_hash.length > 0;

    console.log(`🔐 文档 ${docId} 密码验证:`);
    console.log(`   - password_hash 存在: ${!!docMeta.password_hash}`);
    console.log(`   - password_hash 长度: ${docMeta.password_hash?.length || 0}`);
    console.log(`   - 提供的密码: ${password ? '是 (' + password.length + ' 字符)' : '否'}`);
    console.log(`   - is_public: ${docMeta.is_public}`);
    console.log(`   - needsPassword: ${needsPassword}`);

    if (needsPassword) {
      // 检查密码
      if (!password) {
        console.log(`❌ 需要密码但未提供，发送 password-required`);
        socket.emit('password-required', { docId });
        return;
      }

      const passwordHash = simpleHash(password);
      console.log(`   - 计算的密码哈希: ${passwordHash.substring(0, 10)}...`);
      console.log(`   - 存储的密码哈希: ${docMeta.password_hash.substring(0, 10)}...`);

      if (!db.verifyPassword(docId, passwordHash)) {
        console.log(`❌ 密码验证失败`);
        socket.emit('error', { message: '密码错误' });
        return;
      }

      console.log(`✅ 密码验证成功`);
    } else {
      console.log(`✅ 文档 ${docId} 是公开的，无需密码`);
    }

    // 记录文档访问
    const userId = user_id || socket.id;
    db.recordAccess(docId, userId);

    // 获取文档内容
    const doc = db.getDocument(docId);
    const initialContent = doc ? doc.content : '';

    // 更新当前房间
    const newRoom = getRoomId(docId);

    // 如果在之前房间里，先离开
    if (currentRoom && currentRoom !== newRoom) {
      socket.leave(currentRoom);
      const usersCount = io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
      socket.to(currentRoom).emit('user-left', {
        userId: socket.id,
        usersCount: usersCount
      });
    }

    // 加入新房间
    currentDocId = docId;
    currentRoom = newRoom;
    socket.join(currentRoom);

    // 发送初始状态
    socket.emit('init', {
      content: initialContent,
      created_at: docMeta.created_at,
      updated_at: docMeta.updated_at,
      usersCount: io.sockets.adapter.rooms.get(currentRoom)?.size || 0
    });

    // 发送当前文档的共享文件列表（元数据）
    const shareMap = getFileShareMap(docId);
    socket.emit('file-share-list', {
      files: Array.from(shareMap.values())
    });

    // 广播新用户加入
    socket.to(currentRoom).emit('user-joined', {
      userId: socket.id,
      usersCount: io.sockets.adapter.rooms.get(currentRoom)?.size || 0
    });

    console.log(`📄 用户 ${socket.id} 加入文档: ${docId}`);
  });

  // 接收操作
  socket.on('operation', (data) => {
    if (!currentDocId || !currentRoom) {
      return;
    }

    // 操作格式: { type: 'insert|delete|set', position: 0, text: '...', timestamp: 12345 }
    console.log(`📝 操作: ${socket.id} -> ${currentDocId}: ${JSON.stringify(data)}`);

    // 保存到数据库
    let newContent = '';

    if (data.type === 'set') {
      newContent = data.text;
    } else {
      const currentDoc = db.getDocument(currentDocId);
      const currentContent = currentDoc ? currentDoc.content : '';

      if (data.type === 'insert') {
        const before = currentContent.slice(0, data.position);
        const after = currentContent.slice(data.position);
        newContent = before + data.text + after;
      } else if (data.type === 'delete') {
        const before = currentContent.slice(0, data.position);
        const after = currentContent.slice(data.position + data.length);
        newContent = before + after;
      }
    }

    const result = db.saveDocument(currentDocId, newContent);

    if (result.success) {
      // 广播给其他客户端（不包括发送者）
      socket.to(currentRoom).emit('operation', {
        ...data,
        updated_at: result.updated_at
      });

      // 回复发送者确认
      socket.emit('operation-ack', {
        timestamp: result.updated_at
      });
    }
  });

  // 请求同步（重连后调用）
  socket.on('sync-request', () => {
    if (!currentDocId) return;

    const doc = db.getDocument(currentDocId);
    const docMeta = db.getDocumentMeta(currentDocId);

    socket.emit('sync', {
      content: doc ? doc.content : '',
      created_at: docMeta?.created_at || Date.now(),
      updated_at: docMeta?.updated_at || Date.now(),
      usersCount: currentRoom ? io.sockets.adapter.rooms.get(currentRoom)?.size || 0 : 0
    });
  });

  // WebRTC 文件分享：新增共享文件（只存元数据）
  socket.on('file-share-add', (payload) => {
    if (!currentDocId || !currentRoom) return;
    const { name, path, displayName, size, mime, ownerUserLabel, clientTempId, isFolder } = payload || {};
    if (!name || typeof size !== 'number') return;

    const fileId = crypto.randomBytes(12).toString('hex');
    const meta = {
      fileId,
      name,
      path: path || name,  // 完整路路径
      displayName: displayName || name,
      size,
      mime: mime || 'application/octet-stream',
      ownerSocketId: socket.id,
      ownerUserLabel: ownerUserLabel || '',
      clientTempId: clientTempId || null,
      isFolder: isFolder || false,  // 是否包含文件夹结构
      createdAt: Date.now(),
      docId: currentDocId
    };

    const shareMap = getFileShareMap(currentDocId);
    shareMap.set(fileId, meta);

    // 广播元数据到房间
    io.to(currentRoom).emit('file-share-added', meta);
  });

  socket.on('file-share-remove', (payload) => {
    if (!currentDocId || !currentRoom) return;
    const { fileId } = payload || {};
    if (!fileId) return;

    const shareMap = getFileShareMap(currentDocId);
    const meta = shareMap.get(fileId);
    if (!meta) return;

    // 仅拥有者可删除
    if (meta.ownerSocketId !== socket.id) return;

    shareMap.delete(fileId);
    io.to(currentRoom).emit('file-share-removed', { fileId });
  });

  // WebRTC 信令转发：to 为目标 socket.id
  socket.on('webrtc-signal', (payload) => {
    const { to, data, fileId } = payload || {};
    if (!to || !data) return;

    io.to(to).emit('webrtc-signal', {
      from: socket.id,
      fileId: fileId || null,
      data
    });
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`👋 客户端断开: ${socket.id}`);

    // 清理该 socket 在当前文档中分享的文件
    if (currentDocId) {
      const shareMap = getFileShareMap(currentDocId);
      const removed = [];
      for (const [fileId, meta] of shareMap.entries()) {
        if (meta.ownerSocketId === socket.id) {
          shareMap.delete(fileId);
          removed.push(fileId);
        }
      }
      if (removed.length && currentRoom) {
        for (const fileId of removed) {
          socket.to(currentRoom).emit('file-share-removed', { fileId });
        }
      }
    }

    if (currentRoom) {
      const usersCount = io.sockets.adapter.rooms.get(currentRoom)?.size - 1 || 0;
      socket.to(currentRoom).emit('user-left', {
        userId: socket.id,
        usersCount: usersCount
      });
    }
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', count: io.sockets.sockets.size });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Co-Editor v2 服务运行在 ${protocol}://localhost:${PORT}`);
  console.log(`💾 数据库: co-editor.db`);
  console.log(`🔐 管理后台: ${protocol}://localhost:${PORT}/admin.html (密码: ${ADMIN_PASSWORD})`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭服务...');
  db.close();
  server.close(() => {
    console.log(' ✅ 服务已关闭');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 正在关闭服务...');
  db.close();
  server.close(() => {
    console.log(' ✅ 服务已关闭');
    process.exit(0);
  });
});
