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
  ignores: ['node_modules/**/*'],
});

ci.upload({
  project,
  version: version,
  desc: desc,
  setting: {
    es6: true,
    es7: true,
    minify: true,
    minifyJS: true,
    minifyWXML: true,
    minifyWXSS: true,
    autoPrefixWXSS: true,
  },
  onProgressUpdate: (task) => {
    console.log(`📤 上传进度: ${task._msg}`);
  },
})
  .then((result) => {
    console.log('✅ 上传成功！');
    console.log('📦 上传结果:', JSON.stringify(result, null, 2));
    console.log('');
    console.log('🎉 代码已上传到微信后台，可以登录后台提交审核了！');
    console.log('🔗 微信公众平台: https://mp.weixin.qq.com');
  })
  .catch((error) => {
    console.error('❌ 上传失败:', error);
    process.exit(1);
  });

