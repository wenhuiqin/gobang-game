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
      { id: 'ai', name: '🤖 人机对战', desc: '与电脑切磋' },
      { id: 'random', name: '🎲 随机匹配', desc: '寻找在线对手' },
      { id: 'friend', name: '👥 好友对战', desc: '邀请好友一起玩' },
      { id: 'rank', name: '🏆 排行榜', desc: '查看高手榜单' },
    ];
    
    // 头像缓存
    this.avatarImages = {};
    this.loadingAvatars = {};
    
    // 预加载用户头像
    if (userInfo && userInfo.avatarUrl) {
      this.loadAvatar(userInfo.avatarUrl);
    }
    
    this.bindEvents();
  }

  /**
   * 加载头像图片
   */
  loadAvatar(url) {
    if (!url || this.avatarImages[url]) return;
    
    if (this.loadingAvatars[url]) return; // 正在加载
    
    this.loadingAvatars[url] = true;
    const img = wx.createImage();
    img.onload = () => {
      this.avatarImages[url] = img;
      delete this.loadingAvatars[url];
      // 头像加载完成后自动触发重新渲染
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
    
    // 检查更新昵称按钮（昵称旁边的刷新图标）
    const refreshBtnX = this.width / 2 + 60;
    const refreshBtnY = safeTop + 120 + 15;
    const refreshBtnSize = 20;
    
    if (x >= refreshBtnX && x <= refreshBtnX + refreshBtnSize && 
        y >= refreshBtnY && y <= refreshBtnY + refreshBtnSize) {
      this.handleUpdateProfile();
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
        itemList: ['⚫ 执黑先手（我先下）', '⚪ 执白后手（电脑先下）'],
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
    
    console.log('🎮 开始随机匹配');
    console.log('👤 用户ID:', this.userInfo.id);
    console.log('🔌 Socket连接状态:', SocketClient.connected);
    
    // 确保Socket已连接
    if (!SocketClient.connected) {
      console.log('🔌 Socket未连接，开始连接...');
      wx.showLoading({ title: '连接中...', mask: true });
      
      SocketClient.connect(this.userInfo.id, true); // 启用自动重连
      
      // 等待连接成功（只监听一次）
      const onConnected = () => {
        console.log('✅ Socket连接成功，加入匹配队列');
        wx.hideLoading();
        SocketClient.off('connected', onConnected);
        this.joinMatchQueue();
      };
      
      SocketClient.on('connected', onConnected);
      
      // 连接失败处理
      setTimeout(() => {
        if (!SocketClient.connected) {
          console.error('❌ Socket连接超时');
          wx.hideLoading();
          wx.showToast({ title: '连接失败，请重试', icon: 'none' });
          SocketClient.off('connected', onConnected);
        }
      }, 5000);
    } else {
      console.log('✅ Socket已连接，直接加入匹配队列');
      this.joinMatchQueue();
    }
  }
  
  joinMatchQueue() {
    const SocketClient = require('../api/SocketClient.js');
    
    console.log('🎯 加入匹配队列');
    console.log('🔌 当前Socket连接状态:', SocketClient.connected);
    console.log('👤 当前用户ID:', this.userInfo.id);
    
    // 清除旧的事件监听器，避免重复注册
    SocketClient.off('matchFound');
    SocketClient.off('matchJoined');
    SocketClient.off('matchError');
    SocketClient.off('matchCancelled');
    
    // 使用对象包装状态，以便在回调中修改
    const matchState = {
      cancelled: false,
      found: false
    };
    
    // 监听匹配成功
    const onMatchFound = (data) => {
      console.log('📩 收到matchFound事件:', data);
      console.log('📊 当前matchState:', matchState);
      
      if (matchState.cancelled) {
        console.log('⚠️ 匹配已取消，忽略');
        return;
      }
      
      if (matchState.found) {
        console.log('⚠️ 已经处理过匹配成功，忽略重复消息');
        return;
      }
      
      matchState.found = true;
      console.log('✅ 匹配成功，准备进入游戏');
      console.log('👤 对手信息:', data.opponent);
      console.log('🎨 我的颜色:', data.yourColor);
      console.log('🏠 房间ID:', data.roomId);
      
      const { roomId, opponent, yourColor } = data;
      
      // 移除所有事件监听，防止重复触发
      SocketClient.off('matchFound', onMatchFound);
      SocketClient.off('matchJoined', onMatchJoined);
      SocketClient.off('matchError', onMatchError);
      SocketClient.off('matchCancelled', onMatchCancelled);
      
      // 清除匹配上下文
      SocketClient.clearContext();
      
      // 清除定时器
      if (matchState.showCancelTimer) {
        clearTimeout(matchState.showCancelTimer);
        matchState.showCancelTimer = null;
      }
      
      // 立即关闭所有弹窗
      console.log('🚫 关闭所有弹窗');
      wx.hideLoading();
      wx.hideToast();
      
      // 显示匹配成功信息
      const opponentName = opponent && opponent.nickname ? opponent.nickname : '未知玩家';
      const colorText = yourColor === 1 ? '⚫ 黑方（先手）' : '⚪ 白方（后手）';
      
      console.log(`🎮 准备进入对战房间 ${roomId}，你是${colorText}，对手：${opponentName}`);
      
      // 用Modal覆盖可能存在的"正在匹配"Modal，然后自动进入游戏
      wx.showModal({
        title: '匹配成功！',
        content: `对手：${opponentName}\n你是${colorText}`,
        showCancel: false,
        confirmText: '进入游戏',
        success: () => {
          if (!matchState.gameStarted) {
            console.log(`🎮 进入游戏（用户点击）`);
            matchState.gameStarted = true;
            const SceneManager = require('../utils/SceneManager.js');
            SceneManager.startMultiplayerGame(roomId, yourColor, opponent);
          }
        }
      });
      
      // 同时设置2秒后自动进入游戏（防止用户不点击）
      setTimeout(() => {
        if (!matchState.gameStarted) {
          console.log(`🎮 自动进入游戏`);
          matchState.gameStarted = true;
          const SceneManager = require('../utils/SceneManager.js');
          SceneManager.startMultiplayerGame(roomId, yourColor, opponent);
        }
      }, 2000);
    };
    
    // 监听加入队列成功
    const onMatchJoined = (data) => {
      console.log('✅ 已加入匹配队列:', data);
      console.log('📊 当前matchState:', matchState);
      
      // 检查是否在显示对话框前就已经匹配成功了
      if (matchState.found) {
        console.log('⚡ 快速匹配成功，不显示等待对话框');
        return;
      }
      
      // 立即显示可取消的匹配对话框
      this.showMatchModal(SocketClient, matchState);
    };
    
    // 监听错误
    const onMatchError = (data) => {
      if (matchState.cancelled) return;
      
      console.error('❌ 匹配错误:', data);
      
      wx.showToast({ title: data.message, icon: 'none' });
    };
    
    // 监听取消成功
    const onMatchCancelled = (data) => {
      console.log('✅ 取消匹配成功:', data);
    };
    
    console.log('📝 注册事件监听器: matchFound, matchJoined, matchError, matchCancelled');
    SocketClient.on('matchFound', onMatchFound);
    SocketClient.on('matchJoined', onMatchJoined);
    SocketClient.on('matchError', onMatchError);
    SocketClient.on('matchCancelled', onMatchCancelled);
    
    // 保存匹配上下文（用于断线重连）
    const rating = this.userInfo.rating || 1000;
    SocketClient.saveContext('matching', { rating });
    
    // 发起匹配请求
    console.log(`📤 发送joinMatch请求: userId=${this.userInfo.id}, rating=${rating}`);
    SocketClient.joinMatch(rating);
  }
  
  // 显示匹配对话框（持续显示Loading + 取消按钮）
  showMatchModal(SocketClient, matchState) {
    console.log('💬 显示匹配Loading');
    console.log('📊 matchState:', matchState);
    
    // 检查是否已经匹配成功或取消
    if (matchState.cancelled || matchState.found) {
      console.log('⚠️ 匹配状态已变更，不显示Loading');
      return;
    }
    
    // 显示Loading（无法取消的持续状态）
    wx.showLoading({
      title: '正在匹配...',
      mask: true
    });
    
    // 3秒后显示取消按钮（给用户一个取消的机会，但不会频繁打扰）
    matchState.showCancelTimer = setTimeout(() => {
      if (!matchState.found && !matchState.cancelled) {
        // 关闭Loading，显示带取消按钮的Modal
        wx.hideLoading();
        this.showCancelButton(SocketClient, matchState);
      }
    }, 3000);
  }
  
  // 显示带取消按钮的Modal（简洁设计，只有一个取消按钮）
  showCancelButton(SocketClient, matchState) {
    if (matchState.cancelled || matchState.found) {
      console.log('⚠️ 状态已变更，不显示Modal');
      return;
    }
    
    wx.showModal({
      title: '正在匹配',
      content: '正在为你寻找对手...',
      showCancel: false, // 不显示左侧取消按钮
      confirmText: '取消匹配', // 只有一个居中的按钮
      success: (res) => {
        // 检查是否在用户操作期间匹配成功
        if (matchState.found) {
          console.log('✅ 匹配已成功，忽略取消操作');
          return;
        }
        
        if (res.confirm) {
          console.log('❌ 用户取消匹配');
          matchState.cancelled = true;
          
          if (matchState.showCancelTimer) {
            clearTimeout(matchState.showCancelTimer);
          }
          
          // 清除匹配上下文
          SocketClient.clearContext();
          
          SocketClient.cancelMatch();
          wx.showToast({ title: '已取消匹配', icon: 'none' });
        }
      }
    });
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
        const { roomCode, room } = response.data;
        console.log('🔍 房间号:', roomCode);
        console.log('🔍 房间信息:', room);
        
        // 保存房间号
        this.currentRoomCode = roomCode;
        
        console.log('🏠 房间创建成功，进入等候房间页面');
        
        // 🎯 正确的交互：进入等候房间场景
        const SceneManager = require('../utils/SceneManager.js');
        SceneManager.enterWaitingRoom(roomCode, this.userInfo);
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
    // 微信分享（需要用户主动触发）
    wx.shareAppMessage({
      title: '这也太解压了吧 - 对战邀请',
      imageUrl: '', // 可以设置分享图片
      query: `roomCode=${roomCode}`, // 关键：传递房间号
      success: () => {
        console.log('✅ 分享成功');
        wx.showToast({
          title: '分享成功',
          icon: 'success'
        });
      },
      fail: (err) => {
        console.error('❌ 分享失败:', err);
        wx.showToast({
          title: '分享失败，请复制房间号',
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
              const { room, yourColor, opponent } = response.data;
              
              console.log('✅ 加入房间成功:', { roomCode, yourColor, opponent });
              
              wx.showToast({
                title: '加入成功',
                icon: 'success',
                duration: 1500
              });
              
              // 进入双人对战场景
              setTimeout(() => {
                const SceneManager = require('../utils/SceneManager.js');
                SceneManager.startMultiplayerGame(roomCode, yourColor, opponent);
              }, 1500);
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
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('这也太解压了吧', this.width / 2, safeTop + 70);
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
    
    // 绘制头像 + 用户信息
    const avatarSize = 50;
    const avatarX = cardX + 15 + avatarSize / 2;
    const avatarY = cardY + cardH / 2;
    
    // 绘制圆形头像
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    const avatarUrl = this.userInfo.avatarUrl || this.userInfo.avatar_url;
    if (avatarUrl && this.avatarImages[avatarUrl]) {
      // 绘制头像图片
      const img = this.avatarImages[avatarUrl];
      ctx.drawImage(img, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
    } else {
      // 绘制占位符（渐变背景 + 首字母）
      const gradient = ctx.createRadialGradient(avatarX, avatarY, 0, avatarX, avatarY, avatarSize / 2);
      gradient.addColorStop(0, '#42A5F5');
      gradient.addColorStop(1, '#1976D2');
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // 显示昵称首字母
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const firstChar = (this.userInfo.nickname || '游客')[0].toUpperCase();
      ctx.fillText(firstChar, avatarX, avatarY);
      
      // 触发头像加载（如果还未加载）
      if (avatarUrl && !this.loadingAvatars[avatarUrl]) {
        this.loadAvatar(avatarUrl);
      }
    }
    ctx.restore();
    
    // 头像边框
    ctx.strokeStyle = '#1976D2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // 用户信息（昵称和战绩，显示在头像右侧）
    const textX = avatarX + avatarSize / 2 + 10;
    
    ctx.font = 'bold 19px Arial';
    ctx.fillStyle = '#1976D2';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`欢迎, ${this.userInfo.nickname}`, textX, cardY + 15);
    
    // 更新昵称按钮（昵称旁边的刷新图标）
    const nicknameWidth = ctx.measureText(`欢迎, ${this.userInfo.nickname}`).width;
    this.drawRefreshButton(ctx, textX + nicknameWidth + 5, cardY + 15);
    
    ctx.font = '15px Arial';
    ctx.fillStyle = '#757575';
    const games = this.userInfo.totalGames || 0;
    const wins = this.userInfo.winGames || 0;
    ctx.fillText(`战绩: ${games}局 胜${wins}局`, textX, cardY + 42);
    
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
    ctx.fillText(`Version ${Config.VERSION}`, this.width / 2, this.height - 25);
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
   * 绘制刷新按钮（更新昵称）
   */
  drawRefreshButton(ctx, x, y) {
    const size = 20;
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    
    ctx.save();
    
    // 圆形背景
    ctx.fillStyle = 'rgba(25, 118, 210, 0.1)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // 刷新图标（圆形箭头）
    ctx.strokeStyle = '#1976D2';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    
    // 圆弧
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, -Math.PI / 2, Math.PI * 1.5, false);
    ctx.stroke();
    
    // 箭头
    ctx.beginPath();
    ctx.moveTo(centerX + 6, centerY);
    ctx.lineTo(centerX + 3, centerY - 3);
    ctx.moveTo(centerX + 6, centerY);
    ctx.lineTo(centerX + 6, centerY + 3);
    ctx.stroke();
    
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
   * 处理更新个人信息
   */
  async handleUpdateProfile() {
    try {
      wx.showLoading({ title: '获取中...' });
      
      // 调用微信授权获取用户信息
      const profileRes = await new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '更新您的昵称和头像',
          success: resolve,
          fail: reject,
        });
      });
      
      const userInfo = profileRes.userInfo;
      console.log('✅ 获取用户信息成功:', userInfo);
      
      // 调用后端接口更新用户信息
      const HttpClient = require('../api/HttpClient.js');
      const response = await HttpClient.post('/user/update-profile', {
        nickname: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
      });
      
      wx.hideLoading();
      
      if (response.code === 0) {
        // 更新本地缓存
        this.userInfo.nickname = userInfo.nickName;
        this.userInfo.avatarUrl = userInfo.avatarUrl;
        wx.setStorageSync('userInfo', this.userInfo);
        
        wx.showToast({
          title: '更新成功',
          icon: 'success',
        });
      } else {
        throw new Error(response.message || '更新失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('更新个人信息失败:', error);
      
      if (error.errMsg && error.errMsg.includes('cancel')) {
        wx.showToast({
          title: '已取消',
          icon: 'none',
        });
      } else {
        wx.showToast({
          title: '更新失败',
          icon: 'none',
        });
      }
    }
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

