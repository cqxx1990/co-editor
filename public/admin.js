// admin.js - 管理后台逻辑

const apiUrl = '/api/documents';

// 格式化日期
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

// 登录
async function adminLogin(password) {
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (data.success) {
      // 保存登录状态
      sessionStorage.setItem('admin-logged-in', 'true');
      showAdminPanel();
      loadDocuments();
    } else {
      document.getElementById('login-error').style.display = 'block';
    }
  } catch (error) {
    alert('登录失败: ' + error.message);
  }
}

// 加载文档列表
async function loadDocuments() {
  const tbody = document.getElementById('documents-table-body');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">加载中...</td></tr>';

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.success && data.documents && data.documents.length > 0) {
      tbody.innerHTML = data.documents.map(doc => `
        <tr>
          <td><code>${escapeHtml(doc.id)}</code></td>
          <td>${escapeHtml(doc.creator_id)}</td>
          <td>
            ${doc.is_public
              ? '<span class="admin-badge badge-public">🔓 公开</span>'
              : '<span class="admin-badge badge-private">🔒 私密</span>'}
          </td>
          <td>${formatDate(doc.created_at)}</td>
          <td>${formatDate(doc.updated_at)}</td>
          <td>
            <a href="/editor.html#${doc.id}" class="btn btn-sm btn-primary">查看</a>
            <button class="btn btn-sm btn-danger" onclick="resetPassword('${doc.id}')">重置密码</button>
            <button class="btn btn-sm btn-danger" onclick="deleteDocument('${doc.id}')">删除</button>
          </td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">暂无文档</td></tr>';
    }
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading" style="color: red;">加载失败: ${error.message}</td></tr>`;
  }
}

// 重置密码
async function resetPassword(docId) {
  if (!confirm(`确要删除文档 "${docId}" 的密码吗？`)) {
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/${docId}/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: '' }) // 清空密码
    });

    const data = await response.json();

    if (data.success) {
      alert('密码已重置（删除）');
      loadDocuments();
    } else {
      alert('操作失败: ' + JSON.stringify(data));
    }
  } catch (error) {
    alert('操作失败: ' + error.message);
  }
}

// 删除文档
async function deleteDocument(docId) {
  if (!confirm(`确要删除文档 "${docId}" 吗？此操作不可恢复！`)) {
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/${docId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      alert('文档已删除');
      loadDocuments();
    } else {
      alert('删除失败: ' + JSON.stringify(data));
    }
  } catch (error) {
    alert('删除失败: ' + error.message);
  }
}

// 显示管理面板
function showAdminPanel() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('admin-panel').style.display = 'block';
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  // 检查登录状态
  if (sessionStorage.getItem('admin-logged-in') === 'true') {
    showAdminPanel();
    loadDocuments();
  }

  // 登录表单
  document.getElementById('login').addEventListener('submit', (e) => {
    e.preventDefault();

    const password = document.getElementById('admin-password').value;
    if (!password) {
      alert('请输入密码');
      return;
    }

    adminLogin(password);
  });
});

console.log('🔧 管理后台已启动');
