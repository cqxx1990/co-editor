# Co-Editor 协同编辑站点

## 需求
- 文本编辑（文字+换行）
- 粘贴、剪切、覆盖处理
- 中文输入（composition events）
- 长链接重连、退出处理
- 300ms 节流防抖
- SQLite3 本地存储
- 重启不丢失

## 技术选型
- **后端**: Node.js + Express + Socket.io + SQLite3
- **前端**: HTML + CSS + JavaScript (contenteditable + Composition API)
- **协同算法**: 简化版操作广播（基于位置）

## 项目结构
```
co-editor/
├── server.js          # 主服务器 + Socket.io
├── database.js        # SQLite3 封装
├── public/
│   ├── index.html     # 前端页面
│   ├── style.css      # 样式
│   └── client.js      # 客户端逻辑
├── package.json
├── co-editor.db       # SQLite 数据库（运行时生成）
└── README.md
```

## 数据结构
### 数据库表
```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 操作消息格式
```json
{
  "type": "insert|delete|set",
  "position": 0,
  "text": "...",
  "timestamp": 1234567890
}
```

## 实现要点

### 1. 中文输入处理
- 使用 `compositionstart` / `compositionend` 事件
- 临时文字期间不提交
- `compositionend` 时提交最终内容

### 2. 长连接重连
- Socket.io 内置重连机制
- 连接恢复后同步完整状态
- 保活 ping/pong

### 3. 300ms 节流防抖
- 使用 lodash.throttle 或自实现
- 累积操作，300ms 内合并提交
- 离焦时立即提交

### 4. 操作冲突
- 简化版：基于位置的插入/删除
- 广播给所有客户端
- 服务端存储最终状态

### 5. 粘贴处理
- `paste` 事件拦截
- 提取纯文本（去除格式）
- 插入到光标位置

## 安装依赖
```bash
npm init -y
npm install express socket.io sqlite3 better-sqlite3 lodash
```

## 启动
```bash
node server.js
```

访问 http://localhost:3000
