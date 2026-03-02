#!/usr/bin/env node

/**
 * quick_test.js - 快速测试 Playwright 是否可用
 */

const { chromium } = require('playwright');

async function quickTest() {
  console.log('🧪 测试 Playwright 可用性...\n');

  try {
    console.log('📍 尝试启动 Chromium...');
    const browser = await chromium.launch({
      headless: true  // 先用无头模式快速测试
    });

    console.log('✅ Chromium 启动成功');

    const page = await browser.newPage();
    await page.goto('https://example.com');

    const title = await page.title();
    console.log('✅ 页面访问成功');
    console.log(`   标题: ${title}`);

    await browser.close();
    console.log('✅ 浏览器关闭成功');

    console.log('\n🎉 Playwright 可用！可以开始使用了。');

  } catch (error) {
    console.error('\n❌ 测试失败:');
    console.error(error.message);
    console.error('\n可能原因:');
    console.error('1. Chromium 还在下载中（需要 3-5 分钟）');
    console.error('2. 网络连接问题');
    console.error('3. 系统资源不足');
    console.error('\n解决方法:');
    console.error('- 如果在下载中，请等待几分钟后再试');
    console.error('- 检查网络连接');
    console.error('- 关闭其他应用释放内存');
  }
}

quickTest();
