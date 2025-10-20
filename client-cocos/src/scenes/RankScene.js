/**
 * 排行榜场景
 */

const Config = require('../utils/Config.js');
const CanvasHelper = require('../utils/CanvasHelper.js');
const HttpClient = require('../api/HttpClient.js');

class RankScene {
  constructor(canvas, ctx, userInfo) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.userInfo = userInfo;
    
    const { windowWidth, windowHeight } = wx.getSystemInfoSync();
    this.width = windowWidth;
    this.height = windowHeight;
    
    // 排行榜数据
    this.rankList = [];
    this.loading = true;
    
    // 头像缓存
    this.avatarImages = {}; // 已加载的头像图片
    this.loadingAvatars = {}; // 正在加载的头像URL
    
    // Tab选项: online, ai-easy, ai-medium, ai-hard
    this.tabs = [
      { type: 'online', name: '在线对战' },
      { type: 'ai-easy', name: '人机简单' },
      { type: 'ai-medium', name: '人机中等' },
      { type: 'ai-hard', name: '人机困难' },
    ];
    this.currentTab = 'online';
    
    // 返回按钮
    this.backButton = null;
    
    // Tab按钮区域
    this.tabButtons = [];
    
    this.bindEvents();
    this.loadRankData();
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
      this.render();
    };
    img.onerror = () => {
      console.error('头像加载失败:', url);
      delete this.loadingAvatars[url];
    };
    img.src = url;
  }

  bindEvents() {
    this.touchHandler = (e) => {
      const touch = e.touches[0];
      this.handleTouch(touch.clientX, touch.clientY);
    };
    wx.onTouchStart(this.touchHandler);
  }

  handleTouch(x, y) {
    // 检测返回按钮
    if (this.backButton) {
      const btn = this.backButton;
      if (x >= btn.x && x <= btn.x + btn.width && 
          y >= btn.y && y <= btn.y + btn.height) {
        const SceneManager = require('../utils/SceneManager.js');
        SceneManager.switchScene('menu');
        return;
      }
    }
    
    // 检测Tab点击
    for (const tab of this.tabButtons) {
      if (x >= tab.x && x <= tab.x + tab.width &&
          y >= tab.y && y <= tab.y + tab.height) {
        if (this.currentTab !== tab.type) {
          this.currentTab = tab.type;
          this.loadRankData();
        }
        return;
      }
    }
  }

  async loadRankData() {
    this.loading = true;
    try {
      const response = await HttpClient.get(`/user/leaderboard?type=${this.currentTab}`);
      if (response.code === 0 && response.data) {
        this.rankList = response.data.slice(0, 50); // 只显示前50名
        console.log(`${this.currentTab}排行榜数据:`, this.rankList);
      }
    } catch (error) {
      console.error('加载排行榜失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none',
      });
    } finally {
      this.loading = false;
    }
  }

  destroy() {
    wx.offTouchStart(this.touchHandler);
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
    gradient.addColorStop(0, '#E3F2FD');
    gradient.addColorStop(0.5, '#BBDEFB');
    gradient.addColorStop(1, '#90CAF9');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    
    // 绘制返回按钮
    this.drawBackButton(safeTop);
    
    // 绘制标题
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#1565C0';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 排行榜', this.width / 2, safeTop + 60);
    ctx.restore();
    
    // 绘制Tab按钮
    this.drawTabs(safeTop);
    
    // 绘制排行榜内容
    if (this.loading) {
      this.drawLoading(safeTop);
    } else {
      this.drawRankList(safeTop);
    }
  }

  drawBackButton(safeTop) {
    const ctx = this.ctx;
    
    const arrowSize = 40;
    const arrowX = 20;
    const arrowY = safeTop + 15;
    
    this.backButton = {
      x: arrowX - 5,
      y: arrowY - 5,
      width: arrowSize + 10,
      height: arrowSize + 10,
    };
    
    ctx.save();
    ctx.strokeStyle = '#2c3e50';
    ctx.fillStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const centerX = arrowX + arrowSize / 2;
    const centerY = arrowY + arrowSize / 2;
    
    ctx.beginPath();
    ctx.moveTo(centerX + 12, centerY);
    ctx.lineTo(centerX - 8, centerY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(centerX - 8, centerY);
    ctx.lineTo(centerX - 2, centerY - 6);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(centerX - 8, centerY);
    ctx.lineTo(centerX - 2, centerY + 6);
    ctx.stroke();
    
    ctx.restore();
  }

  drawTabs(safeTop) {
    const ctx = this.ctx;
    const tabY = safeTop + 90;
    const tabHeight = 36;
    const tabWidth = (this.width - 40) / 4; // 4个tab平分宽度
    const padding = 8;
    
    this.tabButtons = [];
    
    this.tabs.forEach((tab, index) => {
      const tabX = 20 + index * tabWidth;
      
      // 保存tab区域用于点击检测
      this.tabButtons.push({
        x: tabX,
        y: tabY,
        width: tabWidth - padding,
        height: tabHeight,
        type: tab.type
      });
      
      // 绘制tab背景
      ctx.save();
      const isActive = this.currentTab === tab.type;
      
      if (isActive) {
        ctx.fillStyle = '#1976D2';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 2;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      }
      
      CanvasHelper.fillRoundRect(ctx, tabX, tabY, tabWidth - padding, tabHeight, 8, ctx.fillStyle);
      ctx.restore();
      
      // 绘制tab文字
      ctx.save();
      ctx.fillStyle = isActive ? '#FFFFFF' : '#757575';
      ctx.font = isActive ? 'bold 13px Arial' : '13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab.name, tabX + (tabWidth - padding) / 2, tabY + tabHeight / 2);
      ctx.restore();
    });
  }

  drawLoading(safeTop) {
    const ctx = this.ctx;
    ctx.fillStyle = '#666666';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('加载中...', this.width / 2, safeTop + 250);
  }

  drawRankList(safeTop) {
    const ctx = this.ctx;
    const startY = safeTop + 145; // 增加起始位置，为tab留出空间
    const itemHeight = 60;
    const padding = 20;
    
    if (this.rankList.length === 0) {
      ctx.fillStyle = '#666666';
      ctx.font = '18px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('暂无排行数据', this.width / 2, startY + 100);
      return;
    }
    
    // 绘制每一条排名
    this.rankList.forEach((item, index) => {
      if (index >= 10) return; // 只显示前10名
      
      const y = startY + index * (itemHeight + 8);
      this.drawRankItem(item, index + 1, padding, y, this.width - padding * 2, itemHeight);
    });
  }

  drawRankItem(item, rank, x, y, width, height) {
    const ctx = this.ctx;
    
    // 背景卡片
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    
    // 当前用户高亮
    if (item.id === this.userInfo.id) {
      ctx.fillStyle = 'rgba(255, 235, 59, 0.3)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    }
    
    CanvasHelper.fillRoundRect(ctx, x, y, width, height, 12);
    ctx.restore();
    
    // 排名徽章
    const medalX = x + 30;
    const medalY = y + height / 2;
    const medalSize = 28;
    
    ctx.save();
    if (rank === 1) {
      ctx.fillStyle = '#FFD700'; // 金色
    } else if (rank === 2) {
      ctx.fillStyle = '#C0C0C0'; // 银色
    } else if (rank === 3) {
      ctx.fillStyle = '#CD7F32'; // 铜色
    } else {
      ctx.fillStyle = '#BDBDBD'; // 灰色
    }
    ctx.beginPath();
    ctx.arc(medalX, medalY, medalSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rank.toString(), medalX, medalY);
    ctx.restore();
    
    // 头像（圆形）
    const avatarX = x + 75;
    const avatarY = y + height / 2;
    const avatarSize = 40;
    
    ctx.save();
    // 绘制圆形裁剪区域
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // 绘制头像（如果有图片的话，这里先用占位符）
    const avatarUrl = item.avatarUrl || item.avatar_url;
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
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const firstChar = (item.nickname || '?')[0].toUpperCase();
      ctx.fillText(firstChar, avatarX, avatarY);
      
      // 预加载头像图片
      if (avatarUrl && !this.loadingAvatars) {
        this.loadingAvatars = {};
      }
      if (avatarUrl && !this.loadingAvatars[avatarUrl]) {
        this.loadingAvatars[avatarUrl] = true;
        this.loadAvatar(avatarUrl);
      }
    }
    ctx.restore();
    
    // 头像边框
    ctx.strokeStyle = rank <= 3 ? '#FFD700' : '#E0E0E0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // 昵称
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const nickname = item.nickname || '匿名';
    const maxNicknameWidth = width - 200;
    let displayName = nickname;
    if (ctx.measureText(nickname).width > maxNicknameWidth) {
      while (ctx.measureText(displayName + '...').width > maxNicknameWidth && displayName.length > 0) {
        displayName = displayName.slice(0, -1);
      }
      displayName += '...';
    }
    ctx.fillText(displayName, x + 105, y + height / 2 - 10);
    
    // 战绩
    ctx.fillStyle = '#757575';
    ctx.font = '14px Arial';
    const winRate = item.totalGames > 0 
      ? ((item.winGames / item.totalGames) * 100).toFixed(1) 
      : '0.0';
    ctx.fillText(`${item.winGames}胜 ${item.totalGames - item.winGames}负 胜率${winRate}%`, 
      x + 105, y + height / 2 + 12);
    
    // 最高连胜
    if (item.maxWinStreak && item.maxWinStreak > 0) {
      ctx.fillStyle = '#FF6F00';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🔥${item.maxWinStreak}连胜`, x + width - 20, y + height / 2);
    }
  }
}

module.exports = RankScene;

