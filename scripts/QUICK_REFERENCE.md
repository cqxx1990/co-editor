# AI 图片生成 - 快速参考

## 免费方案（推荐）

### Hugging Face（免费，无需信用卡）

**注册步骤（3 分钟）：**
1. https://huggingface.co/join - 注册账户
2. https://huggingface.co/settings/tokens - 创建 Token
3. 复制 Token（格式：hf_xxxxx...）

**配置 Token：**
```bash
# 临时设置
export HUGGINGFACE_TOKEN=hf_你的Token

# 持久化（添加到 ~/.zshrc）
echo 'export HUGGINGFACE_TOKEN=hf_你的Token' >> ~/.zshrc
source ~/.zshrc
```

---

## 快速使用

### 命令行测试

```bash
cd /Users/mac/Desktop/work/co-editor

# 确保设置 Token
export HUGGINGFACE_TOKEN=hf_你的Token

# 运行测试
node scripts/test_image.js

# 查看示例
node scripts/image_examples.js
```

### 代码中使用

```javascript
const { generateAndSave } = require('./scripts/image_generator.js');

// 简单生成
await generateAndSave(
  '一只可爱的猫',  // 提示词
  '/tmp/cat.png',  // 保存路径
  {
    huggingFaceToken: 'hf_你的Token'
  }
);
```

---

## 提示词模板

### 基础结构
```
[主体] + [风格] + [光照] + [细节] + [质量]

示例：
一只猫（主体）+ 水彩画风格（风格）+ 晨光（光照）+ 坐在草地上（细节）+ 高细节（质量）
```

### 推荐风格
**风格类型：**
- 水彩画风格
- 油画风格
- 3D渲染
- 照片级
- 扁平设计
- 吉卜力风格
- 赛博朋克风格

**质量关键词：**
- 4K / 8K
- 高细节
- 专业摄影
- 电影级

**负面提示词：**
```
blur, low quality, ugly, deformed, watermark, text
```

---

## 常用场景

### UI 设计
```javascript
await generateAndSave(
  '现代简约风格登录页面，蓝白配色，居中布局，优雅',
  '/tmp/login-ui.png'
);
```

### 图标生成
```javascript
await generateAndSave(
  '极简设置图标，圆形，扁平设计，蓝色',
  '/tmp/icon.png',
  {
    width: 512,
    height: 512,
    model: 'runwayml/stable-diffusion-v1-5'
  }
);
```

### 营销海报
```javascript
await generateAndSave(
  'SaaS产品发布海报，科技感，蓝色渐变，简洁现代',
  '/temp/poster.png',
  {
    width: 1080,
    height: 1920,
    negative_prompt: '文字，水印'
  }
);
```

---

## 免费额度

**Hugging Face：**
- 每天：1000 次调用
- 速度：5-10 秒/张
- 质量：优秀（SDXL）
- 费用：免费

---

## 文件说明

```
scripts/
├── image_generator.js        # 核心生成工具
├── IMAGE_GENERATOR_GUIDE.md  # 完整指南
├── test_image.js            # 测试脚本
├── image_examples.js        # 示例集合
└── QUICK_REFERENCE.md       # 本文件
```

---

## 故障排查

### ❌ Token 无效
```
解决：
1. 检查 Token 是否正确
2. 确认 Token 有读取权限（Read）
3. 尝试重新生成 Token
```

### ❌ 模型加载中
```
等待 1-2 分钟后重试
（首次加载需要时间）
```

### ❌ 超出免费额度
```
等待第二天重置（每天 1000 次）
或升级付费计划
```

---

_3 分钟注册，免费使用，立即开始 🎨_
