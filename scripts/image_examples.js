#!/usr/bin/env node

/**
 * image_examples.js - 图片生成示例集合
 *
 * 展示各种场景的图片生成用法
 */

const { ImageGenerator } = require('./image_generator');

async function example() {
  console.log('🎨 图片生成示例\n');

  const token = process.env.HUGGINGFACE_TOKEN;
  if (!token) {
    console.error('❌ 请先设置 HUGGINGFACE_TOKEN');
    console.error('export HUGGINGFACE_TOKEN=hf_你的Token\n');
    return;
  }

  const generator = new ImageGenerator({ huggingFaceToken: token });

  // 示例 1: UI 设计草图
  console.log('📍 示例 1: UI 设计草图');
  const uiBuffer = await generator.generateWithHuggingFace(
    '现代简约风格的登录页面设计，蓝白配色，居中布局，优雅',
    {
      width: 1024,
      height: 768
    }
  );
  generator.saveImage(uiBuffer, '/tmp/login-ui-design.png');
  console.log('   ✅ 已保存: /tmp/login-ui-design.png\n');

  await new Promise(resolve => setTimeout(resolve, 2000));

  // 示例 2: 图标生成
  console.log('📍 示例 2: 图标生成');
  const iconBuffer = await generator.generateWithHuggingFace(
    '一个极简的圆形设置图标，扁平设计，蓝色，512x512像素，矢量风格',
    {
      width: 512,
      height: 512,
      model: 'runwayml/stable-diffusion-v1-5'
    }
  );
  generator.saveImage(iconBuffer, '/tmp/settings-icon.png');
  console.log('   ✅ 已保存: /tmp/settings-icon.png\n');

  await new Promise(resolve => setTimeout(resolve, 2000));

  // 示例 3: 产品原型
  console.log('📍 示例 3: AI 助手界面设计');
  const aiBuffer = await generator.generateWithHuggingFace(
    'AI助手聊天界面设计，现代化，科技感，聊天窗口在左侧，深色主题',
    {
      width: 1024,
      height: 768
    }
  );
  generator.saveImage(aiBuffer, '/tmp/ai-chat-ui.png');
  console.log('   ✅ 已保存: /tmp/ai-chat-ui.png\n');

  await new Promise(resolve => setTimeout(resolve, 2000));

  // 示例 4: 营销海报
  console.log('📍 示例 4: 产品发布海报');
  const posterBuffer = await generator.generateWithHuggingFace(
    'SaaS产品发布海报，科技感，蓝色渐变，简洁现代，留白充足',
    {
      width: 1080,
      height: 1920,
      negative_prompt: '文字，水印，LOGO'
    }
  );
  generator.saveImage(posterBuffer, '/tmp/saas-poster.png');
  console.log('   ✅ 已保存: /tmp/saas-poster.png\n');

  console.log('🎉 所有示例生成完成！\n');
  console.log('查看生成的图片：');
  console.log('  open /tmp/*.png\n');
}

// 运行示例
example();
