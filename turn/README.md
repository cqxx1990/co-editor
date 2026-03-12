# STUN/TURN 服务器 - Docker 部署

基于 **coturn** 项目，一键启动 TURN 服务器。

## 🚀 快速开始

### 方式 1: 使用默认配置（推荐）

```bash
cd turn && chmod +x start.sh && ./start.sh
```

⚠️ **注意**: 默认用户名是 `coeditor`，密码是 `turn2024passxyz`

### 方式 2: 使用自定义 .env 配置（推荐）

```bash
# 1. 创建 .env 文件
cd turn
cp .env.example .env

# 2. 编辑 .env，修改用户名密码
nano .env  # 或使用其他编辑器

# 3. 启动服务器
./start.sh
```

### 方式 3: 使用修复版脚本（默认正确配置）

```bash
cd turn
./start-fixed.sh
```

修复版默认使用生产环境的用户名密码：
- 用户名: `co-editor-user`
- 密码: `oa90GJlg3lad.g3l;`

---

## 📋 常用命令

```bash
# 查看日志
docker logs coeditor-turn -f

# 停止服务
docker stop coeditor-turn

# 重启服务
docker restart coeditor-turn

# 删除容器
docker rm -f coeditor-turn

# 测试认证
./test-turn-auth.sh
```

---

## 🔧 配置说明

### 环境变量 (.env)

创建 `.env` 文件配置 TURN 服务器：

```bash
# 公网 IP（留空自动检测）
EXTERNAL_IP=auto

# TURN 认证信息（必须与 editor.js 一致）
TURN_USER=co-editor-user
TURN_PASSWORD="oa90GJlg3lad.g3l;"

# 启用 TCP Relay（默认禁用）
ENABLE_TCP_RELAY=true
```

⚠️ **重要**: 确保 `.env` 中的用户名密码与 `public/editor.js` 中的一致！

---

## 🧪 测试与诊断

### 快速网络测试

```bash
# 在项目根目录
./test-remote-turn.sh
```

### TURN 认证测试

```bash
# 在 turn 目录
./test-turn-auth.sh
```

### 浏览器诊断工具

1. 启动服务器：`npm start`
2. 访问：`http://localhost:3000/webrtc-debug.html`
3. 点击"测试所有服务器"

### 在线测试工具

访问：https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

输入配置：
- URI: `turn:你的服务器IP:3478`
- 用户名: `co-editor-user`
- 密码: `oa90GJlg3lad.g3l;`

点击 "Gather candidates"，应该能看到 **relay** 类型的候选。

---

## 🔧 开放端口

服务器需要开放以下端口：

| 端口 | 协议 | 用途 |
|------|------|------|
| 3478 | TCP/UDP | TURN 主端口 |
| 5349 | TCP | TURNS（TLS） |
| 49152-65535 | UDP | 媒体中继 |

**防火墙配置：**
```bash
# Ubuntu/Debian
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=5349/tcp
sudo firewall-cmd --permanent --add-port=49152-65535/udp
sudo firewall-cmd --reload
```

⚠️ **云服务器记得在控制台安全组中也要开放这些端口**

---

## 🔗 在项目中使用

### 1. 确保配置一致

**public/editor.js**:
```javascript
const TURN_SERVER = 'your-server-ip-or-domain';
const TURN_USER = 'co-editor-user';
const TURN_PASSWORD = 'oa90GJlg3lad.g3l;';
```

**turn/.env**:
```bash
EXTERNAL_IP=your-server-ip
TURN_USER=co-editor-user
TURN_PASSWORD="oa90GJlg3lad.g3l;"
```

⚠️ **两者必须完全一致！**

### 2. 自动化部署替换

使用部署脚本自动替换：

```bash
# deploy-config.sh
TURN_SERVER_IP=${TURN_SERVER_IP:-"123.456.789.0"}
TURN_USER=${TURN_USER:-"co-editor-user"}
TURN_PASSWORD=${TURN_PASSWORD:-"oa90GJlg3lad.g3l;"}

sed -i "s/const TURN_SERVER = '.*'/const TURN_SERVER = '${TURN_SERVER_IP}'/" public/editor.js
sed -i "s/const TURN_USER = '.*'/const TURN_USER = '${TURN_USER}'/" public/editor.js
sed -i "s/const TURN_PASSWORD = '.*'/const TURN_PASSWORD = '${TURN_PASSWORD}'/" public/editor.js
```

---

## 🐛 故障排查

### 问题 1: 认证失败

**症状**: 测试显示 "认证失败"

**原因**: 用户名密码不匹配

**解决**:
```bash
# 检查 editor.js 配置
grep "TURN_USER\|TURN_PASSWORD" public/editor.js

# 检查 .env 配置
cat turn/.env | grep TURN_*

# 确保两者一致
```

### 问题 2: 无 relay 候选

**症状**: 只有 host 和 srflx，没有 relay

**原因**:
1. TURN 服务器未启动
2. 防火墙阻止
3. 用户名密码错误

**解决**:
```bash
# 1. 检查容器状态
docker ps | grep coturn

# 2. 查看日志
docker logs coeditor-turn

# 3. 测试认证
./test-turn-auth.sh
```

### 问题 3: 端口被占用

```bash
sudo lsof -i :3478
docker rm -f coeditor-turn
```

### 问题 4: 网络完全不通

**症状**: TCP 端口不可达

**解决**:
1. 检查防火墙
2. 检查云服务器安全组
3. 检查 DNS 解析
4. 检查 TURN 服务器是否启动

详见 `TURN_DIAGNOSTIC_REPORT.md`

---

## 📚 更多工具

| 工具 | 说明 |
|------|------|
| `test-remote-turn.sh` | 测试远程服务器网络连接 |
| `turn/test-turn-auth.sh` | TURN 认证测试 |
| `turn/start-fixed.sh` | 修复版启动脚本 |
| `public/webrtc-debug.html` | 浏览器诊断工具 |
| `TURN_DIAGNOSTIC_REPORT.md` | 完整故障排查报告 |
| `DIAGNOSTIC_README.md` | 快速诊断指南 |

---

## 📚 外部参考

- [WebRTC 部署指南](../WEBRTC_DEPLOY_GUIDE.md)
- [TURN 故障排查](../TURN_DIAGNOSTIC_REPORT.md)
- [coturn 官方文档](https://github.com/coturn/coturn)
- [Trickle ICE 测试工具](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)

