// database.js - SQLite3 数据库封装 (v2)
const Database = require('better-sqlite3');
const path = require('path');

class CoEditorDB {
  constructor(dbPath = './co-editor.db') {
    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    // 检查表是否存在和结构
    const tableInfo = this.db.prepare("PRAGMA table_info(documents)").all();
    const hasCreator = tableInfo.some(c => c.name === 'creator_id');
    const hasCreatedAt = tableInfo.some(c => c.name === 'created_at');

    // 如果缺少列，尝试添加
    if (tableInfo.length > 0) {
      try {
        if (!hasCreator) {
          this.db.exec("ALTER TABLE documents ADD COLUMN creator_id TEXT");
          this.db.exec("ALTER TABLE documents ADD COLUMN password_hash TEXT");
          this.db.exec("ALTER TABLE documents ADD COLUMN is_public INTEGER DEFAULT 1");
        }
        if (!hasCreatedAt) {
          this.db.exec("ALTER TABLE documents ADD COLUMN created_at INTEGER");
        }
      } catch (e) {
        // 忽略错误，可能是列已存在
      }
    }

    // 创建表（如果不存在）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        creator_id TEXT,
        password_hash TEXT,
        is_public INTEGER DEFAULT 1
      )
    `);
  }

  /**
   * 获取文档元数据 (不含内容)
   */
  getDocumentMeta(id) {
    const row = this.db.prepare('SELECT id, created_at, updated_at, creator_id, is_public FROM documents WHERE id = ?').get(id);
    return row || null;
  }

  /**
   * 获取文档完整内容（包含密码验证信息）
   */
  getDocument(id) {
    const row = this.db.prepare('SELECT content, created_at, updated_at, creator_id, is_public FROM documents WHERE id = ?').get(id);
    return row || null;
  }

  /**
   * 获取密码哈希
   */
  getPasswordHash(id) {
    const row = this.db.prepare('SELECT password_hash FROM documents WHERE id = ?').get(id);
    return row ? row.password_hash : null;
  }

  /**
   * 验证密码
   */
  verifyPassword(id, passwordHash) {
    const existingHash = this.getPasswordHash(id);
    if (!existingHash) return true; // 无密码保护
    return existingHash === passwordHash;
  }

  /**
   * 创建新文档
   */
  createDocument(id, creatorId, passwordHash = null) {
    const now = Date.now();
    const isPublic = passwordHash ? 0 : 1;

    const stmt = this.db.prepare(`
      INSERT INTO documents (id, content, created_at, updated_at, creator_id, password_hash, is_public)
      VALUES (?, '', ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(id, now, now, creatorId, passwordHash, isPublic);
      return { success: true, created_at: now };
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return { success: false, error: '文档 ID 已存在' };
      }
      throw e;
    }
  }

  /**
   * 保存文档内容
   */
  saveDocument(id, content) {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const stmt = this.db.prepare(`
      UPDATE documents 
      SET content = ?, updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(content, now, id);
    return { success: result.changes > 0, updated_at: now };
  }

  /**
   * 更新文档设置（密码）
   */
  updateDocumentSettings(id, passwordHash) {
    const isPublic = passwordHash ? 0 : 1;
    const now = Date.now();

    const stmt = this.db.prepare(`
      UPDATE documents 
      SET password_hash = ?, is_public = ?, updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(passwordHash, isPublic, now, id);
    return { success: result.changes > 0 };
  }

  /**
   * 列出所有文档
   */
  listDocuments() {
    const rows = this.db.prepare('SELECT id, created_at, updated_at, creator_id, is_public FROM documents ORDER BY updated_at DESC').all();
    return rows || [];
  }

  /**
   * 删除文档
   */
  deleteDocument(id) {
    const stmt = this.db.prepare('DELETE FROM documents WHERE id = ?');
    const result = stmt.run(id);
    return { success: result.changes > 0 };
  }

  /**
   * 关闭数据库
   */
  close() {
    this.db.close();
  }
}

module.exports = CoEditorDB;
