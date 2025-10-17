const Config = require('../utils/Config.js');
const CanvasHelper = require('../utils/CanvasHelper.js');

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
    
    console.log('🏠 等候房间场景初始化:', this.roomCode);
    
    this.bindEvents();
    this.startDotsAnimation();
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
   * 好友加入
   */
  onOpponentJoin(opponent) {
    console.log('✅ 好友加入:', opponent);
    
    this.opponentJoined = true;
    this.opponent = opponent;
    
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
    // 房间号区域（点击复制）
    const roomCodeY = this.height / 2 - 80;
    if (y >= roomCodeY && y <= roomCodeY + 100) {
      this.copyRoomCode();
      return;
    }
    
    // 分享按钮（右上角）
    const shareBtn = { x: this.width - 100, y: this.safeTop + 20, width: 80, height: 40 };
    if (x >= shareBtn.x && x <= shareBtn.x + shareBtn.width &&
        y >= shareBtn.y && y <= shareBtn.y + shareBtn.height) {
      this.shareRoom();
      return;
    }
    
    // 返回按钮（左上角）
    const backBtn = { x: 20, y: this.safeTop + 20, width: 80, height: 40 };
    if (x >= backBtn.x && x <= backBtn.x + backBtn.width &&
        y >= backBtn.y && y <= backBtn.y + backBtn.height) {
      this.goBack();
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
      title: '传统五子棋大挑战 - 对战邀请',
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
    ctx.fillStyle = '#F5F5F5';
    ctx.fillRect(0, 0, this.width, this.height);
    
    // 渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#E3F2FD');
    gradient.addColorStop(1, '#BBDEFB');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    
    // 绘制返回按钮
    this.drawBackButton();
    
    // 绘制分享按钮
    this.drawShareButton();
    
    // 标题
    ctx.fillStyle = '#1976D2';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('好友对战房间', this.width / 2, this.safeTop + 80);
    
    // 房间号卡片
    const cardY = this.height / 2 - 100;
    this.drawRoomCodeCard(cardY);
    
    // 等待状态或对手信息
    if (this.opponentJoined && this.opponent) {
      this.drawOpponentInfo(cardY + 200);
      this.drawCountdown(cardY + 350);
    } else {
      this.drawWaitingStatus(cardY + 200);
    }
  }
  
  /**
   * 绘制返回按钮
   */
  drawBackButton() {
    const ctx = this.ctx;
    const x = 20;
    const y = this.safeTop + 20;
    
    // 按钮背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    CanvasHelper.roundRect(ctx, x, y, 80, 40, 20);
    ctx.fill();
    
    // 文字
    ctx.fillStyle = '#1976D2';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('< 返回', x + 40, y + 20);
  }
  
  /**
   * 绘制分享按钮
   */
  drawShareButton() {
    const ctx = this.ctx;
    const x = this.width - 100;
    const y = this.safeTop + 20;
    
    // 按钮背景
    ctx.fillStyle = 'rgba(25, 118, 210, 0.9)';
    CanvasHelper.roundRect(ctx, x, y, 80, 40, 20);
    ctx.fill();
    
    // 文字
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('分享', x + 40, y + 20);
  }
  
  /**
   * 绘制房间号卡片
   */
  drawRoomCodeCard(y) {
    const ctx = this.ctx;
    const cardWidth = this.width - 80;
    const cardX = 40;
    
    // 卡片背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    CanvasHelper.roundRect(ctx, cardX, y, cardWidth, 140, 15);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // 标签
    ctx.fillStyle = '#757575';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('房间号', this.width / 2, y + 20);
    
    // 房间号
    ctx.fillStyle = '#1976D2';
    ctx.font = 'bold 48px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.roomCode, this.width / 2, y + 70);
    
    // 提示
    ctx.fillStyle = '#9E9E9E';
    ctx.font = '12px sans-serif';
    ctx.fillText('点击复制', this.width / 2, y + 110);
  }
  
  /**
   * 绘制等待状态
   */
  drawWaitingStatus(y) {
    const ctx = this.ctx;
    const dotStr = '.'.repeat(this.dots);
    
    ctx.fillStyle = '#757575';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`等待好友加入${dotStr}`, this.width / 2, y);
    
    // 提示文字
    ctx.fillStyle = '#9E9E9E';
    ctx.font = '14px sans-serif';
    ctx.fillText('请分享给好友或告知房间号', this.width / 2, y + 40);
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
    
    // 对手昵称
    ctx.fillStyle = '#424242';
    ctx.font = '18px sans-serif';
    ctx.fillText(this.opponent.nickname || '对手', this.width / 2, y + 40);
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
    if (this.touchHandler) {
      wx.offTouchStart(this.touchHandler);
      this.touchHandler = null;
    }
    
    if (this.dotsTimer) {
      clearInterval(this.dotsTimer);
      this.dotsTimer = null;
    }
  }
}

module.exports = WaitingRoomScene;

