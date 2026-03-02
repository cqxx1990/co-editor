#!/usr/bin/env node

/**
 * test_browser.js - 测试无头浏览器功能
 */

const { BrowserHelper, fetchPage, webSearch } = require('./browser_helper');

async function test() {
  console.log('🚀 开始测试无头浏览器...\n');

  try {
    // 测试 1: 访问网页并获取内容
    console.log('📍 测试 1: 访问示例网站');
    const content = await fetchPage('https://example.com', {
      format: 'text',
      close: false
    });

    console.log('页面内容（前200字符）：');
    console.log(content.substring(0, 200) + '...\n');

    // 测试 2: Google 搜索
    console.log('\n📍 测试 2: Google 搜索');
    const results = await webSearch('OpenClaw AI', {
      searchEngine: 'google',
      close: false
    });

    console.log(`找到 ${results.length} 个结果：\n`);
    results.slice(0, 3).forEach((item, index) => {
      console.log(`[${index + 1}] ${item.title}`);
      console.log(`    ${item.url}`);
      console.log(`    ${item.snippet.substring(0, 100)}...\n`);
    });

    // 测试 3: 截图
    console.log('\n📍 测试 3: 截图');
    const helper = new BrowserHelper();
    await helper.goto('https://example.com');
    await helper.screenshot('/tmp/example-screenshot.png');
    console.log('✅ 截图已保存: /tmp/example-screenshot.png\n');

    // 关闭浏览器
    await helper.close();

    console.log('✅ 所有测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

test();
