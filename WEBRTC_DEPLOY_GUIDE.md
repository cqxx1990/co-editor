# WebRTC 文件共享外网部署指南

## 问题症状
部署到外网环境后，文件共享功能一直显示"建立连接中"，无法真正建立连接和下载文件。

## 问题原因
WebRTC 在 NAT（网络地址转换）和防火墙环境下需要特殊配置才能建立点对点连接。仅使用 STUN 服务器在复杂网络环境（如对称 NAT、企业防火墙等）下可能无法穿透。

## 解决方案

### 1. 已实施的修复
我们已经在代码中实施了以下改进：

#### a) 添加 TURN 服务器配置
```javascript
const RTC_CONFIG = {
  iceServers: [
    // STUN 服务器（用于 NAT 穿透）
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // TURN 服务器（当直连失败时的中继服务器）
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 10
};
```

#### b) 增强连接状态监控
- 添加了详细的连接状态日志
- 实现了连接超时机制（30秒）
- 自动清理失败的连接会话
- 用户友好的错误提示

#### c) 改进错误处理
- ICE 候选收集状态监控
- Data Channel 错误处理
- 信令处理异常捕获

### 2. 使用免费 TURN 服务器

当前配置使用的是 Open Relay Project 提供的免费 TURN 服务器：
- **优点**：免费、无需注册、立即可用
- **缺点**：可能不稳定、有带宽限制、不适合生产环境

### 3. 推荐的生产环境方案

#### 方案 A：使用商业 TURN 服务
推荐的 TURN 服务提供商：

1. **Twilio STUN/TURN**
   - 文档：https://www.twilio.com/stun-turn
   - 每月免费额度
   
2. **Xirsys**
   - 网址：https://xirsys.com/
   - 提供免费套餐

3. **Metered.ca**
   - 网址：https://www.metered.ca/
   - 50GB 免费流量

配置示例：
```javascript
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'your-username',
      credential: 'your-credential'
    }
  ]
};
```

#### 方案 B：自建 TURN 服务器
使用 `coturn` 搭建自己的 TURN 服务器：

1. **安装 coturn**
```bash
# Ubuntu/Debian
sudo apt-get install coturn

# CentOS/RHEL
sudo yum install coturn
```

2. **配置 coturn** (`/etc/turnserver.conf`)
```conf
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=YOUR_SERVER_IP
external-ip=YOUR_PUBLIC_IP
realm=yourdomain.com
server-name=yourdomain.com
lt-cred-mech
user=username:password
no-multicast-peers
no-tcp-relay
```

3. **启动服务**
```bash
sudo systemctl start coturn
sudo systemctl enable coturn
```

4. **防火墙配置**
```bash
# 允许 TURN 端口
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
# ICE 候选端口范围
sudo ufw allow 49152:65535/udp
```

### 4. 诊断工具

#### 在浏览器控制台中查看 WebRTC 日志
修复后的代码会在控制台输出详细日志：
- `[WebRTC]` 前缀的是 WebRTC 连接状态
- ICE 候选类型（host/srflx/relay）
- 连接状态变化

#### 测试 STUN/TURN 服务器
访问：https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

输入你的 TURN 服务器配置进行测试。

### 5. 常见问题排查

#### Q: 连接一直超时
**可能原因**：
- TURN 服务器不可用或配置错误
- 防火墙阻止了 WebRTC 端口
- 浏览器不支持 WebRTC

**解决方法**：
1. 检查浏览器控制台的 WebRTC 日志
2. 测试 TURN 服务器可用性
3. 尝试使用其他 TURN 服务器

#### Q: 只有部分用户无法连接
**可能原因**：
- 用户处于严格的企业网络/防火墙后
- ISP 封锁了某些 WebRTC 端口

**解决方法**：
- 确保配置了可靠的 TURN 服务器
- 使用 443 端口的 TURN 服务（更容易通过防火墙）

#### Q: 小文件可以传输，大文件失败
**可能原因**：
- Data Channel 缓冲区溢出
- 连接不稳定

**解决方法**：
- 已在代码中实现流控机制
- 可以调整 `chunkSize` 大小

### 6. 性能优化建议

1. **选择地理位置接近的 TURN 服务器**
   - 减少延迟
   - 提高传输速度

2. **配置多个 TURN 服务器作为备份**
   ```javascript
   iceServers: [
     { urls: 'stun:stun.l.google.com:19302' },
     { urls: 'turn:server1.com:3478', username: 'user1', credential: 'pass1' },
     { urls: 'turn:server2.com:3478', username: 'user2', credential: 'pass2' }
   ]
   ```

3. **优先使用直连**
   - 设置 `iceTransportPolicy: 'all'` 允许尝试所有连接方式
   - TURN 服务器仅在直连失败时使用

### 7. 安全建议

1. **保护 TURN 服务器凭证**
   - 不要在客户端硬编码永久凭证
   - 使用临时凭证（有效期限制）

2. **实现凭证动态生成**
   ```javascript
   // 服务器端生成临时 TURN 凭证
   app.get('/api/turn-credentials', (req, res) => {
     const username = Date.now() + ':' + req.session.userId;
     const secret = 'your-secret-key';
     const credential = crypto.createHmac('sha1', secret)
       .update(username).digest('base64');
     
     res.json({
       urls: 'turn:your-server.com:3478',
       username: username,
       credential: credential,
       ttl: 86400 // 24小时
     });
   });
   ```

### 8. 监控和调试

1. **监控 TURN 服务器使用情况**
   - 带宽使用
   - 活跃会话数
   - 错误率

2. **收集客户端连接统计**
   ```javascript
   pc.getStats().then(stats => {
     stats.forEach(report => {
       if (report.type === 'candidate-pair' && report.state === 'succeeded') {
         console.log('Connection type:', report.currentRoundTripTime);
       }
     });
   });
   ```

## 总结

通过添加 TURN 服务器配置和增强错误处理，WebRTC 文件共享功能在外网环境下应该能够正常工作。如果仍有问题，请：

1. 检查浏览器控制台的 `[WebRTC]` 日志
2. 测试 TURN 服务器的可用性
3. 考虑使用商业 TURN 服务或自建服务器

## 相关资源

- [WebRTC 官方文档](https://webrtc.org/)
- [coturn 项目](https://github.com/coturn/coturn)
- [WebRTC Samples](https://webrtc.github.io/samples/)
- [Trickle ICE 测试工具](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
