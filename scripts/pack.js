#!/usr/bin/env node

/**
 * pack.js - 构建和打包 Co-Editor 项目（ZIP格式 - adm-zip）
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const packageJson = require(path.join(__dirname, '../package.json'));

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const packageName = `co-editor-v${packageJson.version}.zip`;
const packagePath = path.join(distDir, packageName);

// 清理 dist 目录
function cleanDist() {
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    files.forEach(file => {
      const filePath = path.join(distDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        deleteFolderRecursive(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    });
    fs.rmdirSync(distDir);
  }
}

function deleteFolderRecursive(dirPath) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      deleteFolderRecursive(filePath);
    } else {
      fs.unlinkSync(filePath);
    }
  });
  fs.rmdirSync(dirPath);
}

// 递归添加目录文件到 zip
function addDirToZip(zip, dirPath, baseDir = '') {
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    // 跳过隐藏文件
    if (file.startsWith('.')) continue;
    
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      addDirToZip(zip, fullPath, path.join(baseDir, file));
    } else {
      const relativePath = baseDir ? path.join(baseDir, file) : file;
      const normalizedPath = relativePath.replace(/\\/g, '/');
      zip.addLocalFile(fullPath, baseDir);
      console.log(`  添加: ${normalizedPath}`);
    }
  }
}

// 创建 zip 包
async function createZip() {
  console.log('📦 正在创建 ZIP 包...');

  // 创建 dist 目录
  fs.mkdirSync(distDir, { recursive: true });

  // 创建 Zip 对象
  const zip = new AdmZip();

  // 添加根目录文件
  const rootFiles = [
    'server.js',
    'database.js',
    'package.json',
    'yarn.lock',
    'pm2.config.js'
  ];

  for (const file of rootFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      zip.addLocalFile(filePath);
      console.log(`  添加: ${file}`);
    }
  }

  // 添加 public 目录
  const publicDir = path.join(projectRoot, 'public');
  if (fs.existsSync(publicDir)) {
    console.log(`  添加目录: public/`);
    addDirToZip(zip, publicDir, 'public');
  }

  // 写入 zip 文件
  const stats = await new Promise((resolve, reject) => {
    zip.writeZip(packagePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

  const fileStats = fs.statSync(packagePath);
  const size = (fileStats.size / 1024).toFixed(2);

  console.log(`\n🎉 打包完成！`);
  console.log(`   文件: ${packagePath}`);
  console.log(`   大小: ${size} KB\n`);
  console.log('📋 部署说明:');
  console.log(`   1. 传输 ${packageName} 到部署平台`);
  console.log(`   2. 解压: unzip ${packageName}`);
  console.log(`   3. 安装依赖: yarn install`);
  console.log(`   4. 修改端口: 编辑 pm2.config.js，修改 env.PORT 值`);
  console.log(`      或: sed -i "s/PORT: 3000/PORT: 你的端口/g" pm2.config.js`);
  console.log(`   5. 创建日志目录: mkdir -p logs`);
  console.log(`   6. 启动服务: pm2 start pm2.config.js`);
  console.log(`   7. 查看日志: pm2 logs co-editor`);
  console.log(`   8. 重启服务: pm2 restart co-editor`);
  console.log(`   9. 停止服务: pm2 stop co-editor`);
  console.log(`   10. 管理后台: http://your-ip:端口/admin.html\n`);
}

// 主函数
async function main() {
  console.log('🚀 开始构建 Co-Editor (ZIP格式 - adm-zip)\n');

  try {
    // 清理旧的 dist
    console.log('🧹 清理旧的构建文件...');
    cleanDist();

    // 创建 zip 包
    await createZip();

  } catch (error) {
    console.error('❌ 打包失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行
main();
