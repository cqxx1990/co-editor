# STUN/TURN 服务器 - Docker 部署

基于 **coturn** 项目，一行命令启动 TURN 服务器。

## 🚀 快速开始

```bash
cd turn && chmod +x start.sh && ./start.sh
```

服务自动配置，使用默认账号（用户名: `coeditor`, 密码: `turn2024pass`）。

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
```

## ⚙️ 自定义配置

创建 `.env` 文件（可选）：

```bash
EXTERNAL_IP=123.456.789.0
TURN_USER=myuser
TURN_PASSWORD=mypassword
```

然后运行：
```bash
./start.sh
```

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
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp && sudo ufw allow 49152:65535/udp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=5349/tcp
sudo firewall-cmd --permanent --add-port=49152-65535/udp
sudo firewall-cmd --reload
```

⚠️ **云服务器记得在控制台安全组中也要开放这些端口**

## 🧪 测试连接

### 1. 查看服务信息
```bash
docker logs coeditor-turn | grep "TURN Server"
```

### 2. 在线测试工具
访问：https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

输入配置：
- URI: `turn:你的服务器IP:3478`
- 用户名: `coeditor`
- 密码: `turn2024pass`

点击 "Gather candidates"，应该能看到 **relay** 类型的候选。

## 🔗 在项目中使用

启动 TURN 服务器后，修改 [public/editor.js](../public/editor.js) 文件顶部的配置：

```javascript
// =============================
// TURN 服务器配置（部署时修改此处）
// =============================
const TURN_SERVER = '123.456.789.0'; // 改为你的服务器 IP 或域名
const TURN_USER = 'coeditor';
const TURN_PASSWORD = 'turn2024pass';
```

**自动化部署替换示例：**
```bash
# 使用 sed 命令批量替换
sed -i "s/TURN_SERVER = '.*'/TURN_SERVER = '${YOUR_SERVER_IP}'/" public/editor.js
```

## 🐛 常见问题

### 端口被占用
```bash
sudo lsof -i :3478
docker rm -f coeditor-turn
```

### 无法收集到 relay 候选
1. 检查防火墙和云服务器安全组
2. 验证公网 IP：`curl ifconfig.me`
3. 查看容器日志：`docker logs coeditor-turn`

### 修改密码
编辑 `.env`，然后重新运行 `./start.sh`

## 📚 更多文档

- [WebRTC 部署指南](../WEBRTC_DEPLOY_GUIDE.md)
- [超时问题解决](../WEBRTC_TIMEOUT_FIX.md)
- [coturn 官方文档](https://github.com/coturn/coturn)
