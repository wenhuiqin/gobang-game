/**
 * 这也太解压了吧
 * 主入口文件
 */

// 引入适配器
require('./libs/weapp-adapter.js');

// 引入场景管理器
const SceneManager = require('./src/utils/SceneManager.js');

// 创建Canvas
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

// 设置Canvas高清显示
// 方案：Canvas用物理分辨率，绘制时用逻辑坐标
const systemInfo = wx.getSystemInfoSync();
const dpr = systemInfo.pixelRatio || 2;
canvas.width = systemInfo.windowWidth * dpr;
canvas.height = systemInfo.windowHeight * dpr;
// 重要：一次性缩放Canvas上下文，后续所有绘制使用逻辑坐标
ctx.scale(dpr, dpr);

console.log(`📱 设备: ${systemInfo.model}`);
console.log(`📐 逻辑分辨率: ${systemInfo.windowWidth} x ${systemInfo.windowHeight}`);
console.log(`🖼️  Canvas物理分辨率: ${canvas.width} x ${canvas.height}`);
console.log(`📊 DPR: ${dpr}`);

// 获取启动参数（检查是否通过分享进入）
const launchOptions = wx.getLaunchOptionsSync();
console.log('启动参数:', launchOptions);

// 创建场景管理器并启动
const sceneManager = new SceneManager(canvas, ctx);

// 如果有房间号参数，保存下来
if (launchOptions.query && launchOptions.query.roomCode) {
  const roomCode = launchOptions.query.roomCode;
  console.log('通过分享进入，房间号:', roomCode);
  wx.setStorageSync('pendingRoomCode', roomCode);
}

sceneManager.start();

console.log('游戏启动成功');

// 监听从后台切回前台（再次通过分享进入）
wx.onShow((options) => {
  console.log('从后台切回前台:', options);
  if (options.query && options.query.roomCode) {
    const roomCode = options.query.roomCode;
    console.log('通过分享进入，房间号:', roomCode);
    wx.setStorageSync('pendingRoomCode', roomCode);
    
    // 如果已登录，直接显示加入提示
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      wx.showModal({
        title: '好友邀请',
        content: `是否加入房间 ${roomCode}？`,
        confirmText: '加入',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            sceneManager.joinRoomDirectly(roomCode);
          }
        }
      });
    }
  }
});

