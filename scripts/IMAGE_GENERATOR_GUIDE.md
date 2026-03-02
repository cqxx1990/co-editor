# AI 图片生成使用指南

## 快速开始

### 免费方案（推荐）：Hugging Face

Hugging Face 提供免费的 Stable Diffusion XL 等模型 API，每月有免费额度。

### 注册步骤

#### 1. 注册 Hugging Face 账户

1. 访问：https://huggingface.co/join
2. 填写邮箱、用户名、密码
3. 验证邮箱

#### 2. 创建 Access Token

1. 登录后访问：https://huggingface.co/settings/tokens
2. 点击 "New token"
3. 选择 Type: "Read"（读取权限）
4. 命名 Token: "OpenClaw AI Assistant"
5. 点击 "Create token"
6. **复制 Token**（格式：hf_xxxxx...）

#### 3. 配置到 OpenClaw

**环境变量方式（推荐）：**
```bash
# 临时设置（当前会话）
export HUGGINGFACE_TOKEN=hf_你的Token

# 持久化设置（添加到 ~/.zshrc）
echo 'export HUGGINGFACE_TOKEN=hf_你的Token' >> ~/.zshrc
source ~/.zshrc
```

**在代码中使用：**
```javascript
const { generateAndSave } = require('./scripts/image_generator.js');

async function generate() {
  try {
    const imagePath = await generateAndSave(
      '一只可爱的猫，卡通风格，高细节',
      '/tmp/generated-image.png',
      {
        huggingFaceToken: 'hf_你的Token',
        width: 1024,
        height: 1024
      }
    );

    console.log('图片生成成功！路径:', imagePath);
  } catch (error) {
    console.error('生成失败:', error.message);
  }
}

generate();
```

---

## 付费方案（可选）

### Stability AI

专业级 AI 图片生成，提供大量免费额度后需要付费。

#### 注册步骤

1. 访问：https://platform.stability.ai/account/keys
2. 注册账户
3. 获取 API Key
4. 找到 "Stable Diffusion XL" 模型

#### 使用方式

```javascript
const { generateAndSave } = require('./scripts/image_generator.js');

await generateAndSave(
  '未来城市的日出，赛博朋克风格',
  '/tmp/city.png',
  {
    stabilityKey: 'sk-你的Key'
  }
);
```

### Replicate

提供多种 AI 模型，包括 Stable Diffusion XL、DALL-E 3 等。

#### 注册步骤

1. 访问：https://replicate.com/account/api-tokens
2. 注册账户（可使用 GitHub 登录）
3. 创建 API Token
4. 克隆到账户

#### 使用方式

```javascript
const { generateAndSave } = require('./scripts/image_generator.js');

await generateAndSave(
  '梦幻般的森林，吉卜力风格',
  '/tmp/forest.png',
  {
    replicateKey: 'r8_你的Key'
  }
);
```

---

## 完整示例

### 示例 1：生成单张图片

```javascript
const { ImageGenerator } = require('./scripts/image_generator.js');

async function example1() {
  const generator = new ImageGenerator({
    huggingFaceToken: 'hf_你的Token'
  });

  // 生成图片
  const buffer = await generator.generateWithHuggingFace(
    '一个可爱的机器人，3D渲染，柔和光线，背景简洁',
    {
      width: 1024,
      height: 1024
    }
  );

  // 保存图片
  generator.saveImage(buffer, '/tmp/robot.png');

  console.log('✅ 图片生成完成');
}

example1();
```

### 示例 2：批量生成

```javascript
const { ImageGenerator } = require('./scripts/image_generator.js');

async function example2() {
  const generator = new ImageGenerator({
    huggingFaceToken: 'hf_你的Token'
  });

  const prompts = [
    '樱花盛开，日本风情',
    '雪山日出，壮丽景色',
    '未来汽车，科幻风格'
  ];

  for (const prompt of prompts) {
    console.log(`生成中: ${prompt}`);
    const buffer = await generator.generateWithHuggingFace(prompt);
    const filename = prompt.substring(0, 10).replace(/\s+/g, '_') + '.png';
    generator.saveImage(buffer, `/tmp/${filename}`);
  }

  console.log('✅ 批量生成完成');
}

example2();
```

### 示例 3：质量优化

```javascript
const { generateAndSave } = require('./scripts/image_generator.js');

async function example3() {
  await generateAndSave(
    '专业肖像摄影，女性，柔和光线，高细节',
    '/tmp/portrait.png',
    {
      huggingFaceToken: 'hf_你的Token',
      negative_prompt: '模糊，低质量，丑陋',
      width: 1024,
      height: 1536,  // 纵向图片
      model: 'stabilityai/stable-diffusion-xl-base-1.0'
    }
  );
}

example3();
```

### 示例 4：不同模型

```javascript
const { ImageGenerator } = require('./scripts/image_generator.js');

async function example4() {
  const generator = new ImageGenerator({
    huggingFaceToken: 'hf_你的Token'
  });

  // 使用不同模型
  const models = {
    'SDXL（推荐）': 'stabilityai/stable-diffusion-xl-base-1.0',
    'DreamShaper': 'Lykon/DreamShaper',
    'Realistic Vision': 'runwayml/stable-diffusion-v1-5'
  };

  for (const [name, model] of Object.entries(models)) {
    const buffer = await generator.generateWithHuggingFace(
      '一只猫在花园里',
      { model }
    );
    generator.saveImage(buffer, `/tmp/${name}.png`);
  }

  console.log('✅ 不同模型对比完成');
}

example4();
```

---

