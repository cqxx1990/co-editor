# WebRTC 连接问题诊断指南

## 快速诊断步骤

### 1. 测试网络连接

```bash
cd /Users/mac/Desktop/work/co-editor
./test-turn-servers.sh
```

这会检查所有配置的服务器是否可达。

### 2. 使用浏览器诊断工具

1. 启动项目：`npm start`
2. 访问：`http://localhost:3000/webrtc-debug.html`
3. 点击"测试所有服务器"按钮
4. 查看输出结果

### 3. 查看浏览器控制台

1. 打开 `http://localhost:3000/editor.html#test-doc`
2. 按 F12 打开开发者工具
3. 查看 Console 标签中的 WebRTC 日志

## 关键信息查看

### 正常情况应该看到：

```
[WebRTC] ICE candidate for xxx: host      ← 本地网络正常
[WebRTC] ICE candidate for xxx: srflx     ← STUN 工作，有公网 IP
[WebRTC] ICE candidate for xxx: relay     ← TURN 工作，可中继
[WebRTC] ICE gathering complete           ← 收集完成
[WebRTC] Connection established           ← 连接成功
```

### 异常情况（你遇到的问题）：

```
[WebRTC] ICE gathering state: gathering
...
60 秒后仍然 gathering，没有变化
```

**这说明某个环节出了问题**，继续往下诊断。

## 常见问题

### 问题 1: 无 relay 候选

**症状**：诊断工具显示 host 和 srflx 有，但没有 relay

**原因**：TURN 服务器无法连接

**解决**：
1. 确认 TURN 服务器地址、用户名、密码正确
2. 运行 `./test-turn-servers.sh` 检查网络
3. 尝试其他 TURN 服务器

### 问题 2: 甚至没有 srflx 候选

**症状**：只有 host 候选

**原因**：防火墙阻止 UDP 或 STUN 被屏蔽

**解决**：
1. 检查本地防火墙
2. 尝试切换到 4G 热点测试
3. 检查企业网络是否限制了 STUN

### 问题 3: gathering 一直是 gathering

**症状**：60秒超时，状态还是 gathering

**原因**：网络完全被阻断或 TURN 配置全错

**解决**：
1. 先简化配置（见下方）
2. 检查浏览器是否支持 WebRTC
3. 查看 Network 标签是否有请求失败

### 问题 4: 双方在同一局域网

**症状**：测试双方在同一 WiFi 下

**临时解决**：
```javascript
// 修改 editor.js
const DEV_MODE = true;  // 改为 true
```

这样会禁用 TURN，只用 STUN。局域网内不需要 TURN。

## 临时解决方案

### 方案 A: 检查是否在同一网络

如果测试双方在同一个局域网（同一 WiFi），不需要 TURN：

```javascript
// editor.js 顶部
const DEV_MODE = true;
```

### 方案 B: 使用公共 TURN 服务器

替换 TURN 配置为已知可用的公共服务器：

```javascript
// editor.js 顶部
const TURN_SERVER = 'openrelay.metered.ca';
const TURN_USER = 'openrelayproject';
const TURN_PASSWORD = 'openrelayproject';
```

### 方案 C: 纯 TCP TURN（如果 UDP 被阻止）

编辑 `editor.js`，只保留 TCP TURN：

```javascript
RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};
```

### 方案 D: 只用 STUN（测试用）

```javascript
RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};
```

**注意**：这只能在同一局域网或双方都有公网 IP 时工作。

## 检查 TURN 服务器

### 测试自建 TURN 服务器

```bash
# 使用 telnet
telnet share.wuyuan.tech 3478

# 使用 nc (推荐)
nc -vz share.wuyuan.tech 3478

# 查看详细连接信息
nc -vvz share.wuyuan.tech 3478
```

### 测试公共 TURN 服务器

```bash
# openrelay (免费)
nc -vz openrelay.metered.ca 443
nc -vz openrelay.metered.ca 80
```

## 防火墙检查

### macOS 检查防火墙

```bash
# 查看防火墙规则
sudo pfctl -s all

# 查看是否阻止 UDP
sudo pfctl -s rules | grep 3478
```

### Linux 检查防火墙

```bash
# iptables
sudo iptables -L -n | grep 3478

# ufw
sudo ufw status | grep 3478
```

## 日志收集

收集诊断信息以便进一步分析：

```bash
# 1. 网络测试日志
./test-turn-servers.sh > turn-test.log 2>&1

# 2. 浏览器控制台截图或复制日志
# Console 标签 → 右键 → Save as...

# 3. 浏览器网络请求
# Network 标签 → 筛选 WS (WebSocket) → 查看 webrtc-signal 请求
```

## 建议的测试流程

1. **第一步**：运行 `./test-turn-servers.sh`
   - 确认哪些服务器可达
   - 确认 UDP/TCP 端口是否开放

2. **第二步**：访问 `/webrtc-debug.html`
   - 看到 ICE candidates 类型
   - 确认具体缺少哪类候选

3. **第三步**：根据结果选择解决方案
   - 有 host/srflx，无 relay → 修复 TURN 配置
   - 无 srflx → 检查防火墙和 UDP
   - 都有但 failure → 检查 TURN 用户名密码

4. **第四步**：如果是局域网测试
   - 设置 `DEV_MODE = true`
   - 验证成功后再恢复生产配置

## 参考

详细原理和更多信息见 `WEBRTC_TROUBLESHOOTING.md`
