# Co-Editor 协同编辑站点

一个简单高效的多人协同编辑工具，支持实时同步、中文输入、断线重连等功能。

## ✨ 特性

- 📝 **文本编辑** - 支持文字和换行
- 🔄 **实时同步** - 多人协同编辑，内容实时同步
- 🌏 **中文支持** - 完美处理中文输入（composition events）
- 📋 **粘贴/剪切** - 纯文本粘贴，去除格式
- 🔄 **断线重连** - 自动重连，重新同步内容
- 💾 **持久化存储** - SQLite3 本地存储，重启不丢失
- ⚡ **性能优化** - 300ms 节流防抖，减少请求
- 🎨 **简洁界面** - 无缓存，纯前端实现

## 🔧 技术栈

- **后端**: Node.js + Express + Socket.io + SQLite3
- **前端**: HTML + CSS + JavaScript (原声)
- **实时通信**: Socket.io

## 📦 安装依赖

```bash
cd /Users/mac/.openclaw/workspace/co-editor
npm install
```

如果遇到 npm 缓存权限错误：
```bash
# 修复 npm 权限
sudo chown -R 501:20 "/Users/mac/.npm"

# 重新安装
npm install
```

## 🚀 启动服务

```bash
node server.js
```

服务将在 http://localhost:3000 启动

## 📖 使用说明

1. 打开浏览器访问 http://localhost:3000
2. 开始编辑内容
3. 在另一个浏览器窗口打开相同地址，看到实时同步
4. 支持中文输入、复制粘贴、删除等操作

## 🌐 生产环境部署

### WebRTC 文件共享

如果部署到外网环境，文件共享功能需要额外配置 TURN 服务器才能在 NAT/防火墙环境下正常工作。

**详细部署指南**: 请查看 [WEBRTC_DEPLOY_GUIDE.md](./WEBRTC_DEPLOY_GUIDE.md)

**快速要点**:
- ✅ 已配置免费 TURN 服务器（Open Relay Project）作为备用
- ✅ 支持连接超时和自动重试
- ✅ 详细的连接状态日志
- 💡 生产环境建议使用自建 TURN 服务器

**⭐ 一键自建 TURN 服务器（Docker）**:
```bash
cd turn && chmod +x start.sh && ./start.sh
```

**配置项目使用自建 TURN 服务器**:

编辑 `public/editor.js` 文件顶部：
```javascript
const TURN_SERVER = '123.456.789.0'; // 改为你的服务器 IP 或域名
const TURN_USER = 'coeditor';
const TURN_PASSWORD = 'turn2024pass';
```

查看详细说明：[turn/README.md](./turn/README.md)

## 🛠️ 项目结构

```
co-editor/
├── server.js          # 主服务器 + Socket.io
├── database.js        # SQLite3 封装
├── public/
│   ├── index.html     # 前端页面
│   ├── style.css      # 样式
│   └── client.js      # 客户端逻辑
├── co-editor.db       # SQLite 数据库（运行时生成）
├── package.json
├── PLAN.md            # 实现计划
└── README.md
```

## 💾 数据存储

使用 SQLite3 本地数据库存储文档内容：

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## 🔌 操作格式

### 客户端发送操作

```json
{
  "type": "insert|delete|set",
  "position": 0,
  "text": "...",
  "timestamp": 1234567890
}
```

### 服务器广播操作

```json
{
  "type": "insert",
  "position": 0,
  "text": "...",
  "content": "完整内容",
  "updated_at": 1234567890
}
```

## 🎯 核心实现

### 中文输入处理
- 使用 `compositionstart` / `compositionend` 事件
- 临时输入期间不提交
- 输入完成后才提交最终内容

### 300ms 节流防抖
- 使用 `setTimeout` 实现节流
- 累积操作，300ms 内合并提交
- 离焦时立即提交

### 长连接重连
- Socket.io 内置重连机制
- `reconnectionDelay: 1000ms`
- `reconnectionAttempts: 10`
- 重连后自动同步内容

### 操作冲突解决
- 简化版：基于位置的插入/删除
- 服务端存储最终状态
- 客户端接收完整内容同步

## 🐛 故障排查

### 端口占用
如果 3000 端口被占用，修改启动端口：
```bash
PORT=3001 node server.js
```

### npm 安装失败
清理缓存重新安装：
```bash
npm cache clean --force
npm install
```

## 📄 许可

MIT License

---

_协同编辑，连接你我 🤝_
