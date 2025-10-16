/**
 * 登录场景
 */

const Config = require('../utils/Config.js');
const HttpClient = require('../api/HttpClient.js');
const CanvasHelper = require('../utils/CanvasHelper.js');

class LoginScene {
  constructor(canvas, ctx, onLoginSuccess) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.onLoginSuccess = onLoginSuccess;
    
    const { windowWidth, windowHeight } = wx.getSystemInfoSync();
    this.width = windowWidth;
    this.height = windowHeight;
    
    this.bindEvents();
  }

  bindEvents() {
    this.touchHandler = (e) => {
      const touch = e.touches[0];
      this.handleTouch(touch.clientX, touch.clientY);
    };
    wx.onTouchStart(this.touchHandler);
  }

  handleTouch(x, y) {
    // 检查是否点击了登录按钮（坐标必须与render中的绘制位置一致）
    const btnX = this.width / 2 - 120;
    const btnY = this.height / 2 + 40;  // 与render保持一致
    const btnW = 240;
    const btnH = 56;  // 与render保持一致
    
    // 增加点击容错范围（上下左右各扩展10px）
    const padding = 10;
    const hitX = btnX - padding;
    const hitY = btnY - padding;
    const hitW = btnW + padding * 2;
    const hitH = btnH + padding * 2;
    
    console.log('点击位置:', x, y, '按钮区域:', hitX, hitY, hitX + hitW, hitY + hitH);
    
    if (x >= hitX && x <= hitX + hitW && y >= hitY && y <= hitY + hitH) {
      console.log('✅ 点击按钮成功！');
      this.login();
    } else {
      console.log('❌ 点击位置不在按钮区域');
    }
  }

  async login() {
    // 显示登录方式选择（开发测试期间）
    wx.showActionSheet({
      itemList: ['游客登录（推荐测试）', '微信登录'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.guestLogin();
        } else if (res.tapIndex === 1) {
          this.wechatLogin();
        }
      },
      fail: () => {
        // 默认使用游客登录
        this.guestLogin();
      }
    });
  }

  /**
   * 游客登录
   */
  async guestLogin() {
    wx.showLoading({ title: '登录中...' });
    
    try {
      const response = await HttpClient.post('/auth/guest-login', {
        nickname: `游客${Math.random().toString(36).substr(2, 5)}`
      });
      
      wx.hideLoading();
      
      if (response.code === 0 && response.data) {
        const { token, user } = response.data;
        
        wx.showToast({ title: '游客登录成功', icon: 'success' });
        
        // 保存登录信息
        wx.setStorageSync('token', token);
        wx.setStorageSync('userInfo', user);
        
        // 设置HttpClient的token（关键！）
        HttpClient.setToken(token);
        
        setTimeout(() => {
          this.onLoginSuccess(user);
        }, 500);
      } else {
        throw new Error(response.message || '游客登录失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('游客登录失败:', error);
      wx.showToast({ 
        title: '登录失败，请检查网络', 
        icon: 'none',
        duration: 2000
      });
    }
  }

  /**
   * 微信登录
   */
  async wechatLogin() {
    wx.showLoading({ title: '登录中...' });
    
    try {
      // 微信登录
      const res = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject,
        });
      });

      // 获取用户信息
      const userInfo = await new Promise((resolve, reject) => {
        wx.getUserInfo({
          success: (res) => resolve(res.userInfo),
          fail: () => resolve({ nickName: '游客', avatarUrl: '' }),
        });
      });

      // 调用后端登录接口
      const response = await HttpClient.post('/auth/login', {
        code: res.code,
        userInfo: userInfo,
      });

      if (response.code === 0 && response.data) {
        const { token, user } = response.data;
        
        wx.hideLoading();
        wx.showToast({ title: '登录成功', icon: 'success' });

        // 保存登录信息
        wx.setStorageSync('token', token);
        wx.setStorageSync('userInfo', user);
        
        // 设置HttpClient的token（关键！）
        HttpClient.setToken(token);

        // 回调通知登录成功
        setTimeout(() => {
          this.onLoginSuccess(user);
        }, 500);
      } else {
        throw new Error(response.message || '登录失败');
      }

    } catch (error) {
      wx.hideLoading();
      console.error('微信登录失败:', error);
      wx.showToast({ 
        title: '微信登录失败，请尝试游客登录', 
        icon: 'none',
        duration: 2000
      });
    }
  }

  render() {
    const ctx = this.ctx;
    const { safeArea } = wx.getSystemInfoSync();
    const safeTop = safeArea ? safeArea.top : 40;
    
    // 清空画布
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, this.width, this.height);
    
    // 天空蓝渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#E3F2FD');  // 淡天空蓝
    gradient.addColorStop(0.5, '#BBDEFB'); // 天空蓝
    gradient.addColorStop(1, '#90CAF9');   // 亮天空蓝
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    
    // 装饰云朵
    this.drawCloud(ctx, this.width * 0.2, safeTop + 80, 60);
    this.drawCloud(ctx, this.width * 0.8, safeTop + 150, 45);
    this.drawCloud(ctx, this.width * 0.5, this.height * 0.65, 50);
    
    // 游戏Logo - 深色文字更清晰
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    ctx.fillStyle = '#1565C0'; // 深蓝色
    ctx.font = 'bold 52px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('传统五子棋', this.width / 2, safeTop + 120);
    ctx.restore();
    
    // 副标题
    ctx.font = '20px Arial';
    ctx.fillStyle = '#1976D2';
    ctx.textAlign = 'center';
    ctx.fillText('简单易学  趣味无穷', this.width / 2, safeTop + 180);
    
    // 欢迎文字
    ctx.font = '18px Arial';
    ctx.fillStyle = '#424242';
    ctx.fillText('欢迎, 游客', this.width / 2, this.height / 2 - 40);
    
    // 登录按钮
    const btnX = this.width / 2 - 120;
    const btnY = this.height / 2 + 40;
    const btnW = 240;
    const btnH = 56;
    
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    
    // 按钮渐变
    const btnGradient = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGradient.addColorStop(0, '#42A5F5');
    btnGradient.addColorStop(1, '#1E88E5');
    
    CanvasHelper.fillRoundRect(ctx, btnX, btnY, btnW, btnH, 28, btnGradient);
    
    // 按钮高光边框
    CanvasHelper.strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 28, 'rgba(255, 255, 255, 0.3)', 2);
    
    // 按钮文字
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('开始游戏', this.width / 2, btnY + btnH / 2);
    
    ctx.restore();
    
    // 版本信息
    ctx.font = '13px Arial';
    ctx.fillStyle = '#90A4AE';
    ctx.fillText('Version 1.0 MVP', this.width / 2, this.height - 25);
  }
  
  drawCloud(ctx, x, y, size) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    
    // 云朵由几个圆组成
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y, size * 0.6, 0, Math.PI * 2);
    ctx.arc(x + size * 1.2, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  destroy() {
    wx.offTouchStart(this.touchHandler);
  }
}

module.exports = LoginScene;

