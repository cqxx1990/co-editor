# TURN 服务器连接问题诊断报告

## 📌 问题分析

根据代码审查，我发现了 **5 个可能导致 TURN 连接失败的问题**：

### 问题 1: 默认用户名密码不匹配 ❌ 严重

**位置**: `turn/start.sh` vs `public/editor.js`

```bash
# turn/start.sh (默认值)
DEFAULT_USER="coeditor"                # ❌ 错误
DEFAULT_PASS="turn2024passxyz"         # ❌ 错误

# public/editor.js (实际使用)
const TURN_USER = 'co-editor-user';    # ✅ 正确
const TURN_PASSWORD = 'oa90GJlg3lad.g3l;';  # ✅ 正确
```

**影响**: 用户名密码不匹配，认证肯定失败

**解决方案**:
- 使用 `.env` 文件覆盖默认值
- 或使用修复版 `start-fixed.sh`

---

### 问题 2: 密码中有特殊字符 ⚠️ 中等

**位置**: `public/editor.js`

```javascript
const TURN_PASSWORD = 'oa90GJlg3lad.g3l;';
```

注意到分号 `;` 在 shell 中被解释为命令分隔符。

**影响**: 可能在解析 `.env` 文件时出错

**解决方案**:
```bash
# .env 文件中用引号包裹
TURN_PASSWORD="oa90GJlg3lad.g3l;"
```

---

### 问题 3: 禁用了 TCP Relay ⚠️ 中等

**位置**: `turn/start.sh`

```bash
no-tcp-relay
```

但 `editor.js` 尝试连接 TCP TURN：
```javascript
{
  urls: `turn:${TURN_SERVER}:3478?transport=tcp`,
  username: TURN_USER,
  credential: TURN_PASSWORD
}
```

**影响**: TCP 连接会被拒绝

**解决方案**: 使用 `start-fixed.sh` 启用 TCP relay

---

### 问题 4: 服务器地址是域名而不是 IP ⚠️ 轻微

**位置**: `public/editor.js` vs `turn/start.sh`

```javascript
// editor.js
const TURN_SERVER = 'share.wuyuan.tech';  // 域名

// start.sh (自动检测)
EXTERNAL_IP=$(curl -s ifconfig.me)         # IP
```

**影响**: 如果 DNS 解析失败，连接会失败

**解决方案**: 确保 `share.wuyuan.tech` 正确解析

---

### 问题 5: 缺少 .env 文件配置 ⚠️ 中等

**当前状态**: 项目没有 `.env` 文件

**影响**: 启动时使用默认错误的用户名密码

**解决方案**: 创建 `.env` 文件

---

## 🔧 快速修复方案

### 方案 1: 创建 .env 文件（推荐）

在 `turn/` 目录下创建 `.env` 文件：

```bash
cd /Users/mac/Desktop/work/co-editor/turn
cat > .env << 'EOF'
EXTERNAL_IP=8.137.150.96
TURN_USER=co-editor-user
TURN_PASSWORD="oa90GJlg3lad.g3l;"
ENABLE_TCP_RELAY=true
EOF

# 重启服务器
./start.sh
```

### 方案 2: 使用修复版启动脚本

```bash
cd /Users/mac/Desktop/work/co-editor/turn
./start-fixed.sh
```

修复版默认使用正确的用户名密码。

### 方案 3: 修复服务器端配置

登录到远端服务器（8.137.150.96）：

```bash
# SSH 登录
ssh root@8.137.150.96

# 进入项目目录
cd /path/to/co-editor/turn

# 更新 start.sh 中的默认值
sed -i 's/DEFAULT_USER="coeditor"/DEFAULT_USER="co-editor-user"/' start.sh
sed -i 's/DEFAULT_PASS="turn2024passxyz"/DEFAULT_PASS="oa90GJlg3lad.g3l;"/' start.sh

# 启用 TCP relay（可选）
sed -i '/no-tcp-relay/d' start.sh

# 重启服务器
docker rm -f coeditor-turn
./start.sh
```

---

## 🧪 测试步骤

### 步骤 1: 测试网络连接

```bash
cd /Users/mac/Desktop/work/co-editor
./test-remote-turn.sh
```

应该看到：
```
✅ DNS 解析成功: 8.137.150.96
✅ TCP 3478 端口: 可达
```

### 步骤 2: 测试 TURN 认证

```bash
cd /Users/mac/Desktop/work/co-editor/turn
./test-turn-auth.sh
```

结果应该是：
```
✅ TURN 认证成功！
```

### 步骤 3: 使用浏览器工具测试

1. 访问 `http://localhost:3000/webrtc-debug.html`
2. 点击"测试所有服务器"
3. 应该看到 `relay` 类型的候选

### 步骤 4: 在线测试工具

访问: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

配置：
- URI: `turn:share.wuyuan.tech:3478`
- 用户名: `co-editor-user`
- 密码: `oa90GJlg3lad.g3l;`

点击 "Gather candidates" 应该看到 **relay** 候选。

---

## 📋 完整修复检查清单

### 本地修复

- [ ] 确保 `editor.js` 配置正确
- [ ] 运行 `./test-remote-turn.sh` 测试网络
- [ ] 运行 `./turn/test-turn-auth.sh` 测试认证

### 服务器端修复（需要在 8.137.150.96 上操作）

- [ ] 检查 Docker 容器状态：`docker ps | grep coturn`
- [ ] 查看容器日志：`docker logs coeditor-turn`
- [ ] 创建或更新 `turn/.env` 文件
- [ ] 重启容器：`docker restart coeditor-turn`
- [ ] 检查防火墙：`ufw status` 或 `firewall-cmd --list-all`
- [ ] 确保开放端口：3478/tcp, 3478/udp
- [ ] 检查云服务器安全组

### 验证修复

- [ ] turn-client 认证测试通过
- [ ] 浏览器诊断工具显示 relay 候选
- [ ] 在线工具测试通过
- [ ] 文件传输功能正常

---

## 📚 新创建的工具

| 工具 | 用途 | 位置 |
|------|------|------|
| `test-remote-turn.sh` | 测试远程 TURN 服务器网络连接 | `/co-editor/test-remote-turn.sh` |
| `turn/start-fixed.sh` | 修复版启动脚本（默认正确配置） | `/co-editor/turn/start-fixed.sh` |
| `turn/test-turn-auth.sh` | TURN 认证测试脚本 | `/co-editor/turn/test-turn-auth.sh` |
| `turn/.env.example` | .env 配置模板 | `/co-editor/turn/.env.example` |
| `public/webrtc-debug.html` | 浏览器诊断工具 | `/co-editor/public/webrtc-debug.html` |
| `test-turn-servers.sh` | 所有 TURN 服务器连接测试 | `/co-editor/test-turn-servers.sh` |

---

## 🚀 立即开始的诊断命令

```bash
# 1. 测试网络连接
cd /Users/mac/Desktop/work/co-editor
./test-remote-turn.sh

# 2. 认证测试
./turn/test-turn-auth.sh

# 3. 如果需要重启服务器（在远端执行）
# ssh root@8.137.150.96
# cd /path/to/turn
# 创建 .env 或使用 start-fixed.sh
# ./start-fixed.sh
```

---

**下一步**: 先运行 `test-remote-turn.sh`，告诉我结果，我会根据具体情况给出更精准的修复方案。
