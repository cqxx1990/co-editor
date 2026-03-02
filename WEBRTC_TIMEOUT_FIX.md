# WebRTC 文件传输超时问题解决方案

## 问题现象
文件传输时提示：`[WebRTC] Connection timeout for`

## 已实施的优化

### 1. 延长超时时间 ✅
- 从 30 秒延长到 **60 秒**
- 给 TURN 服务器更多时间建立连接

### 2. 改进超时判断逻辑 ✅
- 检查 ICE 连接状态
- 检查 Data Channel 状态
- 提供更准确的错误诊断

### 3. 增强错误提示 ✅
根据不同情况提供具体的错误信息：
- **网络不稳定，无法收集连接信息** - ICE 收集未完成
- **连接失败，可能需要 TURN 服务器支持** - ICE 连接失败
- **连接超时，请检查网络或尝试刷新页面** - 一般超时

### 4. 添加连接诊断 ✅
- 记录连接建立耗时
- 显示连接类型（直连/STUN/TURN）
- 输出详细的连接状态日志

## 使用 WebRTC 测试工具

我们创建了一个专门的测试页面来诊断网络环境：

### 访问测试页面
```
http://localhost:3000/test-webrtc.html
或
http://your-domain.com/test-webrtc.html
```

### 测试步骤
1. 打开测试页面
2. 点击"开始测试"按钮
3. 等待 6-30 秒收集 ICE 候选
4. 查看诊断结果

### 结果说明

#### ✅ 良好（有 Relay 候选）
```
• Host 候选: 2 个（本地直连）
• Srflx 候选: 1 个（STUN 穿透）
• Relay 候选: 1 个（TURN 中继）✓
```
**含义**：TURN 服务器工作正常，所有网络环境都能使用

#### ⚠️ 一般（只有 Srflx 候选）
```
• Host 候选: 2 个（本地直连）
• Srflx 候选: 1 个（STUN 穿透）
• Relay 候选: 0 个（TURN 中继）✗
```
**含义**：无法连接 TURN 服务器，简单 NAT 可用，严格防火墙会失败

**解决方法**：
1. 检查防火墙是否阻止了 TURN 端口
2. 尝试使用其他 TURN 服务器
3. 参考 [WEBRTC_DEPLOY_GUIDE.md](../WEBRTC_DEPLOY_GUIDE.md)

#### ❌ 受限（只有 Host 候选）
```
• Host 候选: 2 个（本地直连）
• Srflx 候选: 0 个（STUN 穿透）✗
• Relay 候选: 0 个（TURN 中继）✗
```
**含义**：只能局域网使用，外网完全不可用

**可能原因**：
- 防火墙阻止 UDP 流量
- 企业网络严格限制
- 代理服务器阻止 WebRTC

## 浏览器控制台诊断

### 查看连接日志
打开浏览器控制台（F12），筛选 `[WebRTC]` 日志：

#### 成功的连接日志应该是这样的：
```
[WebRTC] Starting download for file: abc123
[WebRTC] Connecting to owner: xyz789
[WebRTC] ICE candidate for abc123: host
[WebRTC] ICE candidate for abc123: srflx
[WebRTC] ICE candidate for abc123: relay  ← 重要！
[WebRTC] ICE gathering complete for abc123
[WebRTC] ICE connection state for abc123: connected
[WebRTC] Data channel opened for abc123 (耗时: 5秒)
[WebRTC] Connection type: srflx -> relay
[WebRTC] 使用 TURN 中继连接
```

#### 失败的连接日志：
```
[WebRTC] Starting download for file: abc123
[WebRTC] ICE candidate for abc123: host
[WebRTC] ICE gathering state for abc123: complete
[WebRTC] Connection timeout for file: abc123
[WebRTC] Final states - ICE: checking, Connection: connecting, ICE Gathering: complete
```

### 诊断要点

#### 1. 检查是否收集到 relay 候选
```javascript
[WebRTC] ICE candidate for abc123: relay
```
- **有 relay**：TURN 服务器正常
- **没有 relay**：TURN 服务器不可用

#### 2. 检查 ICE 连接状态
```javascript
[WebRTC] ICE connection state for abc123: connected
```
- **connected/completed**：连接成功
- **checking**：正在尝试连接
- **failed/disconnected**：连接失败

