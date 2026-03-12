#!/bin/bash

# TURN 服务器一键启动脚本（修复版）
# 修复问题：
# 1. 默认用户名密码与部署脚本匹配
# 2. 移除 no-tcp-relay 限制
# 3. 更好的错误诊断

set -e

CONTAINER_NAME="coeditor-turn"
IMAGE="coturn/coturn:latest"

# ⚠️ 重要：这里的默认值要与部署脚本匹配
DEFAULT_USER="co-editor-user"
DEFAULT_PASS="oa90GJlg3lad.g3l;"

# 读取 .env 文件（如果存在）
if [ -f .env ]; then
    echo "📄 读取 .env 文件..."
    # 使用更安全的方式读取 .env
    while IFS= read -r line || [ -n "$line" ]; do
        # 跳过注释和空行
        [[ "$line" =~ ^#.*$ ]] && continue
        [[ -z "$line" ]] && continue
        # 导出变量
        export "$line"
    done < .env
fi

# 获取配置（优先使用 .env，否则使用默认值）
TURN_USER=${TURN_USER:-$DEFAULT_USER}
TURN_PASSWORD=${TURN_PASSWORD:-$DEFAULT_PASS}
ENABLE_TCP_RELAY=${ENABLE_TCP_RELAY:-false}

# 自动检测公网 IP
if [ -z "$EXTERNAL_IP" ] || [ "$EXTERNAL_IP" = "auto" ]; then
    echo "🔍 检测公网 IP..."
    EXTERNAL_IP=$(curl -s --max-time 5 ifconfig.me || curl -s --max-time 5 api.ipify.org || echo "127.0.0.1")

    if [ "$EXTERNAL_IP" = "127.0.0.1" ]; then
        echo "⚠️  自动检测 IP 失败，将使用 127.0.0.1"
        echo "   请手动设置 EXTERNAL_IP，或检查网络连接"
        read -p "继续吗？(y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 启动 TURN 服务器"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📡 公网 IP: $EXTERNAL_IP"
echo "👤 用户名: $TURN_USER"
echo "🔑 密码: $TURN_PASSWORD"
echo "🌐 TCP Relay: $ENABLE_TCP_RELAY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 停止并删除旧容器（如果存在）
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
    echo "🔄 停止旧容器..."
    docker stop $CONTAINER_NAME >/dev/null 2>&1 || true
    echo "🗑️  删除旧容器..."
    docker rm -f $CONTAINER_NAME >/dev/null 2>&1 || true
fi

# 生成配置文件
CONFIG_TMP=$(mktemp)
cat > "$CONFIG_TMP" <<EOF
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=0.0.0.0
external-ip=$EXTERNAL_IP
realm=$EXTERNAL_IP
lt-cred-mech
user=$TURN_USER:$TURN_PASSWORD
EOF

# 如果启用 TCP relay，不移除 no-tcp-relay
if [ "$ENABLE_TCP_RELAY" = "true" ]; then
    echo "✅ 已启用 TCP Relay"
else
    # 默认禁用 TCP relay 以提高性能
    echo "no-tcp-relay" >> "$CONFIG_TMP"
fi

# 其他配置
cat >> "$CONFIG_TMP" <<EOF
no-multicast-peers
verbose
min-port=49152
max-port=65535
fingerprint
EOF

# 显示配置（隐藏密码）
echo ""
echo "📋 配置文件内容："
grep -v "^user=" "$CONFIG_TMP" | grep -v "^realm=" | sed 's/^/  /'
echo "  user=$TURN_USER:****"
echo ""

# 启动容器
echo "🐳 启动 Docker 容器..."
docker run -d \
    --name $CONTAINER_NAME \
    --restart unless-stopped \
    --network host \
    $IMAGE \
    sh -c "echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && \
cat $CONFIG_TMP && \
echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && \
turnserver -c $CONFIG_TMP -v"

# 等待容器启动
sleep 3

# 检查容器状态
CONTAINER_RUNNING=$(docker ps -q -f name=$CONTAINER_NAME)

if [ -n "$CONTAINER_RUNNING" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ TURN 服务器已启动"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 连接信息："
    echo "   URL (UDP): turn:$EXTERNAL_IP:3478"
    if [ "$ENABLE_TCP_RELAY" = "true" ]; then
        echo "   URL (TCP): turn:$EXTERNAL_IP:3478?transport=tcp"
    fi
    echo "   用户名: $TURN_USER"
    echo "   密码: $TURN_PASSWORD"
    echo ""
    echo "📊 常用命令："
    echo "   查看日志: docker logs $CONTAINER_NAME -f"
    echo "   查看配置: docker exec $CONTAINER_NAME cat /tmp/turnserver.conf"
    echo "   停止服务: docker stop $CONTAINER_NAME"
    echo "   重启服务: docker restart $CONTAINER_NAME"
    echo "   删除容器: docker rm -f $CONTAINER_NAME"
    echo ""
    echo "🧪 在线测试: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/"
    echo "   或运行: ./test-turn-auth.sh"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo ""
    echo "❌ 启动失败，查看错误信息："
    echo ""
    docker logs $CONTAINER_NAME 2>&1 | tail -20
    echo ""
    exit 1
fi

# 清理临时文件
rm -f "$CONFIG_TMP"
