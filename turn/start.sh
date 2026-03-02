#!/bin/bash

# TURN 服务器一键启动脚本
# 使用 Docker 直接运行 coturn

set -e

CONTAINER_NAME="coeditor-turn"
IMAGE="coturn/coturn:latest"

# 默认配置
DEFAULT_USER="coeditor"
DEFAULT_PASS="turn2024passxyz"

# 读取 .env 文件（如果存在）
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# 获取配置（优先使用 .env，否则使用默认值）
TURN_USER=${TURN_USER:-$DEFAULT_USER}
TURN_PASSWORD=${TURN_PASSWORD:-$DEFAULT_PASS}

# 自动检测公网 IP
if [ -z "$EXTERNAL_IP" ] || [ "$EXTERNAL_IP" = "auto" ]; then
    echo "🔍 检测公网 IP..."
    EXTERNAL_IP=$(curl -s ifconfig.me || curl -s api.ipify.org || echo "127.0.0.1")
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 启动 TURN 服务器"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📡 公网 IP: $EXTERNAL_IP"
echo "👤 用户名: $TURN_USER"
echo "🔑 密码: $TURN_PASSWORD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 停止并删除旧容器（如果存在）
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
    echo "🔄 删除旧容器..."
    docker rm -f $CONTAINER_NAME >/dev/null 2>&1
fi

# 启动容器
echo "🐳 启动 Docker 容器..."
docker run -d \
    --name $CONTAINER_NAME \
    --restart unless-stopped \
    --network host \
    $IMAGE \
    sh -c "echo 'listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=0.0.0.0
external-ip=$EXTERNAL_IP
realm=$EXTERNAL_IP
lt-cred-mech
user=$TURN_USER:$TURN_PASSWORD
no-tcp-relay
no-multicast-peers
verbose
min-port=49152
max-port=65535
fingerprint' > /tmp/turnserver.conf && \
echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && \
echo '✅ TURN Server Started' && \
echo '📡 Server: turn:$EXTERNAL_IP:3478' && \
echo '👤 User: $TURN_USER' && \
echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && \
turnserver -c /tmp/turnserver.conf -v"

# 等待容器启动
sleep 2

# 检查容器状态
if [ "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ TURN 服务器已启动"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 连接信息："
    echo "   URL: turn:$EXTERNAL_IP:3478"
    echo "   用户名: $TURN_USER"
    echo "   密码: $TURN_PASSWORD"
    echo ""
    echo "📊 常用命令："
    echo "   查看日志: docker logs $CONTAINER_NAME -f"
    echo "   停止服务: docker stop $CONTAINER_NAME"
    echo "   重启服务: docker restart $CONTAINER_NAME"
    echo "   删除容器: docker rm -f $CONTAINER_NAME"
    echo ""
    echo "🧪 在线测试: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo ""
    echo "❌ 启动失败，查看错误信息："
    docker logs $CONTAINER_NAME
    exit 1
fi
