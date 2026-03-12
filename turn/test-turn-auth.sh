#!/bin/bash
# TURN 认证测试脚本

# 从 editor.js 读取配置
EDITOR_JS="../public/editor.js"

if [ ! -f "$EDITOR_JS" ]; then
    echo "❌ 找不到 editor.js 文件"
    exit 1
fi

# 提取配置
TURN_SERVER=$(grep "const TURN_SERVER = '" "$EDITOR_JS" | head -1 | sed "s/.*'\(.*\)'.*/\1/")
TURN_USER=$(grep "const TURN_USER = '" "$EDITOR_JS" | head -1 | sed "s/.*'\(.*\)'.*/\1/")
TURN_PASSWORD=$(grep "const TURN_PASSWORD = '" "$EDITOR_JS" | head -1 | sed "s/.*'\(.*\)'.*/\1/")

echo "========================================="
echo "TURN 认证测试"
echo "========================================="
echo ""
echo "从 editor.js 读取的配置："
echo "  服务器: $TURN_SERVER"
echo "  用户名: $TURN_USER"
echo "  密码: $TURN_PASSWORD"
echo ""

# 方法 1: 使用 turn-client
if command -v turn-client &> /dev/null; then
    echo "【方法 1】使用 turn-client 测试认证"
    echo "   turn-client -u '$TURN_USER' -w '$TURN_PASSWORD' -p $TURN_SERVER 3478"
    echo ""

    turn-client -u "$TURN_USER" -w "$TURN_PASSWORD" -p "$TURN_SERVER" 3478 2>&1 | head -20
    RESULT=$?

    if [ $RESULT -eq 0 ]; then
        echo ""
        echo "✅ TURN 认证成功！"
    else
        echo ""
        echo "❌ TURN 认证失败"
        echo "   可能原因："
        echo "   1. 用户名或密码错误"
        echo "   2. TURN 服务器未启动"
        echo "   3. 防火墙阻止"
        echo "   4. 密码中的特殊字符（如分号）被 shell 解释"
    fi
else
    echo "⚠️  turn-client 未安装"
    echo "   安装方式: brew install turn"
    echo ""
fi

# 方法 2: 使用 telnet 测试连接
echo ""
echo "【方法 2】测试 TCP 连接（coturn 需要）"
echo "   telnet $TURN_SERVER 3478"
echo ""

if command -v telnet &> /dev/null; then
    timeout 3 bash -c "echo '' | telnet $TURN_SERVER 3478" 2>&1 | head -5
    RESULT=$?

    if [ $RESULT -eq 0 ] || [ $RESULT -eq 124 ]; then
        echo "✅ TCP 连接成功"
    else
        echo "❌ TCP 连接失败"
        echo "   检查点："
        echo "   1. 服务器是否启动: docker ps | grep coturn"
        echo "   2. 防火墙是否开放 3478/tcp"
        echo "   3. 云服务器安全组是否开放 3478"
    fi
else
    echo "⚠️  telnet 未安装，使用 nc 测试..."
    if timeout 3 bash -c "cat < /dev/null > /dev/tcp/$TURN_SERVER/3478" 2>/dev/null; then
        echo "✅ TCP 连接成功"
    else
        echo "❌ TCP 连接失败"
    fi
fi

# 方法 3: 使用 curl（测试 HTTP/TURN 端点）
echo ""
echo "【方法 3】测试 TURN 端点响应"
if command -v curl &> /dev/null; then
    RESPONSE=$(timeout 2 curl -s "http://$TURN_SERVER:3478" 2>&1 || echo "TIMEOUT")

    if [ "$RESPONSE" = "TIMEOUT" ] || [ -z "$RESPONSE" ]; then
        echo "   ⚠️  这可能是正常的，TURN 协议不是 HTTP"
    else
        echo "   响应: $RESPONSE"
    fi
fi

echo ""
echo "========================================="
echo "诊断建议"
echo "========================================="
echo ""
echo "如果认证失败，按顺序检查："
echo ""
echo "1️⃣  检查 TURN 服务器是否运行"
echo "   ssh root@$(dig +short $TURN_SERVER | head -1)"
echo "   docker ps | grep coturn"
echo "   docker logs coeditor-turn"
echo ""
echo "2️⃣  检查防火墙"
echo "   sudo ufw status"
echo "   需要开放: 3478/tcp"
echo ""
echo "3️⃣  检查用户名密码"
echo "   查看 turn/.env 文件或 start.sh 中的配置"
echo "   确保与 editor.js 中的配置一致"
echo ""
echo "4️⃣  重启 TURN 服务器"
echo "   cd turn && ./start-fixed.sh"
echo ""
echo "========================================="
