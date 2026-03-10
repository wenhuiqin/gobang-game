const Config = require('../utils/Config.js');
const CanvasHelper = require('../utils/CanvasHelper.js');
const SocketClient = require('../api/SocketClient.js');

/**
 * 等候房间场景
 * 显示房间号，等待好友加入
 */
class WaitingRoomScene {
  constructor(canvas, ctx, config) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.config = config; // { roomCode, userInfo, onGameStart, onBack }
    
    const { windowWidth, windowHeight, safeArea } = wx.getSystemInfoSync();
    this.width = windowWidth;
    this.height = windowHeight;
    this.safeTop = safeArea ? safeArea.top : 40;
    
    this.roomCode = config.roomCode;
    this.userInfo = config.userInfo;
    this.onGameStart = config.onGameStart;
    this.onBack = config.onBack;
    
    // 等待状态
    this.opponentJoined = false;
    this.opponent = null;
    this.countdown = 0;
    
    // 动画点数
    this.dots = 0;
    this.dotsTimer = null;
    
    // 头像缓存
    this.avatarImages = {};
    this.loadingAvatars = {};
    
    console.log('🏠 等候房间场景初始化:', this.roomCode);
    
    this.bindEvents();
    this.setupWebSocket();
    this.startDotsAnimation();
    
