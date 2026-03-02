#!/usr/bin/env node

/**
 * image_generator.js - AI 图片生成工具
 *
 * 支持多种 AI 图片生成服务：
 * - Hugging Face Inference API（免费，推荐）
 * - Stability AI（需要 API Key）
 * - Replicate（需要 API Key）
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class ImageGenerator {
  constructor(config = {}) {
    this.huggingFaceToken = config.huggingFaceToken || process.env.HUGGINGFACE_TOKEN;
    this.stabilityKey = config.stabilityKey || process.env.STABILITY_API_KEY;
    this.replicateKey = config.replicateKey || process.env.REPLICATE_API_KEY;
  }

  /**
   * Hugging Face 图片生成（免费，推荐）
   * 模型: stable-diffusion-xl-base-1.0
   */
  async generateWithHuggingFace(prompt, options = {}) {
    const model = options.model || 'stabilityai/stable-diffusion-xl-base-1.0';
    const negative_prompt = options.negative_prompt || '';
    const width = options.width || 1024;
    const height = options.height || 1024;

    console.log('🎨 使用 Hugging Face 生成图片...');

    const data = JSON.stringify({
      inputs: prompt,
      parameters: {
        negative_prompt: negative_prompt,
        width: width,
        height: height,
        num_inference_steps: 25,
        guidance_scale: 7.5
      }
    });

    const result = await this.makeRequest({
      hostname: 'api-inference.huggingface.co',
      path: `/models/${model}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.huggingFaceToken}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      body: data
    });

    // 结果是 base64 编码的图片
    if (result.type === 'image/png' || result.type === 'image/jpeg') {
      return result.buffer;
    }

    throw new Error('Unexpected response format');
  }

  /**
   * Stability AI 图片生成
   */
  async generateWithStability(prompt, options = {}) {
    if (!this.stabilityKey) {
      throw new Error('Stability AI API Key 未设置');
    }

    console.log('🎨 使用 Stability AI 生成图片...');

    const engine = options.engine || 'stable-diffusion-xl-1024-v1-0';
    const negative_prompt = options.negative_prompt || '';
    const width = options.width || 1024;
    const height = options.height || 1024;

    const data = JSON.stringify({
      text_prompts: [
        { text: prompt, weight: 1 },
        { text: negative_prompt, weight: -1 }
      ],
      cfg_scale: 7,
      height: height,
      width: width,
      steps: 25,
      samples: 1
    });

    const result = await this.makeRequest({
      hostname: 'api.stability.ai',
      path: `/v1/generation/${engine}/text-to-image`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stabilityKey}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Accept': 'application/json'
      },
      body: data
    });

    const artifacts = JSON.parse(result).artifacts;
    return Buffer.from(artifacts[0].base64, 'base64');
  }

  /**
   * Replicate 图片生成
   */
  async generateWithReplicate(prompt, options = {}) {
    if (!this.replicateKey) {
      throw new Error('Replicate API Key 未设置');
    }

    console.log('🎨 使用 Replicate 生成图片...');

    const version = options.version || 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b';

    // 需要先创建预测，然后查询结果
    const createData = JSON.stringify({
      version: version,
      input: {
        prompt: prompt,
        negative_prompt: options.negative_prompt || '',
        width: options.width || 1024,
        height: options.height || 1024,
        num_inference_steps: 25,
        guidance_scale: 7.5
      }
    });

    const createResponse = await this.makeRequest({
      hostname: 'api.replicate.com',
      path: '/v1/predictions',
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.replicateKey}`,
        'Content-Type': 'application/json',
        'Content-Length': createData.length
      },
      body: createData
    });

    const prediction = JSON.parse(createResponse);

    // 轮询直到完成
    let result = prediction;
    while (result.status === 'starting' || result.status === 'processing') {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const checkResponse = await this.makeRequest({
        hostname: 'api.replicate.com',
        path: `/v1/predictions/${result.id}`,
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.replicateKey}`
        }
      });

      result = JSON.parse(checkResponse);
      console.log(`   状态: ${result.status}`);
    }

    if (result.status === 'succeeded') {
      // 下载图片
      const imageResponse = await this.makeRequest({
        hostname: 'replicate.delivery',
        path: result.output[0].replace('https://replicate.delivery', ''),
        method: 'GET'
      });

      return imageResponse.buffer;
    }

    throw new Error(`Generation failed: ${result.error}`);
  }

  /**
   * 通用请求方法
   */
  makeRequest(options) {
    return new Promise((resolve, reject) => {
      const lib = options.hostname.includes('localhost') ? http : https;

      const req = lib.request(options, (res) => {
        let data = [];

        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.join('')}`));
          } else {
            resolve({
              buffer: Buffer.concat(data),
              type: res.headers['content-type'],
              data: data.join('')
            });
          }
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * 保存图片到文件
   */
  saveImage(buffer, filepath) {
    fs.writeFileSync(filepath, buffer);
    console.log(`✅ 图片已保存: ${filepath}`);
    return filepath;
  }
}

// 便捷函数：生成并保存图片
async function generateAndSave(prompt, filepath, options = {}) {
  const generator = new ImageGenerator(options);

  let buffer;

  // 优先使用免费服务
  if (generator.huggingFaceToken) {
    buffer = await generator.generateWithHuggingFace(prompt, options);
  } else if (generator.stabilityKey) {
    buffer = await generator.generateWithStability(prompt, options);
  } else if (generator.replicateKey) {
    buffer = await generator.generateWithReplicate(prompt, options);
  } else {
    throw new Error('未配置任何 AI 图片生成服务，请设置 API Key');
  }

  const fullPath = path.resolve(filepath);
  generator.saveImage(buffer, fullPath);

  return fullPath;
}

// 默认使用 Hugging Face（免费）
module.exports = {
  ImageGenerator,
  generateAndSave
};
