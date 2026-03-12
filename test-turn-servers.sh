#!/bin/bash
# WebRTC TURN 服务器连接测试脚本

echo "========================================="
echo "WebRTC TURN 服务器连接测试"
echo "========================================="
echo ""

# 测试列表
servers=(
  "stun:stun.l.google.com:19302|STUN"
  "stun:stun1.l.google.com:19302|STUN"
  "stun:stun2.l.google.com:19302|STUN"
  "turn:share.wuyuan.tech:3478|TURN"
  "turn:openrelay.metered.ca:443|TURN"
  "turn:openrelay.metered.ca:80|TURN"
)

for srv in "${servers[@]}"; do
  IFS='|' read -ra ADDR <<< "$srv"
  url="${ADDR[0]}"
  type="${ADDR[1]}"

  echo "测试: $url ($type)"

  # 提取主机和端口
  host=$(echo "$url" | sed -E 's|^[^:]+://([^:]+).*|\1|')
  port=$(echo "$url" | sed -E 's|^[^:]+://[^:]+:([0-9]+).*|\1|')

  if [ -z "$port" ]; then
    if [[ "$url" == *"https"* ]]; then
      port=443
    else
      port=3478
    fi
  fi

  echo "  主机: $host, 端口: $port"

  # 测试 TCP 连接
  if timeout 3 bash -c "cat < /dev/null > /dev/tcp/$host/$port" 2>/dev/null; then
    echo "  ✅ TCP 连接: 可用"
  else
    echo "  ❌ TCP 连接: 失败"
  fi

  # 测试 UDP (nc 可用)
  if command -v nc &> /dev/null; then
    if timeout 2 nc -uvz "$host" "$port" 2>/dev/null; then
      echo "  ✅ UDP 端口: 可用"
    else
      echo "  ⚠️   UDP 端口: 无法测试或不可用"
    fi
  fi

  echo ""
done

echo "========================================="
echo "如果所有连接都失败，可能是网络被防火墙阻止"
echo "========================================="