    // 启动游戏循环
    this.running = true;
    this.gameLoop();
  }
  
  /**
   * 游戏循环
   */
  gameLoop() {
    if (!this.running) return;
    
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }
  
  /**
   * 设置WebSocket监听
   */
  setupWebSocket() {
    // 确保WebSocket已连接
    if (!SocketClient.connected) {
      const userInfo = wx.getStorageSync('userInfo');
      const userId = userInfo ? userInfo.id : null;
      if (userId) {
        SocketClient.connect(userId, true);
      }
    }
    
    // 清除旧的监听器
    SocketClient.off('playerJoined');
    
    // 监听好友加入
    SocketClient.on('playerJoined', (data) => {
      console.log('🎉 收到playerJoined事件:', data);
      const { opponent, yourColor } = data;
      
      if (opponent) {
        // 调用好友加入处理
        this.onOpponentJoin(opponent);
      }
    });
    
    console.log('✅ WebSocket监听已设置，等待好友加入...');
  }
  
  /**
   * 开始点数动画
   */
  startDotsAnimation() {
    this.dotsTimer = setInterval(() => {
      this.dots = (this.dots + 1) % 4;
    }, 500);
  }
  
  /**
   * 加载头像图片
   */
  loadAvatar(url) {
    if (!url || this.avatarImages[url]) return;
    
    const img = wx.createImage();
    img.onload = () => {
      this.avatarImages[url] = img;
      delete this.loadingAvatars[url];
      // 头像加载完成后重新渲染
      // render会在gameLoop中自动调用
    };
    img.onerror = () => {
      console.error('头像加载失败:', url);
      delete this.loadingAvatars[url];
    };
    img.src = url;
  }
  
  /**
   * 好友加入
   */
  onOpponentJoin(opponent) {
    console.log('✅ 好友加入:', opponent);
    
    this.opponentJoined = true;
    this.opponent = opponent;
    
    // 预加载对手头像
    if (opponent.avatarUrl) {
      this.loadAvatar(opponent.avatarUrl);
    }
    
    // 清除点数动画
    if (this.dotsTimer) {
      clearInterval(this.dotsTimer);
      this.dotsTimer = null;
    }
    
    // 显示提示
    wx.showToast({
      title: `${opponent.nickname}已加入`,
      icon: 'success',
      duration: 2000
    });
    
    // 3秒倒计时后开始游戏
    this.countdown = 3;
    const countdownInterval = setInterval(() => {
      this.countdown--;
      
      if (this.countdown <= 0) {
        clearInterval(countdownInterval);
        if (this.onGameStart) {
          this.onGameStart(this.roomCode, opponent);
        }
      }
    }, 1000);
  }
  
  /**
   * 绑定事件
   */
  bindEvents() {
    this.touchHandler = (e) => {
      const touch = e.touches[0];
      this.handleTouch(touch.clientX, touch.clientY);
    };
    wx.onTouchStart(this.touchHandler);
  }
  
  /**
   * 处理触摸
   */
  handleTouch(x, y) {
    const size = 44;
    
    // 返回按钮（圆形区域）
    const backBtnX = 20 + size / 2;
    const backBtnY = this.safeTop + 20 + size / 2;
    const backDist = Math.sqrt((x - backBtnX) ** 2 + (y - backBtnY) ** 2);
    if (backDist <= size / 2) {
      this.goBack();
      return;
    }
    
    // 分享按钮（圆形区域）
    const shareBtnX = this.width - size - 20 + size / 2;
    const shareBtnY = this.safeTop + 20 + size / 2;
    const shareDist = Math.sqrt((x - shareBtnX) ** 2 + (y - shareBtnY) ** 2);
    if (shareDist <= size / 2) {
      this.shareRoom();
      return;
    }
    
    // 房间号卡片区域（点击复制）
    const cardY = this.height / 2 - 120;
    const cardWidth = this.width - 60;
    const cardX = 30;
    if (x >= cardX && x <= cardX + cardWidth &&
        y >= cardY && y <= cardY + 160) {
      this.copyRoomCode();
      return;
    }
  }
  
  /**
   * 复制房间号
   */
  copyRoomCode() {
    wx.setClipboardData({
      data: this.roomCode,
      success: () => {
        wx.showToast({
          title: '房间号已复制',
          icon: 'success',
          duration: 1500
        });
      }
    });
  }
  
  /**
   * 分享房间
   */
  shareRoom() {
    wx.shareAppMessage({
      title: '这也太解压了吧 - 对战邀请',
      path: `/game?roomCode=${this.roomCode}`,
      imageUrl: '',
    });
    
    wx.showToast({
      title: '请选择好友分享',
      icon: 'none',
      duration: 2000
    });
  }
  
  /**
   * 返回
   */
  goBack() {
    wx.showModal({
      title: '确认退出',
      content: '退出将关闭房间，确定退出吗？',
      success: (res) => {
        if (res.confirm) {
          if (this.onBack) {
            this.onBack();
          }
        }
      }
    });
  }
  
  /**
   * 渲染
   */
  render() {
    const ctx = this.ctx;
    
    // 清空画布
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, this.width, this.height);
    
    // 🎨 天空蓝渐变背景（和登录页一致）
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#E3F2FD');  // 淡天空蓝
    gradient.addColorStop(0.5, '#BBDEFB'); // 天空蓝
    gradient.addColorStop(1, '#90CAF9');   // 亮天空蓝
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    
    // 🎨 装饰云朵
    this.drawCloud(ctx, this.width * 0.2, this.safeTop + 60, 50);
    this.drawCloud(ctx, this.width * 0.8, this.safeTop + 120, 40);
    this.drawCloud(ctx, this.width * 0.5, this.height * 0.7, 45);
    
    // 绘制返回按钮（图标）
    this.drawBackButton();
    
    // 绘制分享按钮（图标）
    this.drawShareButton();
    
    // 标题
    ctx.fillStyle = '#1976D2';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('好友对战', this.width / 2, this.safeTop + 80);
    
    // 房间号卡片
    const cardY = this.height / 2 - 120;
    this.drawRoomCodeCard(cardY);
    
    // 等待状态或对手信息
    if (this.opponentJoined && this.opponent) {
      this.drawOpponentInfo(cardY + 220);
      this.drawCountdown(cardY + 420);
    } else {
      this.drawWaitingStatus(cardY + 220);
    }
  }
  
  /**
   * 🎨 绘制云朵
   */
  drawCloud(ctx, x, y, size) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y, size * 0.8, 0, Math.PI * 2);
    ctx.arc(x + size * 1.2, y, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  
  /**
   * 🎨 绘制返回按钮（简约左箭头图标）
   */
  drawBackButton() {
    const ctx = this.ctx;
    const x = 20;
    const y = this.safeTop + 20;
    const size = 44;
    
    // 圆形背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // 绘制左箭头（简约线条）
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    
    ctx.strokeStyle = '#1976D2';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    // 箭头左边线
    ctx.moveTo(centerX - 2, centerY - 8);
    ctx.lineTo(centerX - 10, centerY);
    ctx.lineTo(centerX - 2, centerY + 8);
    // 箭头横线
    ctx.moveTo(centerX - 10, centerY);
    ctx.lineTo(centerX + 8, centerY);
    ctx.stroke();
  }
  
  /**
   * 🎨 绘制分享按钮（简约分享图标）
   */
  drawShareButton() {
    const ctx = this.ctx;
    const size = 44;
    const x = this.width - size - 20;
    const y = this.safeTop + 20;
    
    // 圆形背景
    ctx.fillStyle = '#1976D2';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // 绘制分享图标（向右上箭头）
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // 箭头
    ctx.beginPath();
    ctx.moveTo(centerX + 8, centerY - 8);
    ctx.lineTo(centerX - 2, centerY - 8);
    ctx.lineTo(centerX - 2, centerY + 2);
    ctx.stroke();
    
    // 箭头尖
    ctx.beginPath();
    ctx.moveTo(centerX + 8, centerY - 8);
    ctx.lineTo(centerX + 8, centerY - 2);
    ctx.moveTo(centerX + 8, centerY - 8);
    ctx.lineTo(centerX + 2, centerY - 8);
    ctx.stroke();
    
    // 下方两个点（表示分享给多人）
    ctx.beginPath();
    ctx.arc(centerX - 6, centerY + 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 2, centerY + 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  /**
   * 🎨 绘制房间号卡片
   */
  drawRoomCodeCard(y) {
    const ctx = this.ctx;
    const cardWidth = this.width - 60;
    const cardX = 30;
    
    // 白色卡片背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 3;
    CanvasHelper.drawRoundRect(ctx, cardX, y, cardWidth, 160, 20);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // 标签
    ctx.fillStyle = '#757575';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('房间号', this.width / 2, y + 25);
    
    // 房间号（深蓝色）
    ctx.fillStyle = '#1976D2';
    ctx.font = 'bold 56px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.roomCode, this.width / 2, y + 85);
    
    // 提示
    ctx.fillStyle = '#9E9E9E';
    ctx.font = '13px sans-serif';
    ctx.fillText('📋 点击复制', this.width / 2, y + 130);
  }
  
  /**
   * 🎨 绘制等待状态
   */
  drawWaitingStatus(y) {
    const ctx = this.ctx;
    const dotStr = '.'.repeat(this.dots);
    
    // 等待动画圆圈（蓝色）
    const circleY = y - 30;
    for (let i = 0; i < 3; i++) {
      const offset = Math.sin(Date.now() / 300 + i * Math.PI / 1.5) * 5;
      ctx.fillStyle = `rgba(25, 118, 210, ${0.3 + Math.abs(offset) / 15})`;
      ctx.beginPath();
      ctx.arc(this.width / 2 - 30 + i * 30, circleY + offset, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 等待文字
    ctx.fillStyle = '#424242';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`等待好友加入${dotStr}`, this.width / 2, y + 10);
    
    // 提示文字
    ctx.fillStyle = '#757575';
    ctx.font = '14px sans-serif';
    ctx.fillText('🎮 分享给好友或告知房间号', this.width / 2, y + 50);
  }
  
  /**
   * 绘制对手信息
   */
  drawOpponentInfo(y) {
    const ctx = this.ctx;
    
    // 对手加入提示
    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('✓ 对手已加入', this.width / 2, y);
    
    // 对手头像（圆形）
    const avatarSize = 70;
    const avatarX = this.width / 2;
    const avatarY = y + 70;
    
    ctx.save();
    // 绘制圆形裁剪区域
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // 绘制头像
    const avatarUrl = this.opponent.avatarUrl || this.opponent.avatar_url;
    if (avatarUrl && this.avatarImages && this.avatarImages[avatarUrl]) {
      // 绘制已加载的头像图片
      const img = this.avatarImages[avatarUrl];
      ctx.drawImage(img, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
    } else {
      // 占位符：渐变圆形
      const gradient = ctx.createRadialGradient(avatarX, avatarY, 0, avatarX, avatarY, avatarSize / 2);
      gradient.addColorStop(0, '#6C63FF');
      gradient.addColorStop(1, '#4A47A3');
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // 绘制用户首字母
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const firstChar = ((this.opponent.nickname || '?')[0]).toUpperCase();
      ctx.fillText(firstChar, avatarX, avatarY);
      
      // 预加载头像图片
      if (avatarUrl && !this.loadingAvatars[avatarUrl]) {
        this.loadingAvatars[avatarUrl] = true;
        this.loadAvatar(avatarUrl);
      }
    }
    ctx.restore();
    
    // 头像边框
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // 对手昵称
    ctx.fillStyle = '#424242';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.opponent.nickname || '对手', this.width / 2, y + 115);
  }
  
  /**
   * 绘制倒计时
   */
  drawCountdown(y) {
    const ctx = this.ctx;
    
    if (this.countdown > 0) {
      ctx.fillStyle = '#FF6F00';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this.countdown, this.width / 2, y);
      
      ctx.fillStyle = '#757575';
      ctx.font = '16px sans-serif';
      ctx.fillText('秒后开始游戏', this.width / 2, y + 50);
    }
  }
  
  /**
   * 销毁
   */
  destroy() {
    this.running = false; // 停止游戏循环
    
    if (this.touchHandler) {
      wx.offTouchStart(this.touchHandler);
      this.touchHandler = null;
    }
    
    if (this.dotsTimer) {
      clearInterval(this.dotsTimer);
      this.dotsTimer = null;
    }
    
    // 清除WebSocket监听
    SocketClient.off('playerJoined');
  }
}

module.exports = WaitingRoomScene;

