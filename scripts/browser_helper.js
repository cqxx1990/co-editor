#!/usr/bin/env node

/**
 * browser_helper.js - 无头浏览器辅助工具
 *
 * 基于 Playwright，提供：
 * - 网页访问与抓取
 * - JavaScript 执行与渲染
 * - 截图与 PDF 导出
 * - 用户交互模拟（点击、输入等）
 */

const { chromium } = require('playwright');

class BrowserHelper {
  constructor(options = {}) {
    this.headless = options.headless ?? false; // 默认显示浏览器窗口
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * 启动浏览器
   */
  async launch() {
    if (this.browser) {
      return this.browser;
    }

    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    });

    console.log('✅ 浏览器已启动');
    return this.browser;
  }

  /**
   * 新建无痕上下文
   */
  async createContext() {
    if (!this.browser) {
      await this.launch();
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1920, headless: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    return this.context;
  }

  /**
   * 新建页面
   */
  async newPage() {
    if (!this.context) {
      await this.createContext();
    }

    this.page = await this.context.newPage();
    return this.page;
  }

  /**
   * 访问 URL（等待加载完成）
   */
  async goto(url, options = {}) {
    if (!this.page) {
      await this.newPage();
    }

    const defaultOptions = {
      waitUntil: 'networkidle', // 等待网络空闲
      timeout: 30000
    };

    await this.page.goto(url, { ...defaultOptions, ...options });
    console.log(`✅ 已访问: ${url}`);

    return this.page;
  }

  /**
   * 获取页面文本内容
   */
  async getText() {
    if (!this.page) {
      throw new Error('No active page');
    }

    return await this.page.evaluate(() => document.body.innerText);
  }

  /**
   * 获取页面 HTML
   */
  async getHTML() {
    if (!this.page) {
      throw new Error('No active page');
    }

    return await this.page.evaluate(() => document.documentElement.outerHTML);
  }

  /**
   * 获取页面 Markdown 格式（简单转换）
   */
  async getMarkdown() {
    const html = await this.getHTML();
    const { turndown } = require('turndown');
    const TurndownService = require('turndown');

    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });

    return turndownService.turndown(html);
  }

  /**
   * 执行 JavaScript 代码
   */
  async evaluate(script, ...args) {
    if (!this.page) {
      throw new Error('No active page');
    }

    return await this.page.evaluate(script, ...args);
  }

  /**
   * 等待选择器出现
   */
  async waitForSelector(selector, options = {}) {
    if (!this.page) {
      throw new Error('No active page');
    }

    return await this.page.waitForSelector(selector, options);
  }

  /**
   * 点击元素
   */
  async click(selector, options = {}) {
    if (!this.page) {
      throw new Error('No active page');
    }

    await this.page.click(selector, options);
    console.log(`✅ 已点击: ${selector}`);
  }

  /**
   * 输入文本
   */
  async fill(selector, text, options = {}) {
    if (!this.page) {
      throw new Error('No active page');
    }

    await this.page.fill(selector, text, options);
    console.log(`✅ 已输入: ${selector} = ${text}`);
  }

  /**
   * 截图
   */
  async screenshot(path, options = {}) {
    if (!this.page) {
      throw new Error('No active page');
    }

    const defaultOptions = {
      fullPage: true,
      type: 'png'
    };

    await this.page.screenshot({ ...defaultOptions, ...options, path });
    console.log(`✅ 已截图: ${path}`);

    return path;
  }

  /**
   * 导出 PDF
   */
  async pdf(path, options = {}) {
    if (!this.page) {
      throw new Error('No active page');
    }

    const defaultOptions = {
      format: 'A4',
      printBackground: true
    };

    await this.page.pdf({ ...defaultOptions, ...options, path });
    console.log(`✅ 已导出 PDF: ${path}`);

    return path;
  }

  /**
   * 搜索
   */
  async search(query, searchEngine = 'google') {
    const urls = {
      'google': 'https://www.google.com/search?q=',
      'bing': 'https://www.bing.com/search?q=',
      'baidu': 'https://www.baidu.com/s?wd='
    };

    const searchUrl = urls[searchEngine] || urls['google'];
    await this.goto(searchUrl + encodeURIComponent(query));

    // 等待搜索结果加载
    await this.page.waitForSelector('.g', { timeout: 10000 }).catch(() => {
      console.warn('⚠️ 搜索结果加载超时');
    });

    // 获取搜索结果
    const results = await this.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.g'));
      return items.map(item => {
        const titleEl = item.querySelector('h3');
        const linkEl = item.querySelector('a');
        const snippetEl = item.querySelector('.VwiC3b');

        return {
          title: titleEl?.innerText || '',
          url: linkEl?.href || '',
          snippet: snippetEl?.innerText || ''
        };
      }).filter(item => item.url);
    });

    return results;
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('✅ 浏览器已关闭');
    }
  }
}

// 便捷操作：快速访问并获取内容
async function fetchPage(url, options = {}) {
  const helper = new BrowserHelper(options);
  await helper.goto(url);

  let content;

  if (options.format === 'html') {
    content = await helper.getHTML();
  } else if (options.format === 'markdown') {
    content = await helper.getMarkdown();
  } else {
    content = await helper.getText();
  }

  if (options.close !== false) {
    await helper.close();
  }

  return content;
}

// 搜索功能
async function webSearch(query, options = {}) {
  const helper = new BrowserHelper(options);
  const results = await helper.search(query, options.searchEngine);

  if (options.close !== false) {
    await helper.close();
  }

  return results;
}

module.exports = {
  BrowserHelper,
  fetchPage,
  webSearch
};
