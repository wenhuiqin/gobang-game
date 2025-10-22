const Config = require('../utils/Config.js');
const CanvasHelper = require('../utils/CanvasHelper.js');
const SocketClient = require('../api/SocketClient.js');

/**
 * 双人对战场景
 */
class MultiplayerGameScene {
  constructor(canvas, ctx, config) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.config = config; // { mode: 'multiplayer', roomId, myColor, opponentId, opponent }
    
    const { windowWidth, windowHeight, safeArea } = wx.getSystemInfoSync();
    this.width = windowWidth;
    this.height = windowHeight;
    this.safeTop = safeArea ? safeArea.top : 40;

    // 游戏状态
    this.board = Array(Config.BOARD_SIZE).fill(null).map(() => Array(Config.BOARD_SIZE).fill(0));
    this.currentPlayer = Config.PIECE.BLACK; // 黑方先手
    this.myColor = config.myColor || Config.PIECE.BLACK;
    this.gameOver = false;
    this.winner = null;
    this.winningLine = null; // 获胜连线 [{x, y}, {x, y}, ...]
    
    // 房间信息（确保类型一致性）
    this.roomId = String(config.roomId);
    this.userId = String(config.userId); // 我的userId
    this.opponentId = config.opponentId ? String(config.opponentId) : null;
    this.opponent = config.opponent || {}; // 对手信息：{ nickname, avatarUrl, etc }
    
    // 最后一手位置
    this.lastMove = null;
    
    // 点击预览状态
    this.previewPosition = null; // 预览位置 {x, y}
    
    // 返回按钮区域
    this.backButton = null;

    // DPR缩放
    this.dpr = wx.getSystemInfoSync().pixelRatio || 2;
    
    // 头像缓存
    this.avatarImages = {};
    this.loadingAvatars = {};
    
    // 获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    this.userInfo = userInfo || {};

    console.log('🎮 多人对战初始化:');
    console.log('  房间ID:', this.roomId, `(${typeof this.roomId})`);
    console.log('  用户ID:', this.userId, `(${typeof this.userId})`);
    console.log('  我的颜色:', this.myColor);
    console.log('  对手ID:', this.opponentId, `(${typeof this.opponentId})`);
    console.log('  对手信息:', this.opponent);
    console.log('  我的信息:', this.userInfo);

    this.bindEvents();
    this.setupWebSocket();
    
    // 预加载头像
    if (this.opponent && this.opponent.avatarUrl) {
      this.loadAvatar(this.opponent.avatarUrl);
    }
    if (this.userInfo && this.userInfo.avatarUrl) {
      this.loadAvatar(this.userInfo.avatarUrl);
    }
    
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
   * 加载头像图片
   */
  loadAvatar(url) {
    if (!url || this.avatarImages[url]) return;
    
    const img = wx.createImage();
    img.onload = () => {
      this.avatarImages[url] = img;
      delete this.loadingAvatars[url];
      // 头像加载完成后会在gameLoop中自动渲染
    };
    img.onerror = () => {
      console.error('头像加载失败:', url);
      delete this.loadingAvatars[url];
    };
    img.src = url;
  }

