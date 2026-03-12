#!/bin/bash
# 修复数据库中公开/私密文档的一致性

echo "正在修复数据库..."
echo ""

# 备份数据库
cp co-editor.db co-editor.db.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ 数据库已备份"

# 修复密码字段一致性
echo "修复密码字段一致性..."
sqlite3 co-editor.db <<SQL
-- 将没有密码的文档标记为公开
UPDATE documents SET is_public=1, password_hash=NULL WHERE password_hash IS NULL OR password_hash='';

-- 将有密码且 is_public 为 NULL 的文档标记为私密
UPDATE documents SET is_public=0 WHERE is_public IS NULL AND password_hash IS NOT NULL AND password_hash != '';

-- 确保布尔值一致
UPDATE documents SET is_public=0 WHERE is_public != 1 AND password_hash IS NOT NULL AND password_hash != '';
UPDATE documents SET is_public=1 WHERE is_public != 0 AND (password_hash IS NULL OR password_hash='');
SQL

echo ""
echo "✅ 修复完成"
echo ""
echo "当前文档状态："
sqlite3 co-editor.db "SELECT id, is_public, CASE WHEN password_hash IS NULL THEN '无密码' ELSE '有密码' END as 密码状态 FROM documents;"
