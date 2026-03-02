# 📦 Co-Editor 构建和部署说明

## 快速开始

### 构建

```bash
cd /Users/mac/Desktop/work/co-editor
yarn build
# 或直接运行
node scripts/pack.js
```

### 输出

构建完成后，会在 `dist/` 目录生成：
- `co-editor-v2.0.0.tgz` - 压缩包
- `pm2.config.js` - PM2 配置文件

---

## 📦 压缩包内容

```
co-editor-v2.0.0.tgz
├── server.js              # 主服务器
├── database.js            # 数据库封装
├── package.json           # 依赖配置
├── yarn.lock              # 依赖锁定
├── pm2.config.js          # PM2 配置（生成）
└── public/                # 前端文件
    ├── index.html         # 文档列表
    ├── editor.html        # 编辑器
    ├── admin.html         # 管理后台
    ├── style.css          # 样式
    ├── main.js            # 列表逻辑
    ├── editor.js          # 编辑器逻辑
    └── admin.js           # 后台逻辑
```

---

## 🚀 部署说明

### 1. 传输压缩包到部署平台

```bash
# 方式1: SCP
scp dist/co-editor-v2.0.0.tgz user@server:/path/to/deploy/

# 方式2: SFTP
# 上传 dist/co-editor-v2.0.0.tgz

# 方式3: 直接在其他平台下载
```

### 2. 解压

```bash
# 创建部署目录
mkdir -p /opt/co-editor
cd /opt/co-editor

# 解压
tar -xzf co-editor-v2.0.0.tgz
rm co-editor-v2.0.0.tgz
```

### 3. 安装依赖

```bash
# 使用 yarn
yarn install

# 或使用 npm
npm install
```

### 4. 修改端口（动态）

**方式1: 编辑 pm2.config.js**

```bash
vi pm2.config.js

# 找到 env.PORT: 3000，修改为需要的端口
# 例如：
#   env: {
#     NODE_ENV: 'production',
#     PORT: 8080
#   }
```

**方式2: 使用 sed 批量替换（适用于部署平台）**

```bash
# 修改端口为 8080
sed -i "s/PORT: 3000/PORT: 8080/g" pm2.config.js

# 验证
grep PORT pm2.config.js
```

**方式3: 环境变量覆盖**

```bash
# 启动时直接指定端口
PORT=8080 pm2 start pm2.config.js
```

### 5. 创建日志目录

```bash
mkdir -p /opt/co-editor/logs
```

### 6. 启动服务

```bash
# 使用 PM2 启动
pm2 start pm2.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs co-editor

# 设置开机自启
pm2 startup
pm2 save
```

### 7. 管理命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs co-editor

# 查看详细信息
pm2 show co-editor

# 重启服务
pm2 restart co-editor

# 停止服务
pm2 stop co-editor

# 删除服务
pm2 delete co-editor

# 清理日志
pm2 flush
```

---

## 🔧 PM2 配置说明

pm2.config.js 文件结构：

```javascript
module.exports = {
  apps: [{
    name: 'co-editor',              // 应用名称
    script: 'server.js',           // 启动脚本
    instances: 1,                   // 实例数（1 = 单实例，max = 全部CPU核心）
    autorestart: true,            // 自动重启
    watch: false,                  // 不监听文件变化
    max_memory_restart: '500M',   // 内存限制
    env: {
      NODE_ENV: 'production',      // 环境变量
      PORT: 3000                   // 端口（可修改）
    },
    error_file: './logs/error.log', // 错误日志
    out_file: './logs/out.log',     // 输出日志
    log_date_format: 'YYYY-MM-DD HH:mm:ss', // 日志时间格式
    merge_logs: true               // 合并日志
  }]
};
```

**重要字段说明：**

| 字段 | 说明 | 修改建议 |
|------|------|----------|
| `PORT` | 服务端口 | 修改为需要的端口号 |
| `instances` | 实例数 | 生产环境可设为 max |
| `max_memory_restart` | 内存限制 | 根据服务器配置调整 |
| `error_file` | 错误日志路径 | 确保目录存在 |
| `out_file` | 输出日志路径 | 确保目录存在 |

---

## 🔒 安全建议

1. **修改生产密码**
   ```bash
   pm2 restart co-editor --update-env
   # 或编辑 pm2.config.js 后重启
   ```

2. **使用防火墙**
   ```bash
   # 只允许必要端口访问
   ufw allow 3000/tcp
   ```

3. **使用 HTTPS**
   - 配置 Nginx 反向代理
   - 使用 Let's Encrypt 证书

4. **定期备份**
   ```bash
   # 备份数据库
   cp co-editor.db co-editor.db.bak
   ```

---

## 📊 监控和日志

### 实时监控

```bash
pm2 monit
```

### 日志轮转

```bash
# 安装 pm2-logrotate
pm2 install pm2-logrotate

# 查看日志轮转配置
pm2 conf

# 设置日志保留大小（例如 100M）
pm2 set pm2-logrotate:max_size 100M

# 设置日志保留数量
pm2 set pm2-logrotate:retain 7
```

---

## 🐛 故障排查

### 端口被占用

```bash
# 查看端口占用
lsof -i :3000

# 修改 pm2.config.js 中的 PORT
# 然后重启
pm2 restart co-editor
```

### 内存占用过高

```bash
# 查看内存使用
pm2 show co-editor

# 调整 max_memory_restart
vi pm2.config.js
pm2 reload co-editor
```

### 数据库锁定

```bash
# 检查数据库文件权限
ls -la co-editor.db

# 重启服务
pm2 restart co-editor
```

---

## 📞 联系方式

- Email: 624167284@qq.com
- 项目文档: /Users/mac/Desktop/work/co-editor/README.md

---

_快速部署，轻松管理 🚀_
