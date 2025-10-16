/**
 * 微信小游戏适配器
 */

// 基础适配
const window = wx;
const document = {};

// Canvas适配
window.HTMLCanvasElement = function() {};
window.HTMLCanvasElement.prototype.getContext = function() {
  return wx.createCanvas().getContext('2d');
};

// 事件适配
window.addEventListener = function() {};
window.removeEventListener = function() {};

// 不再需要roundRect polyfill，使用自定义的CanvasHelper代替

// 导出
module.exports = {
  window,
  document,
};

