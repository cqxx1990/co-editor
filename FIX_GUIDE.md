# Co-Editor 修复指南

## Copilot 遇到权限问题

Copilot 无法直接修改 `/Users/mac/Desktop/work/co-editor` 目录下的文件，导致修复失败。

## 手动修复步骤

### 1. 修复 style.css - 模态框居中和 z-index

在 `public/style.css` 文件中，找到 `.modal` 和 `.password-overlay` 部分，替换为：

```css
/* 模态框 - 提升z-index以在遮罩之上 */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: none;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 2000;  /* 高于 password-overlay */
}

/* 密码遮罩层 - 降低z-index */
.password-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;  /* 低于 .modal */
}
```

### 2. 修复 main.js - 文档ID验证

在 `public/main.js` 的表单提交部分（约第132行之前），添加验证代码：

```javascript
// 文档ID验证
const docIdPattern = /^[a-zA-Z0-9_-]+$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 50;

if (!docId) {
  alert('请输入文档 ID');
  return;
}

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
      createDocument(docId, password);
    }
  })
  .catch(() => {
    createDocument(docId, password);
  });

return; // 已在上面处理，阻止执行原代码
```

### 3. 已完成的修复

✅ index.html 底部文案已修改为：`联系方式：624167284@qq.com`

✅ editor.html 底部文案已修改为：`联系方式：624167284@qq.com`

✅ editor.js 密码验证逻辑已修复（先尝试无密码加入）

## 剩余需要手动修复的文件

1. `public/style.css` - 模态框居中和 z-index
2. `public/main.js` - 文档ID验证

## 快速应用修复

```bash
cd /Users/mac/Desktop/work/co-editor

# 应用 style.css 修复
cat > style.patch << 'EOF'
.modal {
  z-index: 2000;
}
.password-overlay {
  z-index: 1000;
}
EOF
```

父上需要我继续手动修复这些文件吗？还是你想自己按照上面的步骤修复？

完成任务，请指示
