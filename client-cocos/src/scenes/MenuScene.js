/**
 * 主菜单场景
 */

const Config = require('../utils/Config.js');
const CanvasHelper = require('../utils/CanvasHelper.js');

class MenuScene {
  constructor(canvas, ctx, userInfo, onSelectMode) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.userInfo = userInfo;
    this.onSelectMode = onSelectMode;
    
    const { windowWidth, windowHeight } = wx.getSystemInfoSync();
    this.width = windowWidth;
    this.height = windowHeight;
    
    // 菜单选项
    this.menuItems = [
      { id: 'ai', name: '🤖 人机对战', desc: '与智能AI切磋' },
      { id: 'random', name: '🎲 随机匹配', desc: '寻找在线对手' },
      { id: 'friend', name: '👥 好友对战', desc: '邀请好友一起玩' },
      { id: 'rank', name: '🏆 排行榜', desc: '查看高手榜单' },
    ];
    
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
    const { safeArea } = wx.getSystemInfoSync();
    const safeTop = safeArea ? safeArea.top : 40;
    
    // 检查退出登录按钮
    const logoutBtnX = this.width / 2 + 140 - 35;  // 卡片右上角
    const logoutBtnY = safeTop + 120 + 10;
    const logoutBtnSize = 28;
    
    if (x >= logoutBtnX && x <= logoutBtnX + logoutBtnSize && 
        y >= logoutBtnY && y <= logoutBtnY + logoutBtnSize) {
      this.handleLogout();
      return;
    }
    
    // 检查菜单项
    const startY = safeTop + 220;
    const itemHeight = 90;
    const itemGap = 15;
    