  /**
   * 设置WebSocket监听
   */
  setupWebSocket() {
    // 确保已连接WebSocket
    if (!SocketClient.connected) {
      SocketClient.connect(this.config.userId, true); // 启用自动重连
    }
    
    // 清除旧的监听器（使用不带回调的方式清除所有监听器）
    SocketClient.off('moveMade');
    SocketClient.off('gameOver');
    SocketClient.off('error');
    SocketClient.off('boardSync');
    SocketClient.off('disconnected');
    SocketClient.off('connected');
    
    console.log('🔄 已清除旧的事件监听器，准备重新注册');
    
    // 保存游戏上下文（用于断线重连）
    SocketClient.saveContext('game', {
      roomId: this.roomId,
      myColor: this.myColor,
      opponent: this.opponent
    });

    // 监听重连成功，请求同步棋盘
    SocketClient.on('connected', (data) => {
      if (data && data.isReconnect) {
        console.log('✅ WebSocket重连成功，请求同步棋盘...');
        wx.showToast({ title: '重连成功', icon: 'success', duration: 1000 });
        // 请求服务器同步当前房间的棋盘状态
        SocketClient.send('requestBoardSync', { roomId: this.roomId });
      }
    });

    // 监听断线
    SocketClient.on('disconnected', () => {
      console.warn('⚠️ WebSocket断开，等待重连...');
      wx.showToast({
        title: '连接断开，正在重连...',
        icon: 'none',
        duration: 2000
      });
    });

    // 监听棋盘同步
    SocketClient.on('boardSync', (data) => {
      console.log('📥 收到棋盘同步:', data);
      const { board, currentPlayer, lastMove } = data;
      
      if (board) {
        this.board = board;
        this.currentPlayer = currentPlayer;
        if (lastMove) {
          this.lastMove = lastMove;
        }
        
        wx.showToast({
          title: '棋盘已同步',
          icon: 'success',
          duration: 1000
        });
      }
    });
    
    // 监听对手下棋
    SocketClient.on('moveMade', (data) => {
      console.log('📩 收到下棋消息:', data);
      const { x, y, color, nextPlayer } = data;
      
      // 清除预览（无论是谁的棋）
      this.previewPosition = null;
      
      // 如果是自己下的棋，因为已经乐观更新过了，所以跳过
      if (color === this.myColor && this.board[x][y] === this.myColor) {
        console.log('✅ 是自己的棋，已乐观更新，跳过');
        return;
      }
      
      // 如果位置已有棋子且不是自己的颜色，说明出现了同步问题
      if (this.board[x][y] !== 0 && this.board[x][y] !== color) {
        console.warn('⚠️ 同步冲突，强制更新棋盘');
      }
      
      // 更新棋盘（对手的棋 或 修正同步问题）
      this.board[x][y] = color;
      this.currentPlayer = nextPlayer;
      this.lastMove = { x, y };
      
      // 播放对手下棋音效（如果不是自己的棋）
      if (color !== this.myColor) {
        this.playPlacePieceSound();
      }
      
      console.log(`📥 棋盘已更新: (${x}, ${y}) = ${color}, 下一玩家: ${nextPlayer}`);
      
      // 检查胜负
      if (this.checkWin(x, y, color)) {
        this.handleGameOver(color);
      }
    });

    // 监听游戏结束
    SocketClient.on('gameOver', (data) => {
      console.log('🏁 游戏结束:', data);
      console.log('🔍 我的userId:', this.userId);
      console.log('🔍 获胜者userId:', data.winner);
      
      // 清除游戏上下文
      SocketClient.clearContext();
      
      const { winner, reason } = data;
      
      this.gameOver = true;
      this.winner = winner;
      
      // 判断是否获胜（将两者都转为字符串比较）
      const isWinner = String(winner) === String(this.userId);
      const title = isWinner ? '🎉 你赢了！' : '😢 你输了！';
      
      // 根据reason生成提示文案
      let message = '';
      if (reason === 'surrender') {
        message = isWinner ? '对手认输了' : '你认输了';
      } else if (reason === 'disconnect') {
        message = '对手已断线';
      } else {
        message = isWinner ? '恭喜获胜！' : '再接再厉！';
      }
      
      // 先显示获胜连线（延迟500ms让玩家看到连线）
      setTimeout(() => {
        wx.showModal({
          title: title,
          content: message,
          showCancel: true,
          confirmText: '再来一局',
          cancelText: '查看棋局',
          success: (res) => {
            if (res.confirm) {
              this.playAgain();
            }
            // res.cancel 时不做任何操作，保留当前棋局和获胜连线
          },
        });
      }, 500); // 延迟500ms再显示弹窗
    });

    // 监听对方发起的重新开始请求
    SocketClient.on('restartGameRequest', (data) => {
      console.log('📨 收到对方的重新开始请求:', data);
      
      wx.showModal({
        title: '对方邀请',
        content: '对方想再来一局，是否同意？',
        confirmText: '同意',
        cancelText: '拒绝',
        success: (res) => {
          if (res.confirm) {
            // 同意重新开始
            SocketClient.send('restartGameResponse', {
              roomId: this.roomId,
              userId: this.userId,
              accepted: true
            });
            
            // 重置本地棋盘
            this.resetBoard();
          } else {
            // 拒绝重新开始
            SocketClient.send('restartGameResponse', {
              roomId: this.roomId,
              userId: this.userId,
              accepted: false
            });
            
            wx.showToast({
              title: '已拒绝',
              icon: 'none'
            });
          }
        }
      });
    });
    
    // 监听重新开始的响应
    SocketClient.on('gameRestarted', (data) => {
      console.log('✅ 游戏已重新开始:', data);
      
      wx.hideToast();
      
      if (data.accepted) {
        // 对方同意，重置棋盘
        this.resetBoard();
      } else {
        // 对方拒绝
        wx.showToast({
          title: '对方拒绝了',
          icon: 'none',
          duration: 2000
        });
      }
    });

    // 监听错误
    SocketClient.on('error', (err) => {
      console.error('❌ Socket错误:', err);
      wx.showToast({
        title: err.message || '网络错误',
        icon: 'none',
      });
    });
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
    // 返回按钮
    if (this.backButton) {
      const btn = this.backButton;
      if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
        wx.showModal({
          title: '确认退出',
          content: '退出将视为认输，确定退出吗？',
          success: (res) => {
            if (res.confirm) {
              SocketClient.surrender(this.roomId);
              this.returnToMenu();
            }
          },
        });
        return;
      }
    }

