# WebRTC 连接问题诊断指南

## 问题现象

- ICE gathering 状态一直是 `gathering`，从未变成 `complete`
- 60秒后连接超时
- 所有 TURN 服务器（自建 + 公共）都无法连接

## 快速诊断

### 1. 使用诊断工具

访问 `http://localhost:3000/webrtc-debug.html`，点击"测试所有服务器"按钮。

**查看结果：**
- ✅ 有 `host` 候选 → 本地网络正常
- ✅ 有 `srflx` 候选 → STUN 服务器工作，能看到公网 IP
- ❌ 无 `relay` 候选 → **TURN 服务器无法连接**

### 2. 测试网络连接

运行测试脚本：

```bash
chmod +x test-turn-servers.sh
./test-turn-servers.sh
```

## 常见原因与解决方案

### 原因 1: 防火墙/网络限制

**症状**：测试工具显示所有 TCP/UDP 连接都失败

**解决方案**：

1. **检查本地防火墙**
   ```bash
   # macOS
   sudo pfctl -s all | grep 3478
   ```

2. **检查网络是否允许 UDP 流量**
   - 很多公司/学校网络会阻止 UDP 流量
   - 尝试切换到 4G 热点测试

3. **使用纯 TCP TURN**
   编辑 `editor.js`，移除所有 `turn:` 服务器，只保留 `turn:...?transport=tcp`：
   ```javascript
   iceServers: [
     // 只保留 TCP TURN
     {
       urls: 'turn:openrelay.metered.ca:443?transport=tcp',
       username: 'openrelayproject',
       credential: 'openrelayproject'
     }
   ]
   ```

### 原因 2: TURN 服务器配置错误

**症状**：SRAM 候选有（公网 IP），但 Relay 候选没有

**诊断 TURN 服务器**：

```bash
# 测试自建 TURN 服务器
telnet share.wuyuan.tech 3478

# 或使用 nc
nc -vz share.wuyuan.tech 3478
```

**可能的问题**：
- 服务器地址错误
- 用户名/密码错误
- 服务器未启动

**解决方案**：

1. 验证 TURN 服务器配置：
   ```javascript
   {
     urls: 'turn:123.456.789.0:3478',  // 确保地址正确
     username: 'your-username',
     credential: 'your-password'
   }
   ```

2. 使用公共 TURN 服务器测试：
   ```javascript
   {
     urls: 'turn:numb.viagenie.ca:3478',
     username: 'user@example.com',
     credential: 'password123'
   }
   ```

### 原因 3: 自建 TURN 服务器未正确启动

**症状**：自建 TURN 一直失败

**解决方案**：

1. **检查 Docker 容器状态**：
   ```bash
   docker ps | grep coturn
   ```

2. **查看日志**：
   ```bash
   docker logs coturn
   ```

3. **测试 TURN 服务器**：
   ```bash
   # 安装 turn-client
   brew install turn

   # 发送测试请求
   turnclient  -u co-editor-user -w oa90GJlg3lad.g3l; -p share.wuyuan.tech 3478
   ```

### 原因 4: 测试双方在同一网络

**症状**：局域网内测试，但 TURN 配置复杂

**解决方案**：

如果测试双方在同一局域网，不需要 TURN：

```javascript
const RTC_CONFIG = {
  iceServers: [
    // 只保留 STUN
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceTransportPolicy: 'all'
};
```

## 快速修复方案

### 方案 1: 简化配置（推荐快速测试）

修改 `editor.js`，添加配置切换：

```javascript
// 开发模式：局域网测试（无 TURN）
const DEV_MODE = true;  // 发布前改为 false

let RTC_CONFIG;

if (DEV_MODE) {
  console.log('[WebRTC] 开发模式：仅使用 STUN');
  RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };
} else {
  console.log('[WebRTC] 生产模式：使用 STUN + TURN');
  RTC_CONFIG = {
    iceServers: [
      // ... 完整配置
    ]
  };
}
```

### 方案 2: 添加备用 TURN 服务器

更新 `editor.js`，添加更多公共 TURN 服务器：

```javascript
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  // 公共 TURN 服务器
  {
    urls: 'turn:numb.viagenie.ca:3478',
    username: 'user@example.com',
    credential: 'password123'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  // 自建 TURN
  // ...
]
```

### 方案 3: 检查浏览器控制台

打开浏览器开发者工具（F12），查看 Console 标签：

**正常情况**：
```
[WebRTC] ICE candidate for xxx: host
[WebRTC] ICE candidate for xxx: srflx
[WebRTC] ICE candidate for xxx: relay
[WebRTC] ICE gathering complete for xxx
```

**异常情况**：
```
[WebRTC] ICE gathering state for xxx: gathering
// 60秒后仍然 gathering，一直不 complete
```

**查看详细错误**：
- Network 标签 → 查看是否有请求失败
- Console 标签 → 检查是否有 CORS 或证书错误

## 部署检查清单

- [ ] TURN 服务器可访问（telnet/nc 测试通过）
- [ ] HTTPS 已配置（WebRTC 需要 HTTPS）
- [ ] TURN 用户名/密码正确
- [ ] 防火墙允许 UDP 端口（3478, 5349）
- [ ] 生产环境使用自建 TURN 服务器
- [ ] 开发环境可简化为仅 STUN

## 联系支持

如果以上方案都无效：

1. 记录诊断工具的完整输出
2. 记录浏览器控制台的错误信息
3. 记录 `test-turn-servers.sh` 的结果

```bash
# 保存诊断信息
./test-turn-servers.sh > turn-test.log 2>&1
```

---

**下一步**：先运行 `./test-turn-servers.sh`，然后访问 `/webrtc-debug.html` 进行诊断。
