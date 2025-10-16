/**
 * 微信小游戏自动上传脚本
 * 使用 miniprogram-ci 上传代码到微信后台
 */

const ci = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

// 读取项目配置
const projectConfig = require('../project.config.json');

// 从环境变量读取配置
const appid = projectConfig.appid;
const version = process.env.VERSION || '1.0.0';
const desc = process.env.DESC || '自动构建上传';
const privateKeyPath = process.env.PRIVATE_KEY_PATH || path.join(__dirname, '../private.key');

console.log('🚀 开始上传微信小游戏...');
console.log('📦 AppID:', appid);
console.log('📦 版本:', version);
console.log('📝 描述:', desc);

// 检查私钥文件是否存在
if (!fs.existsSync(privateKeyPath)) {
  console.error('❌ 错误: 找不到上传密钥文件:', privateKeyPath);
  console.error('📖 请先在微信公众平台下载上传密钥：');
  console.error('   1. 登录 https://mp.weixin.qq.com');
  console.error('   2. 进入「开发管理」->「开发设置」');
  console.error('   3. 在「小程序代码上传」中生成并下载密钥');
  console.error('   4. 将密钥保存为 client-cocos/private.key');
  process.exit(1);
}

const project = new ci.Project({
  appid: appid,
  type: 'minigame', // 小游戏类型
  projectPath: path.resolve(__dirname, '..'),
  privateKeyPath: privateKeyPath,
  ignores: [
    'node_modules/**/*',
    'scripts/**/*',
    'package.json',
    'package-lock.json',
    '.git/**/*',
    '.gitignore',
    '*.log',
    'logs/**/*',
    '*.md',
    '.DS_Store',
  ],
});

// 创建上传超时控制
const uploadTimeout = 15 * 60 * 1000; // 15分钟超时

console.log('📝 开始编译和上传...');

// 记录最后一次进度更新时间，用于检测卡死
let lastProgressTime = Date.now();
let progressCheckInterval = setInterval(() => {
  const timeSinceLastProgress = Date.now() - lastProgressTime;
  if (timeSinceLastProgress > 60000) { // 60秒没有进度更新
    console.log(`⏳ 已等待 ${Math.floor(timeSinceLastProgress / 1000)} 秒，仍在处理中...`);
  }
}, 10000); // 每10秒检查一次

const uploadPromise = ci.upload({
  project,
  version: version,
  desc: desc,
  setting: {
    es6: false, // 关闭ES6转ES5，加快编译速度
    es7: false, // 关闭ES7转ES5
    minify: false, // 关闭代码压缩，加快编译速度（可在微信后台配置）
    minifyJS: false,
    minifyWXML: false,
    minifyWXSS: false,
    autoPrefixWXSS: false,
  },
  onProgressUpdate: (task) => {
    lastProgressTime = Date.now(); // 更新最后进度时间
    
    // 改进进度显示
    if (task) {
      const taskStr = JSON.stringify(task);
      console.log(`📤 上传进度:`, taskStr.length > 150 ? taskStr.substring(0, 150) + '...' : taskStr);
      
      // 特别标记关键阶段
      if (task.message && task.message.includes('upload')) {
        console.log('🚀 正在上传文件到微信服务器...');
      }
      if (task.status === 'done' && task.message && task.message.includes('success')) {
        console.log('✨ 编译完成，准备上传...');
      }
    }
  },
});

const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => {
    reject(new Error('上传超时（15分钟）'));
  }, uploadTimeout);
});

Promise.race([uploadPromise, timeoutPromise])
  .then((result) => {
    clearInterval(progressCheckInterval); // 清除进度检查
    console.log('✅ 上传成功！');
    console.log('📦 上传结果:', JSON.stringify(result, null, 2));
    console.log('');
    console.log('🎉 代码已上传到微信后台，可以登录后台提交审核了！');
    console.log('🔗 微信公众平台: https://mp.weixin.qq.com');
    process.exit(0);
  })
  .catch((error) => {
    clearInterval(progressCheckInterval); // 清除进度检查
    console.error('❌ 上传失败:', error.message || error);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
    process.exit(1);
  });