    // 如果游戏已结束，禁止下棋
    if (this.gameOver) {
      console.log('❌ 游戏已结束，无法下棋');
      return;
    }

    // 检查是否轮到自己
    if (this.currentPlayer !== this.myColor) {
      wx.showToast({
        title: '还没轮到你',
        icon: 'none',
        duration: 1000,
      });
      return;
    }

    // 计算点击位置对应的棋盘坐标
    const boardX = this.offsetX;
    const boardY = this.offsetY;
    const cellSize = this.cellSize;

    const col = Math.round((x - boardX) / cellSize);
    const row = Math.round((y - boardY) / cellSize);

    if (col >= 0 && col < Config.BOARD_SIZE && row >= 0 && row < Config.BOARD_SIZE) {
      // 检查位置是否为空
      if (this.board[row][col] !== 0) {
        console.log('❌ 该位置已有棋子');
        return;
      }
      
      // 双击确认逻辑
      if (this.previewPosition && 
          this.previewPosition.x === row && 
          this.previewPosition.y === col) {
        // 第二次点击同一位置，确认下棋
        console.log(`✅ 确认下棋: (${row}, ${col})`);
        this.previewPosition = null; // 清除预览
        this.placePiece(row, col);
      } else {
        // 第一次点击或点击不同位置，显示预览
        console.log(`👆 预览位置: (${row}, ${col})`);
        this.previewPosition = { x: row, y: col };
      }
    }
  }

  /**
   * 放置棋子
   */
  placePiece(x, y) {
    if (this.board[x][y] !== 0) {
      console.log('❌ 该位置已有棋子');
      return;
    }

    console.log(`✅ 玩家下棋: (${x}, ${y}), 我的颜色: ${this.myColor}`);
    console.log(`📤 发送makeMove: roomId=${this.roomId}, userId=${this.userId}, x=${x}, y=${y}`);

    // 发送到服务器
    SocketClient.makeMove(this.roomId, x, y);

    // 乐观更新UI
    this.board[x][y] = this.myColor;
    this.lastMove = { x, y };
    this.currentPlayer = this.myColor === Config.PIECE.BLACK ? Config.PIECE.WHITE : Config.PIECE.BLACK;
    
    // 播放下棋音效
    this.playPlacePieceSound();
    
    console.log(`🎨 本地棋盘已更新: board[${x}][${y}] = ${this.myColor}, 下一玩家: ${this.currentPlayer}`);

    // 检查胜负
    if (this.checkWin(x, y, this.myColor)) {
      this.handleGameOver(this.myColor);
    }
  }

  /**
   * 检查胜利
   */
  checkWin(x, y, color) {
    const directions = [
      [1, 0],   // 水平
      [0, 1],   // 垂直
      [1, 1],   // 主对角线
      [1, -1],  // 副对角线
    ];

    for (const [dx, dy] of directions) {
      const line = [{ x, y }]; // 起始点
      
      // 正向收集棋子
      const forward = this.collectDirection(x, y, dx, dy, color);
      // 反向收集棋子
      const backward = this.collectDirection(x, y, -dx, -dy, color);
      
      // 合并三个数组：backward（反向）+ 起始点 + forward（正向）
      const fullLine = [...backward.reverse(), ...line, ...forward];
      
      if (fullLine.length >= Config.WIN_COUNT) {
        // 保存获胜连线（只取前5个棋子）
        this.winningLine = fullLine.slice(0, Config.WIN_COUNT);
        return true;
      }
    }

    return false;
  }

  /**
   * 收集某个方向的连续同色棋子
   */
  collectDirection(x, y, dx, dy, color) {
    const pieces = [];
    let i = 1;
    while (
      x + i * dx >= 0 && x + i * dx < Config.BOARD_SIZE &&
      y + i * dy >= 0 && y + i * dy < Config.BOARD_SIZE &&
      this.board[x + i * dx][y + i * dy] === color
    ) {
      pieces.push({ x: x + i * dx, y: y + i * dy });
      i++;
    }
    return pieces;
  }

  /**
   * 处理游戏结束
   */
  handleGameOver(winnerColor) {
    this.gameOver = true;
    this.winner = winnerColor;

    const isMyWin = winnerColor === this.myColor;

    // 先显示获胜连线（延迟500ms让玩家看到连线）
    setTimeout(() => {
      wx.showModal({
        title: isMyWin ? '你赢了！🎉' : '你输了！',
        content: isMyWin ? '恭喜获胜！' : '再接再厉！',
        showCancel: true,
        confirmText: '再来一局',
        cancelText: '查看棋局',
        success: (res) => {
          if (res.confirm) {
            this.playAgain();
          }
          // res.cancel 时不做任何操作，保留当前棋局和获胜连线
        },
      });
    }, 500); // 延迟500ms再显示弹窗
  }

  /**
   * 再来一局
   */
  playAgain() {
    const SocketClient = require('../api/SocketClient.js');
    const SceneManager = require('../utils/SceneManager.js');
    
    // 判断游戏类型
    const isRandomMatch = this.roomId.startsWith('match_');
    
    if (isRandomMatch) {
      // 随机匹配：提供两个选项
      console.log('🎮 随机匹配模式，询问用户选择');
      
      wx.showActionSheet({
        itemList: ['💪 与TA再战一局', '🔄 重新匹配新对手'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 与当前对手再来一局
            console.log('👥 与当前对手再来一局');
            
            // 发送重新开始请求到服务器
            SocketClient.send('restartGame', {
              roomId: this.roomId,
              userId: this.userId
            });
            
            // 重置本地棋盘
            this.resetBoard();
            
            wx.showToast({
              title: '等待对方确认...',
              icon: 'loading',
              duration: 3000
            });
          } else if (res.tapIndex === 1) {
            // 重新匹配：清除上下文，回到菜单并自动开始新的匹配
            console.log('🔄 重新匹配，回到菜单');
            SocketClient.clearContext();
            SceneManager.switchScene('menu');
            
            // 延迟一点让场景切换完成，然后自动触发匹配
            setTimeout(() => {
              const menuScene = SceneManager.instance.currentScene;
              if (menuScene && menuScene.startRandomMatch) {
                menuScene.startRandomMatch();
              }
            }, 500);
          }
        }
      });
    } else {
      // 好友对战：保留房间，重置棋盘
      console.log('👥 好友对战模式，重置棋盘继续在同一房间');
      
      wx.showModal({
        title: '再来一局？',
        content: '是否邀请对方再来一局？',
        confirmText: '确定',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 发送重新开始请求到服务器
            SocketClient.send('restartGame', {
              roomId: this.roomId,
              userId: this.userId
            });
            
            // 重置本地棋盘
            this.resetBoard();
            
            wx.showToast({
              title: '等待对方确认...',
              icon: 'loading',
              duration: 3000
            });
          }
        }
      });
    }
  }
  
  /**
   * 重置棋盘（不离开房间）
   */
  resetBoard() {
    console.log('🔄 重置棋盘');
    
    // 重置棋盘状态
    this.board = Array(Config.BOARD_SIZE).fill(null).map(() => Array(Config.BOARD_SIZE).fill(0));
    this.currentPlayer = Config.PIECE.BLACK;
    this.gameOver = false;
    this.winner = null;
    this.winningLine = null;
    this.lastMove = null;
    this.previewPosition = null;
    
    // 重新渲染
    this.render();
    
    wx.showToast({
      title: '游戏已重置',
      icon: 'success',
      duration: 1500
    });
  }

  /**
   * 返回菜单
   */
  returnToMenu() {
    // 清除游戏上下文
    const SocketClient = require('../api/SocketClient.js');
    SocketClient.clearContext();
    
    const SceneManager = require('../utils/SceneManager.js');
    SceneManager.switchScene('menu');
  }

  /**
   * 渲染场景
   */
  render() {
    const ctx = this.ctx;
    const { windowWidth, windowHeight } = wx.getSystemInfoSync();

    // 清空画布
    ctx.clearRect(0, 0, windowWidth, windowHeight);

    // 绘制背景
    this.drawBackground();

    // 绘制标题
    this.drawTitle();

    // 绘制返回按钮
    this.drawBackButton(this.safeTop);

    // 绘制状态栏
    this.drawStatusBar();

    // 绘制棋盘
    this.drawBoard();

    // 绘制棋子
    this.drawPieces();
    
    // 绘制获胜连线（如果有）
    if (this.winningLine && this.winningLine.length > 0) {
      this.drawWinningLine();
    }
  }

  /**
   * 绘制背景
   */
  drawBackground() {
    const ctx = this.ctx;
    const { windowWidth, windowHeight } = wx.getSystemInfoSync();

    const gradient = ctx.createLinearGradient(0, 0, 0, windowHeight);
    gradient.addColorStop(0, '#E3F2FD');
    gradient.addColorStop(0.5, '#BBDEFB');
    gradient.addColorStop(1, '#90CAF9');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, windowWidth, windowHeight);
  }

  /**
   * 绘制标题
   */
  drawTitle() {
    const ctx = this.ctx;
    const { windowWidth } = wx.getSystemInfoSync();

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    
    ctx.fillStyle = '#1565C0';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('双人对战', windowWidth / 2, this.safeTop + 70);
    
    ctx.restore();
  }

  /**
   * 绘制状态栏
   */
  drawStatusBar() {
    const ctx = this.ctx;
    const { windowWidth } = wx.getSystemInfoSync();

    const barHeight = 100;
    const barY = this.safeTop + 100;

    // 背景
    CanvasHelper.fillRoundRect(ctx, 20, barY, windowWidth - 40, barHeight, 10, 'rgba(255, 255, 255, 0.9)');

    const avatarSize = 50;
    const leftX = 30;
    
    // === 对手信息（左侧） ===
    const opponentAvatarX = leftX + avatarSize / 2;
    const opponentAvatarY = barY + barHeight / 2;
    
    // 对手头像
    ctx.save();
    ctx.beginPath();
    ctx.arc(opponentAvatarX, opponentAvatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    const opponentAvatarUrl = this.opponent.avatarUrl || this.opponent.avatar_url;
    if (opponentAvatarUrl && this.avatarImages && this.avatarImages[opponentAvatarUrl]) {
      const img = this.avatarImages[opponentAvatarUrl];
      ctx.drawImage(img, opponentAvatarX - avatarSize / 2, opponentAvatarY - avatarSize / 2, avatarSize, avatarSize);
    } else {
      // 占位符
      const gradient = ctx.createRadialGradient(opponentAvatarX, opponentAvatarY, 0, opponentAvatarX, opponentAvatarY, avatarSize / 2);
      gradient.addColorStop(0, '#FF6B6B');
      gradient.addColorStop(1, '#C92A2A');
      ctx.fillStyle = gradient;
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const firstChar = ((this.opponent.nickname || '?')[0]).toUpperCase();
      ctx.fillText(firstChar, opponentAvatarX, opponentAvatarY);
      
      // 预加载头像
      if (opponentAvatarUrl && !this.loadingAvatars[opponentAvatarUrl]) {
        this.loadingAvatars[opponentAvatarUrl] = true;
        this.loadAvatar(opponentAvatarUrl);
      }
    }
    ctx.restore();
    
    // 对手头像边框
    ctx.strokeStyle = '#E74C3C';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(opponentAvatarX, opponentAvatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // 对手信息文字
    const opponentTextX = leftX + avatarSize + 15;
    const opponentName = this.opponent.nickname || '对手';
    const opponentColor = this.myColor === Config.PIECE.BLACK ? '白方' : '黑方';
    
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(opponentName, opponentTextX, barY + 20);
    
    ctx.font = '14px Arial';
    ctx.fillStyle = '#7f8c8d';
    ctx.fillText(`${opponentColor}`, opponentTextX, barY + 42);
    
    // 对手回合指示
    const isOpponentTurn = this.currentPlayer !== this.myColor;
    if (isOpponentTurn) {
      ctx.fillStyle = '#27ae60';
      ctx.font = 'bold 12px Arial';
      ctx.fillText('● 对方回合', opponentTextX, barY + 62);
    }
    
    // === 我的信息（右侧） ===
    const myAvatarX = windowWidth - leftX - avatarSize / 2;
    const myAvatarY = barY + barHeight / 2;
    
    // 我的头像
    ctx.save();
    ctx.beginPath();
    ctx.arc(myAvatarX, myAvatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    const myAvatarUrl = this.userInfo.avatarUrl || this.userInfo.avatar_url;
    if (myAvatarUrl && this.avatarImages && this.avatarImages[myAvatarUrl]) {
      const img = this.avatarImages[myAvatarUrl];
      ctx.drawImage(img, myAvatarX - avatarSize / 2, myAvatarY - avatarSize / 2, avatarSize, avatarSize);
    } else {
      // 占位符
      const gradient = ctx.createRadialGradient(myAvatarX, myAvatarY, 0, myAvatarX, myAvatarY, avatarSize / 2);
      gradient.addColorStop(0, '#4ECDC4');
      gradient.addColorStop(1, '#44A6B0');
      ctx.fillStyle = gradient;
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const firstChar = ((this.userInfo.nickname || '我')[0]).toUpperCase();
      ctx.fillText(firstChar, myAvatarX, myAvatarY);
      
      // 预加载头像
      if (myAvatarUrl && !this.loadingAvatars[myAvatarUrl]) {
        this.loadingAvatars[myAvatarUrl] = true;
        this.loadAvatar(myAvatarUrl);
      }
    }
    ctx.restore();
    
    // 我的头像边框
    ctx.strokeStyle = '#3498DB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(myAvatarX, myAvatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // 我的信息文字
    const myTextX = myAvatarX - avatarSize / 2 - 15;
    const myName = this.userInfo.nickname || '我';
    const myColorText = this.myColor === Config.PIECE.BLACK ? '黑方' : '白方';
    
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(myName, myTextX, barY + 20);
    
    ctx.font = '14px Arial';
    ctx.fillStyle = '#7f8c8d';
    ctx.fillText(`${myColorText}`, myTextX, barY + 42);
    
    // 我的回合指示
    const isMyTurn = this.currentPlayer === this.myColor;
    if (isMyTurn) {
      ctx.fillStyle = '#27ae60';
      ctx.font = 'bold 12px Arial';
      ctx.fillText('我的回合 ●', myTextX, barY + 62);
    }

    // 连接状态指示（底部居中）
    if (!SocketClient.connected) {
      ctx.save();
      ctx.fillStyle = '#e74c3c';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('● 连接断开', windowWidth / 2, barY + barHeight - 10);
      ctx.restore();
    }
  }

  /**
   * 绘制棋盘
   */
  drawBoard() {
    const ctx = this.ctx;
    const { windowWidth, windowHeight } = wx.getSystemInfoSync();

    // 优化：棋盘占满宽度，只留10px安全边距
    const horizontalPadding = 10;
    const statusBarHeight = 200; // 顶部状态栏高度（增加以适应头像）
    const availableHeight = windowHeight - this.safeTop - statusBarHeight - 60;
    const availableWidth = windowWidth - horizontalPadding * 2;
    
    const boardSize = Math.min(availableWidth, availableHeight);
    const cellSize = boardSize / (Config.BOARD_SIZE - 1);
    
    this.cellSize = cellSize;
    this.offsetX = (windowWidth - boardSize) / 2;
    this.offsetY = this.safeTop + statusBarHeight + (availableHeight - boardSize) / 2;
    
    console.log(`📐 多人对战棋盘: 格子=${cellSize.toFixed(1)}px, 棋盘=${boardSize.toFixed(1)}px, 屏幕=${windowWidth}px`);

    // 棋盘背景
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;
    
    const padding = cellSize / 2;
    CanvasHelper.fillRoundRect(
      ctx,
      this.offsetX - padding,
      this.offsetY - padding,
      boardSize + padding * 2,
      boardSize + padding * 2,
      10,
      '#D4A76A'
    );
    ctx.restore();

    // 绘制网格
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;

    for (let i = 0; i < Config.BOARD_SIZE; i++) {
      // 横线
      ctx.beginPath();
      ctx.moveTo(this.offsetX, this.offsetY + i * cellSize);
      ctx.lineTo(this.offsetX + boardSize, this.offsetY + i * cellSize);
      ctx.stroke();

      // 竖线
      ctx.beginPath();
      ctx.moveTo(this.offsetX + i * cellSize, this.offsetY);
      ctx.lineTo(this.offsetX + i * cellSize, this.offsetY + boardSize);
      ctx.stroke();
    }

    // 绘制天元等标记点
    const markPoints = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
    ctx.fillStyle = '#000000';
    
    markPoints.forEach(([row, col]) => {
      ctx.beginPath();
      ctx.arc(
        this.offsetX + col * cellSize,
        this.offsetY + row * cellSize,
        3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
  }

  /**
   * 绘制棋子
   */
  drawPieces() {
    const ctx = this.ctx;

    for (let i = 0; i < Config.BOARD_SIZE; i++) {
      for (let j = 0; j < Config.BOARD_SIZE; j++) {
        if (this.board[i][j] !== 0) {
          const x = this.offsetX + j * this.cellSize;
          const y = this.offsetY + i * this.cellSize;
          const color = this.board[i][j];

          // 绘制棋子
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, Config.PIECE_RADIUS, 0, Math.PI * 2);
          
          // 渐变效果
          const gradient = ctx.createRadialGradient(
            x - 3, y - 3, 1,
            x, y, Config.PIECE_RADIUS
          );
          
          if (color === Config.PIECE.BLACK) {
            gradient.addColorStop(0, '#555');
            gradient.addColorStop(1, '#000');
          } else {
            gradient.addColorStop(0, '#FFF');
            gradient.addColorStop(1, '#DDD');
          }
          
          ctx.fillStyle = gradient;
          ctx.fill();
          
          // 描边
          ctx.strokeStyle = color === Config.PIECE.BLACK ? '#000' : '#999';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          ctx.restore();

          // 标记最后一手
          if (this.lastMove && this.lastMove.x === i && this.lastMove.y === j) {
            ctx.save();
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, Config.PIECE_RADIUS - 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }
    
    // 绘制预览棋子（半透明）
    if (this.previewPosition) {
      this.drawPreviewPiece(this.previewPosition.x, this.previewPosition.y, this.currentPlayer);
    }
  }
  
  /**
   * 绘制预览棋子（半透明，低调提示）
   */
  drawPreviewPiece(row, col, color) {
    const ctx = this.ctx;
    const x = this.offsetX + col * this.cellSize;
    const y = this.offsetY + row * this.cellSize;
    const radius = Config.PIECE_RADIUS;
    
    ctx.save();
    
    // 设置半透明
    ctx.globalAlpha = 0.5;
    
    // 绘制提示圈（虚线圈）
    const pulseRadius = radius * 1.2;
    ctx.strokeStyle = color === Config.PIECE.BLACK ? '#000000' : '#999999';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]); // 虚线
    ctx.beginPath();
    ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // 绘制半透明棋子
    if (color === Config.PIECE.BLACK) {
      ctx.fillStyle = '#555555';
    } else {
      ctx.fillStyle = '#CCCCCC';
    }
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制边框
    ctx.strokeStyle = color === Config.PIECE.BLACK ? '#000000' : '#999999';
    ctx.lineWidth = 1;
    ctx.setLineDash([]); // 恢复实线
    ctx.stroke();
    
    ctx.restore();
  }

  /**
   * 绘制返回按钮
   */
  drawBackButton(safeTop) {
    const ctx = this.ctx;
    const arrowSize = 40;
    const arrowX = 20;
    const arrowY = safeTop + 15;
    
    this.backButton = { 
      x: arrowX - 5, 
      y: arrowY - 5, 
      width: arrowSize + 10, 
      height: arrowSize + 10 
    };

    ctx.save();
    ctx.strokeStyle = '#2c3e50';
    ctx.fillStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const centerX = arrowX + arrowSize / 2;
    const centerY = arrowY + arrowSize / 2;

    // 箭头主线
    ctx.beginPath();
    ctx.moveTo(centerX + 12, centerY);
    ctx.lineTo(centerX - 8, centerY);
    ctx.stroke();

    // 箭头上半
    ctx.beginPath();
    ctx.moveTo(centerX - 8, centerY);
    ctx.lineTo(centerX - 2, centerY - 6);
    ctx.stroke();

    // 箭头下半
    ctx.beginPath();
    ctx.moveTo(centerX - 8, centerY);
    ctx.lineTo(centerX - 2, centerY + 6);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 绘制获胜连线
   */
  drawWinningLine() {
    if (!this.winningLine || this.winningLine.length < 2) return;
    
    const ctx = this.ctx;
    ctx.save();
    
    // 绘制一条粗红线连接获胜的五个棋子
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    
    // 添加发光效果
    ctx.shadowColor = '#FF0000';
    ctx.shadowBlur = 10;
    
    ctx.beginPath();
    
    // 起始点（注意：多人游戏棋盘是row,col，与单人游戏x,y相反）
    const startPiece = this.winningLine[0];
    const startX = this.offsetX + startPiece.y * this.cellSize;
    const startY = this.offsetY + startPiece.x * this.cellSize;
    ctx.moveTo(startX, startY);
    
    // 连接所有获胜的棋子
    for (let i = 1; i < this.winningLine.length; i++) {
      const piece = this.winningLine[i];
      const x = this.offsetX + piece.y * this.cellSize;
      const y = this.offsetY + piece.x * this.cellSize;
      ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 播放下棋音效
   */
  playPlacePieceSound() {
    try {
      // 使用微信API播放音效（短促的提示音）
      const innerAudioContext = wx.createInnerAudioContext();
      innerAudioContext.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DqwGwhBSuBze/bfzgHJHfG7+CUPQkVXrLo7KRVFQ1Oo+HvumgeCyZ6yu3ahDMGHWq38+ylVhQNTp/i77ZoHgsmeMvs2oQzBhlptfDtpFQVDU2e4e+2aB4LJnjK7NqFMwYYabXv7aRUFQ1MnuHvtmgeCyZ4yuzahTMGGGm18O2kVBUNTJ7h77ZoHgsmeMrs2oUzBhhptfDtpFQVDU2e4e+2aB4LJnnK7NqFMwYYabXw7aRUFQ1MnuHvtmgeCyZ4yuzahTMGGGm18O2kVBUNTJ7h77ZoHgsmeMrs2oUzBhhptfDtpFQVDU2e4e+2aB4LJnnK7NqFMwYYabXw7aRUFQ1MnuHvtmgeCyZ4yuzahTMGGGm18O2kVBUNTJ7h77ZoHgsmecrs2oUzBhhptfDtpFQVDU2e4e+2aB4LJnnK7NqFMwYYabXw7aRUFQ1MnuHvtmgeCyZ4yuzahTMGGGm18O2kVBUNTJ7h77ZoHgsmecrs2oUzBhhptfDtpFQVDU2e4e+2aB4LJnnK7NqFMwYYabXw7aRUFQ1MnuHvtmgeCyZ4yuzahTMGGGm18O2kVBUNTJ7h77ZoHgsmecrs2oUzBhhptfDtpFQVDU2e4e+2aB4LJnnK7NqFMwYYabXw7aRUFQ1MnuHvtmgeCyZ4yuzahTMGGGm18O2kVBUNTJ7h77ZoHgsmecrs2oUzBhhptfDtpFQVDU2e4e+2aB4LJnnK7NqFMwYYabXw7aRUFQ1Mn+HvtmgeCyZ5yuzahTMGGGm18O2kVBUNTJ7h77ZoHgsmecrs2oUzBhhptfDtpFQVDU2f4e+2aB4LJnnK7NqFMwYYabXw7aRUFQ1Mn+HvtmgeCyZ5yuzahTMGGGm18O2kVBUNTZ/h77ZoHgsmecrs2oUzBhhptfDtpFQVDU2f4e+2aB4LJnnK7NqFMwYYabXw7aRUFQ==';
      innerAudioContext.volume = 0.3; // 音量30%（低调）
      innerAudioContext.play();
      
      // 播放完成后销毁
      innerAudioContext.onEnded(() => {
        innerAudioContext.destroy();
      });
      
      // 播放失败也销毁
      innerAudioContext.onError(() => {
        innerAudioContext.destroy();
      });
    } catch (error) {
      console.log('音效播放失败:', error);
    }
  }

  /**
   * 销毁场景
   */
  destroy() {
    console.log('🗑️ 多人对战场景销毁中...');
    this.running = false; // 停止游戏循环
    wx.offTouchStart(this.touchHandler);
    
    // 清除所有WebSocket监听器
    SocketClient.off('moveMade');
    SocketClient.off('gameOver');
    SocketClient.off('error');
    SocketClient.off('boardSync');
    SocketClient.off('disconnected');
    SocketClient.off('connected');
    
    console.log('✅ 多人对战场景已销毁');
  }
}

module.exports = MultiplayerGameScene;