#### 3. 查看连接类型
```javascript
[WebRTC] Connection type: relay -> relay
[WebRTC] 使用 TURN 中继连接
```
- **host -> host**：局域网直连（最快）
- **srflx -> srflx**：STUN 穿透（较快）
- **relay -> relay**：TURN 中继（较慢但最可靠）

## 常见问题排查

### Q1: 一直显示"正在建立连接"，最后超时
**可能原因**：
1. TURN 服务器不可用
2. 对方不在线或已关闭页面
3. 网络严格限制 WebRTC

**解决方法**：
1. 运行测试工具检查 TURN 服务器
2. 确认对方在线且文件仍在共享列表中
3. 尝试刷新页面

### Q2: 测试工具显示无 Relay 候选
**解决方法**：

#### 方案 A：使用其他免费 TURN 服务器
修改 `public/editor.js` 中的配置：

```javascript
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // 尝试其他 TURN 服务器
    {
      urls: 'turn:numb.viagenie.ca',
      username: 'webrtc@live.com',
      credential: 'muazkh'
    }
  ]
};
```

#### 方案 B：自建 TURN 服务器
参考 [WEBRTC_DEPLOY_GUIDE.md](../WEBRTC_DEPLOY_GUIDE.md) 的详细教程

### Q3: 局域网可以，外网不行
**原因**：缺少 TURN 服务器支持

**解决**：必须配置可用的 TURN 服务器

### Q4: 小文件可以，大文件超时
**原因**：连接建立慢

**已优化**：
- 超时时间延长到 60 秒
- 大多数情况下足够建立连接

如果仍超时：
- 检查网络质量
- 确认双方网络稳定
- 考虑分批传输

## 推荐的 TURN 服务器

### 免费服务（测试用）
1. **Open Relay Project**（当前使用）
   - 优点：完全免费，无需注册
   - 缺点：不稳定，有时不可用

2. **Numb Viagenie**
   ```javascript
   {
     urls: 'turn:numb.viagenie.ca',
     username: 'webrtc@live.com',
     credential: 'muazkh'
   }
   ```

### 商业服务（生产环境）
1. **Twilio STUN/TURN** - 每月免费额度
2. **Xirsys** - 提供免费套餐
3. **Metered.ca** - 50GB 免费流量

### 自建服务器（最佳方案）
使用 coturn，参考 [WEBRTC_DEPLOY_GUIDE.md](../WEBRTC_DEPLOY_GUIDE.md)

## 性能优化建议

### 1. 减少超时时间（一旦确认 TURN 可用）
```javascript
// 在 editor.js 中
}, 30000); // 改回 30 秒
```

### 2. 监控连接成功率
在控制台查看连接类型统计：
- 70%+ 使用直连/STUN：网络环境好
- 50%+ 使用 TURN：网络环境一般
- 经常超时：需要优化 TURN 配置

### 3. 用户提示
建议在界面上显示：
- 预估等待时间（根据连接类型）
- 连接状态实时更新
- 失败时的重试按钮

## 调试技巧

### 1. 启用详细日志
浏览器控制台已自动输出详细的 `[WebRTC]` 日志

### 2. 使用 chrome://webrtc-internals
Chrome 浏览器访问：`chrome://webrtc-internals`
- 查看所有 WebRTC 连接
- 详细的统计数据
- ICE 候选信息

### 3. 网络抓包
使用 Wireshark 过滤：
```
udp.port == 3478 || udp.port == 5349
```

## 总结

### 修复内容
✅ 超时时间延长到 60 秒  
✅ 改进超时判断逻辑  
✅ 增强错误提示  
✅ 添加连接诊断  
✅ 创建测试工具  

### 下一步
1. 运行测试工具：`http://localhost:3000/test-webrtc.html`
2. 确认 TURN 服务器可用（看到 Relay 候选）
3. 测试文件传输功能
4. 如果仍有问题，考虑更换 TURN 服务器

### 获取帮助
- 查看 [WEBRTC_DEPLOY_GUIDE.md](../WEBRTC_DEPLOY_GUIDE.md)
- 联系：624167284@qq.com
