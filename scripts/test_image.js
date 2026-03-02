#!/usr/bin/env node

/**
 * test_image.js - 测试图片生成功能
 */

const { generateAndSave } = require('./image_generator');

async function test() {
  console.log('🎨 开始测试 AI 图片生成...\n');

  // 检查 API Token
  const token = process.env.HUGGINGFACE_TOKEN;

  if (!token) {
    console.error('❌ 错误：未设置 HUGGINGFACE_TOKEN 环境变量');
    console.error('\n请先执行以下步骤：');
    console.error('1. 注册 Hugging Face 账户：https://huggingface.co/join');
    console.error('2. 创建 Access Token：https://huggingface.co/settings/tokens');
    console.error('3. 设置 Token：');
    console.error('   export HUGGINGFACE_TOKEN=hf_你的Token\n');
    console.error('或者直接在命令中设置：');
    console.error('   HUGGINGFACE_TOKEN=hf_你的Token node scripts/test_image.js\n');
    return;
  }

  console.log(`✅ Token 已设置: ${token.substring(0, 10)}...\n`);

  try {
    // 测试生成
    const prompts = [
      '一只可爱的橘色猫咪，坐在窗台上，阳光透过窗户照射，柔和光线',
      '未来城市的日出，赛博朋克风格，霓虹灯，雨夜',
      '梦幻般的森林，吉卜力风格，绿意盎然，神奇生物'
    ];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log(`📍 [${i + 1}/${prompts.length}] 生成: ${prompt.substring(0, 30)}...`);

      const outputDir = '/tmp/ai-generated-images';
      const filename = `image-${Date.now()}-${i}.png`;
      const filepath = path.join(outputDir, filename);

      // 确保目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 生成并保存
      await generateAndSave(prompt, filepath, {
        huggingFaceToken: token,
        width: 1024,
        height: 1024
      });

      console.log(`   ✅ 已保存: ${filepath}\n`);

      // 避免请求过快
      if (i < prompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`🎉 测试完成！生成的图片保存在: /tmp/ai-generated-images/\n`);
    console.log('提示：使用以下命令查看图片：');
    console.log('  open /tmp/ai-generated-images/\n');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);

    if (error.message.includes('401')) {
      console.error('\n提示：Token 可能无效，请检查：');
      console.error('1. Token 是否正确复制');
      console.error('2. Token 是否有读取权限（Read）');
      console.error('3. Token 是否已激活\n');
    } else if (error.message.includes('429')) {
      console.error('\n提示：请求过于频繁或超出免费额度');
      console.error('1. 等待几分钟后再试');
      console.error('2. 或升级到付费计划\n');
    } else if (error.message.includes('Model is loading')) {
      console.error('\n提示：模型正在加载中，请稍等片刻后再试');
      console.error('首次加载需要约 1-2 分钟\n');
    }
  }
}

const path = require('path');
const fs = require('fs');

// 运行测试
test();
