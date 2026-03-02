# 无头浏览器使用指南 (Playwright)

## 快速开始

### 1. 基础用法

#### 网页抓取（执行 JS，等待加载）

```javascript
const { fetchPage } = require('./scripts/browser_helper.js');

// 获取文本内容
const text = await fetchPage('https://example.com');
console.log(text);

// 获取 HTML
const html = await fetchPage('https://example.com', { format: 'html' });

// 获取 Markdown
const md = await fetchPage('https://example.com', { format: 'markdown' });

// 保持浏览器打开（调试用）
await fetchPage('https://example.com', { close: false });
```

#### 网络搜索

```javascript
const { webSearch } = require('./scripts/browser_helper.js');

// Google 搜索
const results = await webSearch('OpenClaw AI');
console.log(results);

// 指定搜索引擎
const baiduResults = await webSearch('测试', {
  searchEngine: 'baidu',
  close: false
});

// 结果格式
const {
  title,      // 标题
  url,        // 链接
  snippet     // 摘要
} = results[0];
```

#### 高级控制

```javascript
const { BrowserHelper } = require('./scripts/browser_helper.js');

// 创建实例（默认显示浏览器窗口）
const browser = new BrowserHelper({
  headless: false  // true=无头模式，false=显示窗口
});

// 访问网页
await browser.goto('https://example.com');

// 获取页面文本
const text = await browser.getText();

// 获取 HTML
const html = await browser.getHTML();

// 获取 Markdown
const md = await browser.getMarkdown();

// 执行 JavaScript
const title = await browser.evaluate(() => document.title);
const viewport = await browser.evaluate(() => ({
  width: window.innerWidth,
  height: window.innerHeight
}));

// 等待元素出现
await browser.waitForSelector('.button');

// 点击元素
await browser.click('.button');

// 输入文本
await browser.fill('.input', 'hello world');

// 截图
await browser.screenshot('/tmp/screenshot.png');

// 导出 PDF
await browser.pdf('/tmp/document.pdf');

// 关闭浏览器
await browser.close();
```

### 2. 实战案例

#### 案例1：获取 GitHub README

```javascript
const { fetchPage } = require('./scripts/browser_helper.js');

async function fetchGitHubReadme(owner, repo) {
  const url = `https://github.com/${owner}/${repo}`;
  const html = await fetchPage(url, { format: 'html' });

  // 提取 README 内容（需要 JS 执行）
  const readme = await fetchPage(url, {
    format: 'text',
    waitUntil: 'load'  // 等待 DOM 加载完成
  });

  return readme;
}

const readme = await fetchGitHubReadme('openclaw', 'openclaw');
console.log(readme);
```

#### 案例2：模拟用户操作

```javascript
const { BrowserHelper } = require('./scripts/browser_helper.js');

async function automatedTask() {
  const browser = new BrowserHelper({ headless: false });

  // 访问登录页
  await browser.goto('https://example.com/login');

  // 输入用户名
  await browser.fill('#username', 'myusername');

  // 输入密码
  await browser.fill('#password', 'mypassword');

  // 点击登录按钮
  await browser.click('#login-button');

  // 等待跳转
  await browser.waitForSelector('.dashboard');

  // 获取用户信息
  const userInfo = await browser.evaluate(() => {
    return {
      username: document.querySelector('.username').textContent,
      email: document.querySelector('.email').textContent
    };
  });

  console.log(userInfo);

  // 截图保存
  await browser.screenshot('/tmp/dashboard.png');

  // 关闭浏览器
  await browser.close();
}
```

#### 案例3：爬取单页应用（SPA）

```javascript
const { BrowserHelper } = require('./scripts/browser_helper.js');

