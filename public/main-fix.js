// main.js 的修复补丁 - 添加文档ID验证

// 在 createDocument 函数调用前，添加验证：

// 文档ID验证
const docIdPattern = /^[a-zA-Z0-9_-]+$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 50;

if (!docId) {
  alert('请输入文档 ID');
  return;
}

// 验证长度
if (docId.length < MIN_LENGTH) {
  alert(`文档 ID 至少需要 ${MIN_LENGTH} 个字符`);
  return;
}

if (docId.length > MAX_LENGTH) {
  alert(`文档 ID 最多只能有 ${MAX_LENGTH} 个字符`)
  return;
}

// 验证格式
if (!docIdPattern.test(docId)) {
  alert('文档 ID 只能包含字母、数字、下划线和横线：\n只允许输入：a-z, A-Z, 0-9, _, -\n示例：my-doc, Doc01, test_123');
  return;
}

// 检查文档是否已存在（如果在前端创建）
// 注意：后端会也检查，但这里提前提示更好
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

return; // 阻止继续执行

// 完整的修复代码请替换 main.js 的验证部分