    this.menuItems.forEach((item, index) => {
      const btnY = startY + index * (itemHeight + itemGap);
      const btnX = 30;
      const btnW = this.width - 60;
      const btnH = itemHeight;
      
      if (x >= btnX && x <= btnX + btnW && 
          y >= btnY && y <= btnY + btnH && 
          !item.disabled) {
        this.selectMode(item.id);
      }
    });
  }

  selectMode(mode) {
    if (mode === 'ai') {
      // 先选择颜色
      wx.showActionSheet({
        itemList: ['⚫ 执黑先手（我先下）', '⚪ 执白后手（AI先下）'],
        success: (res) => {
          const playerColor = res.tapIndex === 0 ? 'black' : 'white'; // black or white
          // 再选择难度
          wx.showActionSheet({
            itemList: ['简单', '中等', '困难'],
            success: (diffRes) => {
              const difficulty = diffRes.tapIndex + 1; // 1,2,3
              this.onSelectMode('ai', difficulty, playerColor);
            },
          });
        },
      });
    } else if (mode === 'rank') {
      // 显示排行榜
      this.showRankList();
    } else if (mode === 'random') {
      // 随机匹配
      this.startRandomMatch();
    } else if (mode === 'friend') {
      // 好友对战
      this.showFriendOptions();
    }
  }
  
  showRankList() {
    const SceneManager = require('../utils/SceneManager.js');
    SceneManager.switchScene('rank');
  }
  
  startRandomMatch() {
    const SocketClient = require('../api/SocketClient.js');
    
    // 确保Socket已连接
    if (!SocketClient.connected) {
      wx.showLoading({ title: '连接中...', mask: true });
      
      SocketClient.connect(this.userInfo.id);
      
      // 等待连接成功（只监听一次）
      const onConnected = () => {
        wx.hideLoading();
        SocketClient.off('connected', onConnected);
        this.joinMatchQueue();
      };
      
      SocketClient.on('connected', onConnected);
      
      // 连接失败处理
      setTimeout(() => {
        if (!SocketClient.connected) {
          wx.hideLoading();
          wx.showToast({ title: '连接失败', icon: 'none' });
          SocketClient.off('connected', onConnected);
        }
      }, 5000);
    } else {
      this.joinMatchQueue();
    }
  }
  
  joinMatchQueue() {
    const SocketClient = require('../api/SocketClient.js');
    
    // 清除旧的事件监听器，避免重复注册
    SocketClient.off('matchFound');
    SocketClient.off('matchJoined');
    SocketClient.off('matchError');
    SocketClient.off('matchCancelled');
    
    let matchCancelled = false;
    let matchFound = false;
    let timeoutTimer = null;
    
    // 监听匹配成功
    const onMatchFound = (data) => {
      if (matchCancelled || matchFound) return;
      
      matchFound = true;
      console.log('✅ 匹配成功:', data);
      
      // 清除定时器
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      
      // 先隐藏loading
      wx.hideLoading();
      
      const { roomId, opponent, yourColor } = data;
      
      // 显示匹配成功提示
      wx.showToast({ 
        title: '匹配成功！', 
        icon: 'success',
        duration: 1000
      });
      
      // 延迟进入游戏，让用户看到提示
      setTimeout(() => {
        const SceneManager = require('../utils/SceneManager.js');
        SceneManager.startMultiplayerGame(roomId, yourColor, opponent);
      }, 1000);
    };
    
    // 监听加入队列成功
    const onMatchJoined = (data) => {
      console.log('✅ 已加入匹配队列:', data);
      
      // 显示匹配中状态
      wx.showLoading({ 
        title: '正在匹配...', 
        mask: true 
      });
      
      // 10秒后如果还没匹配到，显示取消按钮
      timeoutTimer = setTimeout(() => {
        if (!matchCancelled && !matchFound && SocketClient.connected) {
          wx.hideLoading();
          wx.showModal({
            title: '正在匹配',
            content: '正在为你寻找对手...\n等待时间较长，是否继续？',
            confirmText: '继续等待',
            cancelText: '取消匹配',
            success: (res) => {
              if (!res.confirm) {
                matchCancelled = true;
                SocketClient.cancelMatch();
                wx.showToast({ title: '已取消匹配', icon: 'none' });
              } else {
                wx.showLoading({ title: '正在匹配...', mask: true });
              }
            }
          });
        }
      }, 10000);
    };
    
    // 监听错误
    const onMatchError = (data) => {
      if (matchCancelled) return;
      
      console.error('❌ 匹配错误:', data);
      wx.hideLoading();
      wx.showToast({ title: data.message, icon: 'none' });
    };
    
    // 监听取消成功
    const onMatchCancelled = (data) => {
      console.log('✅ 取消匹配成功:', data);
      wx.hideLoading();
    };
    
    SocketClient.on('matchFound', onMatchFound);
    SocketClient.on('matchJoined', onMatchJoined);
    SocketClient.on('matchError', onMatchError);
    SocketClient.on('matchCancelled', onMatchCancelled);
    
    // 发起匹配请求
    SocketClient.joinMatch(this.userInfo.rating || 1000);
  }
  
  showFriendOptions() {
    wx.showActionSheet({
      itemList: ['创建房间', '加入房间'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.createRoom();
        } else {
          this.joinRoom();
        }
      },
    });
  }
  
  async createRoom() {
    const HttpClient = require('../api/HttpClient.js');
    wx.showLoading({ title: '创建中...', mask: true });
    
    try {
      const response = await HttpClient.post('/room/create');
      wx.hideLoading();
      
      console.log('🔍 房间创建响应:', JSON.stringify(response));
      console.log('🔍 response.code:', response.code);
      console.log('🔍 response.data:', response.data);
      
      if (response.code === 0 && response.data) {
        const { roomCode } = response.data;
        console.log('🔍 房间号:', roomCode);
        console.log('✅ 准备显示弹窗');
        
        // 保存房间号，用于分享
        this.currentRoomCode = roomCode;
        
        // 先显示成功提示
        wx.showToast({
          title: `房间创建成功`,
          icon: 'success',
          duration: 2000
        });
        
        // 然后显示操作选项
        setTimeout(() => {
          console.log('📢 调用 wx.showActionSheet');
          wx.showActionSheet({
            itemList: [`分享给好友（房间号：${roomCode}）`, `复制房间号：${roomCode}`],
            success: (res) => {
              console.log('📢 用户选择:', res.tapIndex);
              if (res.tapIndex === 0) {
                // 分享给好友
                this.shareRoom(roomCode);
              } else if (res.tapIndex === 1) {
                // 复制房间号
                wx.setClipboardData({
                  data: roomCode,
                  success: () => {
                    wx.showToast({
                      title: '房间号已复制',
                      icon: 'success'
                    });
                  }
                });
              }
            },
            fail: (err) => {
              console.error('❌ ActionSheet失败:', err);
            }
          });
        }, 2000);
      } else {
        console.log('❌ 条件不满足，显示失败提示');
        console.log('response.code:', response.code);
        console.log('response.data:', response.data);
        wx.showToast({
          title: response.message || '创建失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('创建房间错误:', error);
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      });
    }
  }
  
  shareRoom(roomCode) {
    // 设置分享信息
    wx.shareAppMessage({
      title: '五子棋对战邀请',
      imageUrl: '', // 可以设置分享图片
      query: `roomCode=${roomCode}`, // 关键：传递房间号
      success: () => {
        wx.showToast({
          title: '分享成功',
          icon: 'success'
        });
      },
      fail: (err) => {
        console.error('分享失败:', err);
        wx.showToast({
          title: '分享失败',
          icon: 'none'
        });
      }
    });
  }
  
  joinRoom() {
    wx.showModal({
      title: '加入房间',
      content: '请输入房间号',
      editable: true,
      placeholderText: '6位房间号',
      success: async (res) => {
        if (res.confirm && res.content) {
          const roomCode = res.content.trim();
          if (!/^\d{6}$/.test(roomCode)) {
            wx.showToast({
              title: '请输入6位数字房间号',
              icon: 'none'
            });
            return;
          }
          
          const HttpClient = require('../api/HttpClient.js');
          wx.showLoading({ title: '加入中...', mask: true });
          
          try {
            const response = await HttpClient.post('/room/join', { roomCode });
            wx.hideLoading();
            
            if (response.code === 0 && response.data) {
              const { room, yourColor, opponentId } = response.data;
              
              wx.showToast({
                title: '加入成功',
                icon: 'success'
              });
              
              // 进入双人对战场景
              setTimeout(() => {
                const SceneManager = require('../utils/SceneManager.js');
                SceneManager.startMultiplayerGame(roomCode, yourColor, opponentId);
              }, 500);
            } else {
              wx.showToast({
                title: response.message || '加入失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('加入房间错误:', error);
            wx.showToast({
              title: '加入失败',
              icon: 'none'
            });
          }
        }
      },
    });
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
    
    // 装饰云朵
    this.drawCloud(ctx, this.width * 0.15, safeTop + 60, 50);
    this.drawCloud(ctx, this.width * 0.85, safeTop + 100, 40);
    
    // 标题
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    ctx.fillStyle = '#1565C0';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('传统五子棋', this.width / 2, safeTop + 70);
    ctx.restore();
    
    // 用户信息卡片
    const cardX = this.width / 2 - 140;
    const cardY = safeTop + 120;
    const cardW = 280;
    const cardH = 70;
    
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 3;
    
    CanvasHelper.fillRoundRect(ctx, cardX, cardY, cardW, cardH, 15, 'rgba(255, 255, 255, 0.9)');
    ctx.restore();
    
    // 退出登录按钮（右上角）
    this.drawLogoutButton(ctx, cardX + cardW - 35, cardY + 10);
    
    // 用户信息
    ctx.font = 'bold 19px Arial';
    ctx.fillStyle = '#1976D2';
    ctx.textAlign = 'center';
    ctx.fillText(`欢迎, ${this.userInfo.nickname}`, this.width / 2, cardY + 25);
    
    ctx.font = '15px Arial';
    ctx.fillStyle = '#757575';
    const games = this.userInfo.totalGames || 0;
    const wins = this.userInfo.winGames || 0;
    ctx.fillText(`战绩: ${games}局 胜${wins}局`, this.width / 2, cardY + 48);
    
    // 绘制菜单项
    const startY = safeTop + 220;
    const itemHeight = 90;
    const itemGap = 15;
    
    this.menuItems.forEach((item, index) => {
      const y = startY + index * (itemHeight + itemGap);
      this.drawMenuItem(item, 30, y, this.width - 60, itemHeight);
    });
    
    // 版本信息
    ctx.fillStyle = '#90A4AE';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Version 1.0 MVP', this.width / 2, this.height - 25);
  }
  
  drawCloud(ctx, x, y, size) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y, size * 0.6, 0, Math.PI * 2);
    ctx.arc(x + size * 1.2, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  drawMenuItem(item, x, y, width, height) {
    const ctx = this.ctx;
    
    ctx.save();
    
    // 阴影效果
    if (!item.disabled) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
    }
    
    // 背景卡片
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    
    if (item.disabled) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    }
    
    CanvasHelper.fillRoundRect(ctx, x, y, width, height, 18);
    ctx.restore();
    
    // 彩色左边框
    if (!item.disabled) {
      const colors = ['#42A5F5', '#66BB6A', '#FFA726', '#EF5350'];
      const colorIndex = this.menuItems.indexOf(item);
      ctx.fillStyle = colors[colorIndex % colors.length];
      ctx.fillRect(x, y + 15, 5, height - 30);
    }
    
    // 图标背景
    const iconX = x + 42;
    const iconY = y + height / 2;
    if (!item.disabled) {
      ctx.fillStyle = '#E3F2FD';
      ctx.beginPath();
      ctx.arc(iconX, iconY, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 绘制图标
    this.drawMenuIcon(ctx, item.id, iconX, iconY, item.disabled);
    
    // 文字
    ctx.fillStyle = item.disabled ? '#BDBDBD' : '#1565C0';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name.substring(2), x + 72, y + 32);
    
    ctx.font = '14px Arial';
    ctx.fillStyle = item.disabled ? '#BDBDBD' : '#757575';
    ctx.fillText(item.desc, x + 72, y + 58);
    
    // 禁用标签或箭头
    if (item.disabled) {
      const tagX = x + width - 72;
      const tagY = y + height / 2 - 12;
      CanvasHelper.fillRoundRect(ctx, tagX, tagY, 62, 24, 12, '#FFEBEE');
      ctx.fillStyle = '#F44336';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('敬请期待', tagX + 31, tagY + 13);
    } else {
      ctx.strokeStyle = '#90CAF9';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      const arrowX = x + width - 25;
      const arrowY = y + height / 2;
      ctx.beginPath();
      ctx.moveTo(arrowX - 8, arrowY - 8);
      ctx.lineTo(arrowX, arrowY);
      ctx.lineTo(arrowX - 8, arrowY + 8);
      ctx.stroke();
    }
  }

  /**
   * 绘制菜单图标
   */
  drawMenuIcon(ctx, iconId, x, y, disabled) {
    ctx.save();
    ctx.fillStyle = disabled ? '#BDBDBD' : '#1565C0';
    ctx.strokeStyle = disabled ? '#BDBDBD' : '#1565C0';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    switch (iconId) {
      case 'ai':
        // 机器人图标
        // 头部
        ctx.fillRect(x - 6, y - 6, 12, 12);
        // 触角
        ctx.fillRect(x - 2, y - 10, 1, 4);
        ctx.fillRect(x + 1, y - 10, 1, 4);
        // 眼睛
        ctx.fillStyle = disabled ? '#E0E0E0' : '#E3F2FD';
        ctx.fillRect(x - 4, y - 3, 2, 2);
        ctx.fillRect(x + 2, y - 3, 2, 2);
        // 嘴
        ctx.beginPath();
        ctx.moveTo(x - 3, y + 2);
        ctx.lineTo(x + 3, y + 2);
        ctx.stroke();
        break;
        
      case 'random':
        // 骰子图标
        ctx.fillStyle = 'transparent';
        ctx.strokeRect(x - 7, y - 7, 14, 14);
        // 骰子点
        ctx.fillStyle = disabled ? '#BDBDBD' : '#1565C0';
        ctx.beginPath();
        ctx.arc(x - 4, y - 4, 1.5, 0, Math.PI * 2);
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.arc(x + 4, y + 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'friend':
        // 双人图标
        // 左边的人
        ctx.beginPath();
        ctx.arc(x - 4, y - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - 4, y + 2, 4, 0, Math.PI);
        ctx.fill();
        // 右边的人
        ctx.beginPath();
        ctx.arc(x + 4, y - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 4, y + 2, 4, 0, Math.PI);
        ctx.fill();
        break;
        
      case 'rank':
        // 奖杯图标
        // 杯身
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 6);
        ctx.lineTo(x - 3, y + 2);
        ctx.lineTo(x + 3, y + 2);
        ctx.lineTo(x + 5, y - 6);
        ctx.closePath();
        ctx.fill();
        // 杯口
        ctx.fillRect(x - 6, y - 8, 12, 2);
        // 底座
        ctx.fillRect(x - 4, y + 2, 8, 2);
        ctx.fillRect(x - 5, y + 4, 10, 2);
        // 手柄
        ctx.beginPath();
        ctx.arc(x - 6, y - 2, 2, Math.PI / 2, Math.PI * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 6, y - 2, 2, Math.PI * 1.5, Math.PI / 2);
        ctx.stroke();
        break;
    }
    
    ctx.restore();
  }

  /**
   * 绘制退出登录按钮
   */
  drawLogoutButton(ctx, x, y) {
    const size = 28;
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    
    ctx.save();
    
    // 背景圆形（渐变蓝色，与整体画风一致）
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
    gradient.addColorStop(0, '#E3F2FD');
    gradient.addColorStop(1, '#BBDEFB');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // 外圆边框
    ctx.strokeStyle = '#64B5F6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // "×" 符号（简洁的关闭图标）
    ctx.strokeStyle = '#1976D2';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    const crossSize = 8;
    ctx.beginPath();
    ctx.moveTo(centerX - crossSize / 2, centerY - crossSize / 2);
    ctx.lineTo(centerX + crossSize / 2, centerY + crossSize / 2);
    ctx.moveTo(centerX + crossSize / 2, centerY - crossSize / 2);
    ctx.lineTo(centerX - crossSize / 2, centerY + crossSize / 2);
    ctx.stroke();
    
    ctx.restore();
  }

  /**
   * 处理退出登录
   */
  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      confirmColor: '#EF5350',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.logout();
        }
      }
    });
  }

  /**
   * 退出登录
   */
  logout() {
    wx.showLoading({ title: '退出中...' });
    
    try {
      // 1. 清除本地存储
      wx.removeStorageSync('token');
      wx.removeStorageSync('userInfo');
      
      // 2. 清除HttpClient的token
      const HttpClient = require('../api/HttpClient.js');
      HttpClient.setToken('');
      
      // 3. 断开WebSocket连接
      const SocketClient = require('../api/SocketClient.js');
      if (SocketClient.connected) {
        SocketClient.disconnect();
      }
      
      wx.hideLoading();
      wx.showToast({ 
        title: '已退出登录', 
        icon: 'success',
        duration: 1500
      });
      
      // 4. 返回登录页
      setTimeout(() => {
        const SceneManager = require('../utils/SceneManager.js');
        SceneManager.switchScene('login');
      }, 1500);
      
    } catch (error) {
      wx.hideLoading();
      console.error('退出登录失败:', error);
      wx.showToast({ 
        title: '退出失败', 
        icon: 'none' 
      });
    }
  }

  destroy() {
    wx.offTouchStart(this.touchHandler);
  }
}

module.exports = MenuScene;

