#!/bin/bash

# 自动化部署脚本示例
# 用于在部署平台上自动替换 TURN 服务器配置

# 使用环境变量
TURN_SERVER_IP=${TURN_SERVER_IP:-"your-server.com"}
TURN_USER=${TURN_USER:-"coeditor"}
TURN_PASSWORD=${TURN_PASSWORD:-"turn2024pass"}

echo "🔧 配置 TURN 服务器..."
echo "   服务器: $TURN_SERVER_IP"
echo "   用户名: $TURN_USER"

# 替换 editor.js 中的配置
sed -i.bak "s/const TURN_SERVER = '.*';/const TURN_SERVER = '${TURN_SERVER_IP}';/" public/editor.js
sed -i.bak "s/const TURN_USER = '.*';/const TURN_USER = '${TURN_USER}';/" public/editor.js
sed -i.bak "s/const TURN_PASSWORD = '.*';/const TURN_PASSWORD = '${TURN_PASSWORD}';/" public/editor.js

# 删除备份文件
rm -f public/editor.js.bak

echo "✅ 配置完成！"

# 验证配置
echo ""
echo "📋 当前配置："
head -10 public/editor.js | grep -E "TURN_(SERVER|USER|PASSWORD)"