async function scrapeSPA() {
  const browser = new BrowserHelper({ headless: false });

  // 访问 SPA
  await browser.goto('https://example.com');

  // 等待数据加载完成
  await browser.waitForSelector('.data-loaded');

  // 执行滚动以触发懒加载
  await browser.evaluate(() => {
    window.scrollTo(0, 1000);
  });

  // 等待新数据加载
  await browser.waitForSelector('.more-data');

  // 获取所有数据
  const data = await browser.evaluate(() => {
    return Array.from(document.querySelectorAll('.item')).map(item => ({
      title: item.querySelector('.title').textContent,
      description: item.querySelector('.description').textContent
    }));
  });

  console.log(`获取到 ${data.length} 条数据`);
  console.log(data);

  await browser.close();
}
```

### 3. API 参考

#### BrowserHelper

**构造函数**
```javascript
new BrowserHelper(options)
```

**选项：**
- `headless`: Boolean - 是否无头模式（默认 false，显示浏览器）
- `timeout`: Number - 超时时间（默认 30000ms）

**方法：**

| 方法 | 说明 | 返回 |
|------|------|------|
| `launch()` | 启动浏览器 | Browser |
| `createContext()` | 创建无痕上下文 | BrowserContext |
| `newPage()` | 创建新页面 | Page |
| `goto(url, options)` | 访问 URL | Page |
| `getText()` | 获取页面文本 | String |
| `getHTML()` | 获取页面 HTML | String |
| `getMarkdown()` | 获取页面 Markdown | String |
| `evaluate(script, ...args)` | 执行 JS | Any |
| `waitForSelector(selector)` | 等待元素 | ElementHandle |
| `click(selector)` | 点击元素 | void |
| `fill(selector, text)` | 输入文本 | void |
| `screenshot(path, options)` | 截图 | String |
| `pdf(path, options)` | 导出 PDF | String |
| `close()` | 关闭浏览器 | void |

#### 便捷函数

**fetchPage**
```javascript
fetchPage(url, options)
```

**选项：**
- `format`: 'text'\|'html'\|'markdown' - 输出格式（默认 'text'）
- `close`: Boolean - 是否自动关闭（默认 true）
- `waitUntil`: 'load'\|'domcontentloaded'\|'networkidle' - 等待策略

**webSearch**
```javascript
webSearch(query, options)
```

**选项：**
- `searchEngine`: 'google'\|'bing'\|'baidu' - 搜索引擎（默认 'google'）
- `close`: Boolean - 是否自动关闭（默认 true）

**返回：** Array<{title, url, snippet}>

### 4. 调试技巧

#### 显示浏览器窗口

```javascript
const browser = new BrowserHelper({ headless: false });
// 可以看到浏览器操作过程，方便调试
```

#### 慢动作模式（模拟人类操作）

```javascript
const helper = new BrowserHelper({ headless: false });

// 手动添加延迟
await helper.goto('https://example.com');
await new Promise(resolve => setTimeout(resolve, 2000)); // 等待 2 秒
await helper.click('.button');
```

#### 错误处理

```javascript
try {
  const browser = new BrowserHelper();
  await browser.goto('https://example.com');
  // ... 操作
} catch (error) {
  console.error('发生错误:', error.message);
  // 浏览器会自动关闭
}
```

### 5. 性能优化

#### 复用浏览器实例

```javascript
const helper = new BrowserHelper({ headless: false });

// 多个页面操作复用同一个浏览器
for (const url of urls) {
  await helper.goto(url);
  const content = await helper.getText();
  console.log(content);
}

// 最后关闭
await helper.close();
```

#### 并发操作

```javascript
const helper = new BrowserHelper();
const contexts = await Promise.all([
  helper.createContext(),
  helper.createContext(),
  helper.createContext()
]);

// 三个并发请求
const promises = contexts.map(async (context, index) => {
  const page = await context.newPage();
  await page.goto(urls[index]);
  return await page.content();
});

const results = await Promise.all(promises);
await helper.close();
```

### 6. 常见问题

**Q: 安装浏览器很慢？**
A: 首次安装需要下载 Chromium（约 100-200MB），根据网速需要 3-5 分钟。

**Q: 浏览器闪退？**
A: 可能是系统资源不足，尝试关闭其他应用，或使用 `headless: true`。

**Q: 元素定位失败？**
A: 确保选择器正确，可以使用 `waitForSelector` 等待元素加载。

**Q: 如何获取动态加载的内容？**
A: 使用 `evaluate` 在浏览器上下文中执行 JS，可以获取动态数据。

### 7. 对比其他方案

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| Playwright | 功能全面、API 简洁、支持多浏览器 | 体积较大 | 复杂任务、自动化测试 |
| Puppeteer | 轻量、快速、社区庞大 | 功能较少、只支持 Chromium | 简单任务、快速抓取 |
| web_fetch | 无需安装、快速 | 不支持 JS、SPA | 简单静态页面 |
| browser 工具 | 可视化、可交互 | 需手动连接扩展 | 调试、手动操作 |

---

_强大灵活的浏览器自动化工具 🤖_