## 参数说明

### 通用参数

| 参数 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `prompt` | String | 图片描述（必填） | - |
| `negative_prompt` | String | 负面提示（不需要的内容） | '' |
| `width` | Number | 图片宽度 | 1024 |
| `height` | Number | 图片高度 | 1024 |
| `model` | String | 模型名称（HF） | SDXL |

### 提示词（Prompt）优化

**好的提示词：**
```
✓ 一只可爱的猫，睡在沙发上，柔和光线，4K画质
✓ 未来城市，赛博朋克风格，霓虹灯，雨夜
✓ 梦幻森林，吉卜力风格，绿意盎然
```

**提示词模板：**
```
[主体] + [风格] + [光照] + [细节] + [质量]

示例：一只狗（主体）+ 水彩画风格（风格）+ 晨光（光照）+ 坐在草地上（细节）+ 高细节（质量）
```

**负面提示词（避免的内容）：**
```
✓ 模糊，低质量，丑陋，变形
✓ 水印，文字，徽标
✓ 多余肢体，多余手指
```

---

## 常见问题

### Q: 免费额度是多少？

**Hugging Face：**
- 每天：1000 次 API 调用
- 适合：个人使用、测试、学习

### Q: 生成速度？

**Hugging Face：**
- SDXL：约 5-10 秒/张
- SD 1.5：约 3-5 秒/张

### Q: 如何提高质量？

1. **详细描述**
   - 不要只说"一只猫"
   - 要说"一只可爱的橘色猫咪，坐在阳光下，软毛发，细节丰富"

2. **添加风格**
   - "水彩画风格"、"油画风格"、"3D渲染"、"照片级"

3. **指定光照**
   - "柔和光线"、"戏剧性光照"、"黄金时刻光线"

4. **质量关键词**
   - "4K"、"8K"、"高细节"、"专业摄影"

### Q: 如何避免不想要的内容？

使用 `negative_prompt`：
```javascript
{
  negative_prompt: '模糊，低质量，丑陋，水印，文字'
}
```

### Q: 支持中文吗？

部分模型支持中文，但建议使用英文描述：
```javascript
// 也可以用中文
'一只可爱的猫'

// 但英文效果更好
'a cute cat, soft fur, adorable'
```

---

## 模型推荐

### 免费 Hugging Face 模型

| 模型 | | 用途 | 质量 | 速度 |
|------|------|------|------|------|
| SDXL | | 通用 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Stable Diffusion 1.5 | | 多样 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| DreamShaper | | 艺术创作 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Realistic Vision | | 照片级 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

### 使用示例

```javascript
// SDXL（最佳）
await generator.generateWithHuggingFace('...', {
  model: 'stabilityai/stable-diffusion-xl-base-1.0'
});

// 快速生成
await generator.generateWithHuggingFace('...', {
  model: 'runwayml/stable-diffusion-v1-5'
});

// 艺术风格
await generator.generateWithHuggingFace('...', {
  model: 'Lykon/DreamShaper'
});

// 真实照片
await generator.generateWithHuggingFace('...', {
  model: 'SG161222/Realistic_Vision_V5.1_noVAE'
});
```

---

## 进阶技巧

### 1. 提示词工程

```javascript
// 基础
'一只猫'

// 添加风格
'一只猫，水彩画风格'

// 添加细节
'一只橘色猫咪，坐在窗台上，阳光透过窗户，软毛发'

// 添加质量
'一只橘色猫咪，坐在窗台上，阳光透过窗户，软毛发，4K，高细节'
```

### 2. 负面提示词

```javascript
{
  negative_prompt: 'blur, low quality, ugly, deformed, watermark, text, bad anatomy'
}
```

### 3. 尺寸选择

```javascript
// 方形
{ width: 1024, height: 1024 }

// 横向（风景、场景）
{ width: 1536, height: 1024 }

// 纵向（人物、肖像）
{ width: 1024, height: 1536 }

// 宽屏
{ width: 1920, height: 1080 }
```

### 4. 批量生成变体

```javascript
const basePrompt = '未来城市';
const styles = ['赛博朋克风格', '复古未来主义', '极简主义', '蒸汽朋克'];

for (const style of styles) {
  await generateAndSave(
    `${basePrompt}，${style}`,
    `/tmp/${style}.png`
  );
}
```

---

## 快速命令

### 测试生成

```bash
cd /Users/mac/Desktop/work/co-editor

# 确保 HUGGINGFACE_TOKEN 已设置
export HUGGINGFACE_TOKEN=hf_你的Token

# 运行测试脚本（我会创建）
node scripts/test_image.js
```

### 查看示例

```bash
# 查看完整使用指南
cat scripts/IMAGE_GENERATOR_GUIDE.md

# 查看生成器代码
cat scripts/image_generator.js
```

---

## 与阿杜结合

在阿杜的开发中，可以用于：

1. **生成 UI 设计图**
   ```javascript
   await generateAndSave('现代简约风格的登录页面设计，蓝白配色', '/tmp/login-design.png');
   ```

2. **生成图标**
   ```javascript
   await generateAndSave('一个圆形的设置图标，极简，扁平设计', '/tmp/settings-icon.png');
   ```

3. **生成产品原型**
   ```javascript
   await generateAndSave('AI助手界面设计，聊天窗口，现代感', '/temp/ai-ui.png');
   ```

4. **生成营销图**
   ```javascript
   await generateAndSave('产品发布海报，科技感，蓝色主题', '/temp/poster.png');
   ```

---

_免费、快速、高质量的 AI 图片生成 🎨_
