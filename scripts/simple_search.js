#!/usr/bin/env node

/**
 * simple_search.js - 简单的搜索功能示例
 *
 * 使用 Playwright 实现 Google 搜索
 */

const { BrowserHelper } = require('./browser_helper');

async function search(query) {
  console.log(`🔍 搜索: ${query}\n`);

  const browser = new BrowserHelper({ headless: false });

  try {
    // 访问 Google
    await browser.goto('https://www.google.com');

    // 输入搜索关键词
    await browser.fill('textarea[name="q"]', query);

    // 等待一下（模拟人类操作）
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 提交搜索（按回车）
    await browser.evaluate(() => {
      const form = document.querySelector('form');
      form.submit();
    });

    // 等待搜索结果加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 获取搜索结果
    const results = await browser.evaluate(() => {
      const items = document.querySelectorAll('.g');
      return Array.from(items).map(item => {
        const titleEl = item.querySelector('h3');
        const linkEl = item.querySelector('a');
        const snippetEl = item.querySelector('.VwiC3b, .st');

        return {
          title: titleEl?.innerText || '',
          url: linkEl?.href || '',
          snippet: snippetEl?.innerText || ''
        };
      }).filter(item => item.url);
    });

    console.log(`找到 ${results.length} 个结果：\n`);

    results.slice(0, 5).forEach((item, index) => {
      console.log(`[${index + 1}] ${item.title}`);
      console.log(`    ${item.url}`);
      console.log(`    ${item.snippet.substring(0, 100)}...\n`);
    });

    // 保持浏览器打开
    console.log('\n浏览器窗口已打开，你可以查看搜索结果。');
    console.log('按 Ctrl+C 关闭浏览器...\n');

    // 等待用户手动关闭
    await new Promise(resolve => {
      process.on('SIGINT', () => {
        console.log('\n正在关闭浏览器...');
        resolve();
      });
    });

  } catch (error) {
    console.error('❌ 搜索失败:', error.message);
  } finally {
    await browser.close();
  }
}

// 命令行使用
const query = process.argv.slice(2).join(' ') || 'OpenClaw AI';
search(query);
