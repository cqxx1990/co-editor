// main.js - 文档列表逻辑

const apiUrl = '/api/documents';
const deviceId = localStorage.getItem('co-editor-device-id') || generateDeviceId();

// 生成设备 ID
function generateDeviceId() {
  const id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('co-editor-device-id', id);
  return id;
}

// 格式化日期
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

// 加载文档列表
async function loadDocuments() {
  const listContainer = document.getElementById('documents-list');
  listContainer.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const response = await fetch(`${apiUrl}?user_id=${deviceId}`);
    const data = await response.json();

    if (data.success && data.documents && data.documents.length > 0) {
      listContainer.innerHTML = data.documents.map(doc => `
        <div class="document-card">
          <div class="document-info">
            <h3>${escapeHtml(doc.id)}</h3>
            <div class="document-meta">
              <span>📅 创建于 ${formatDate(doc.created_at)}</span>
              <span>🕒 更新于 ${formatDate(doc.updated_at)}</span>
              ${doc.is_public ? '<span class="badge badge-public">🔓 公开</span>' : '<span class="badge badge-private">🔒 私密</span>'}
            </div>
          </div>
          <div class="document-actions">
            <a href="/editor.html#${doc.id}" class="btn btn-primary">编辑</a>
            ${doc.creator_id === deviceId ? `<button class="btn btn-danger" onclick="deleteDocument('${doc.id}')">删除</button>` : ''}
          </div>
        </div>
      `).join('');
    } else {
      listContainer.innerHTML = `
        <div class="empty">
          <p>还没有任何文档</p>
          <button class="btn btn-primary" onclick="openCreateModal()">创建第一个文档</button>
        </div>
      `;
    }
  } catch (error) {
    listContainer.innerHTML = `
      <div class="error">
        <p>加载失败: ${error.message}</p>
        <button class="btn btn-secondary" onclick="loadDocuments()">重试</button>
      </div>
    `;
  }
}

// 创建文档
async function createDocument(docId, password) {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: docId,
        password: password,
        creator_id: deviceId
      })
    });

    const data = await response.json();

    if (data.success) {
      alert('文档创建成功！');
      closeCreateModal();
      loadDocuments();
      // 跳转到编辑器
      window.location.href = `/editor.html#${docId}`;
    } else {
      alert('创建失败: ' + (data.error || '未知错误'));
    }
  } catch (error) {
    alert('创建失败: ' + error.message);
  }
}

// 删除文档（仅创建者可见入口）
async function deleteDocument(docId) {
  const confirmed = confirm(`确定删除文档 "${docId}"？此操作不可恢复。`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/documents/${docId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ creator_id: deviceId })
    });

    const data = await response.json();

    if (data.success) {
      alert('文档已删除');
      loadDocuments();
    } else {
      alert('删除失败: ' + (data.error || '无权限或未知错误'));
    }
  } catch (error) {
    alert('删除失败: ' + error.message);
  }
}

// 打开创建模态框
function openCreateModal() {
  document.getElementById('create-modal').style.display = 'flex';
  document.getElementById('doc-id').value = '';
  document.getElementById('doc-password').value = '';
  document.getElementById('has-password').checked = false;
  document.getElementById('password-group').style.display = 'none';
}

// 关闭创建模态框
function closeCreateModal() {
  document.getElementById('create-modal').style.display = 'none';
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  // 加载文档列表
  loadDocuments();

  // 密码复选框
  document.getElementById('has-password').addEventListener('change', (e) => {
    document.getElementById('password-group').style.display = e.target.checked ? 'block' : 'none';
  });

  // 创建表单提交
  document.getElementById('create-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const docId = document.getElementById('doc-id').value.trim();
    const hasPassword = document.getElementById('has-password').checked;
    const password = hasPassword ? document.getElementById('doc-password').value : '';

    if (!docId) {
      alert('请输入文档 ID');
      return;
    }

    // 文档ID验证
    const docIdPattern = /^[a-zA-Z0-9_-]+$/;
    const MIN_LENGTH = 3;
    const MAX_LENGTH = 50;

    if (docId.length < MIN_LENGTH) {
      alert(`文档 ID 至少需要 ${MIN_LENGTH} 个字符`);
      return;
    }

    if (docId.length > MAX_LENGTH) {
      alert(`文档 ID 最多只能有 ${MAX_LENGTH} 个字符`);
      return;
    }

    if (!docIdPattern.test(docId)) {
      alert('文档 ID 只能包含字母、数字、下划线和横线：\n只允许输入：a-z, A-Z, 0-9, _, -\n示例：my-doc, Doc01, test_123');
      return;
    }

    // 检查文档是否已存在
    fetch(`/api/documents/${docId}`)
      .then(res => res.json())
      .then(data => {
        if (data.document || data.documents?.some(d => d.id === docId)) {
          const confirmed = confirm(`文档 ID "${docId}" 已被占用，是否要编辑该文档？`);
          if (confirmed) {
            window.location.href = `/editor.html#${docId}`;
            return;
          }
        } else {
          // 文档不存在，继续创建
          createDocument(docId, password);
        }
      })
      .catch(() => {
        // 如果检查失败，继续尝试创建（后端会再次验证）
        createDocument(docId, password);
      });

    return; // 已在上面处理，阻止执行后续代码
  });

  // 点击模态框外部关闭
  document.getElementById('create-modal').addEventListener('click', (e) => {
    if (e.target.id === 'create-modal') {
      closeCreateModal();
    }
  });
});
