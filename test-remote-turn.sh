#!/bin/bash
# 远程TURN服务器测试脚本

echo "========================================="
echo "测试 TURN 服务器: share.wuyuan.tech"
echo "========================================="
echo ""

# 基本信息
SERVER="share.wuyuan.tech"
PORT=3478
USER="co-editor-user"
PASS="oa90GJlg3lad.g3l;"

echo "服务器配置："
echo "  地址: $SERVER:$PORT"
echo "  用户名: $USER"
echo "  密码: $PASS"
echo ""

# 测试 1: DNS 解析
echo "【测试 1】DNS 解析"
if host "$SERVER" >/dev/null 2>&1; then
    IP=$(dig +short "$SERVER" | head -1)
    echo "  ✅ DNS 解析成功: $IP"
else
    echo "  ❌ DNS 解析失败"
    exit 1
fi
echo ""

# 测试 2: TCP 连接 (coturn 需要 TCP 控制通道)
echo "【测试 2】TCP 端口连接"
if timeout 3 bash -c "cat < /dev/null > /dev/tcp/$SERVER/$PORT" 2>/dev/null; then
    echo "  ✅ TCP $PORT 端口: 可达"
else
    echo "  ❌ TCP $PORT 端口: 不可达"
    echo "  ⚠️   这可能是主要原因！TURN 服务器可能未启动或防火墙阻止"
fi
echo ""

# 测试 3: UDP 端口
echo "【测试 3】UDP 端口连接"
if command -v nc &> /dev/null; then
    if timeout 2 nc -uvz "$SERVER" "$PORT" 2>/dev/null; then
        echo "  ✅ UDP $PORT 端口: 可达"
    else
        echo "  ⚠️   UDP $PORT 端口: 无法测试或不可达"
        echo "  💡 这可能是网络限制，但 coturn 主要是 TCP 控制通道"
    fi
else
    echo "  ⚠️   nc 命令不可用，跳过 UDP 测试"
fi
echo ""

# 测试 4: 使用 turn-client 测试 TURN 认证
echo "【测试 4】TURN 认证测试"
if command -v turn-client &> /dev/null; then
    turn-client -u "$USER" -w "$PASS" -p "$SERVER" "$PORT" 2>&1 | head -5
else
    echo "  ⚠️   turn-client 未安装"
    echo "  💡 安装方式: brew install turn"
fi
echo ""

# 测试 5: 检查 coturn 版本信息
echo "【测试 5】Coturn 服务信息"
echo "  尝试获取服务器信息..."
timeout 2 bash -c "echo '' | nc $SERVER $PORT" 2>&1 | head -3 || echo "  ⚠️   无法获取服务器信息"
echo ""

echo "========================================="
echo "故障排查建议："
echo "========================================="
echo ""
echo "如果 TCP 端口不可达，检查以下项："
echo ""
echo "1. 服务器端检查"
echo "   ssh root@$IP"
echo "   docker ps -a | grep coturn"
echo "   docker logs coeditor-turn"
echo ""
echo "2. 防火墙检查"
echo "   sudo ufw status"
echo "   需要开放: 3478/tcp, 3478/udp"
echo ""
echo "3. 云服务器安全组"
echo "   确保开放 3478 端口（TCP + UDP）"
echo ""
echo "4. 配置检查"
echo "   检查 start.sh 的用户名密码是否匹配"
echo "   查看 turn/start.sh 中的 DEFAULT_USER 和 DEFAULT_PASS"
echo ""
echo "========================================="
