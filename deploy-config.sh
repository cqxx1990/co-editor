#!/bin/bash

# 自动化部署脚本示例
# 用于在部署平台上自动替换 TURN 服务器和 HTTPS 配置

# 环境变量设置（可在部署平台配置）
TURN_SERVER_IP=${TURN_SERVER_IP:-"your-server.com"}
TURN_USER=${TURN_USER:-"coeditor"}
TURN_PASSWORD=${TURN_PASSWORD:-"turn2024pass"}

HTTPS_ENABLED=${HTTPS_ENABLED:-false}
HTTPS_KEY_PATH=${HTTPS_KEY_PATH:-"./certs/privkey.pem"}
HTTPS_CERT_PATH=${HTTPS_CERT_PATH:-"./certs/cert.pem"}

echo "🔧 配置 TURN 服务器和 HTTPS..."
echo "   TURN 服务器: $TURN_SERVER_IP"
echo "   TURN 用户名: $TURN_USER"
echo "   HTTPS: $HTTPS_ENABLED"
if [ "$HTTPS_ENABLED" = "true" ]; then
  echo "   证书路径: $HTTPS_CERT_PATH"
fi

# 替换 editor.js 中的 TURN 配置
sed -i.bak "s/const TURN_SERVER = '.*';/const TURN_SERVER = '${TURN_SERVER_IP}';/" public/editor.js
sed -i.bak "s/const TURN_USER = '.*';/const TURN_USER = '${TURN_USER}';/" public/editor.js
sed -i.bak "s/const TURN_PASSWORD = '.*';/const TURN_PASSWORD = '${TURN_PASSWORD}';/" public/editor.js

# 更新 pm2.config.js 中的 HTTPS 配置
if [ "$HTTPS_ENABLED" = "true" ]; then
  sed -i.bak 's/HTTPS_ENABLED: false/HTTPS_ENABLED: true/' pm2.config.js
  sed -i.bak "s|HTTPS_KEY_PATH: '.*'|HTTPS_KEY_PATH: '${HTTPS_KEY_PATH}'|" pm2.config.js
  sed -i.bak "s|HTTPS_CERT_PATH: '.*'|HTTPS_CERT_PATH: '${HTTPS_CERT_PATH}'|" pm2.config.js
else
  sed -i.bak 's/HTTPS_ENABLED: true/HTTPS_ENABLED: false/' pm2.config.js
fi

# 删除备份文件
rm -f public/editor.js.bak pm2.config.js.bak

echo "✅ 配置完成！"

# 验证配置
echo ""
echo "📋 当前配置："
echo "   TURN 配置:"
head -10 public/editor.js | grep -E "TURN_(SERVER|USER|PASSWORD)"
if [ "$HTTPS_ENABLED" = "true" ]; then
  echo "   HTTPS 配置:"
  grep -E "HTTPS_(ENABLED|KEY_PATH|CERT_PATH)" pm2.config.js
else
  echo "   HTTP 模式（未启用 HTTPS）"
fi
