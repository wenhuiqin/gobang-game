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

    console.log('🎮 多人对战初始化:');
    console.log('  房间ID:', this.roomId, `(${typeof this.roomId})`);
    console.log('  用户ID:', this.userId, `(${typeof this.userId})`);
    console.log('  我的颜色:', this.myColor);
    console.log('  对手ID:', this.opponentId, `(${typeof this.opponentId})`);
    console.log('  对手信息:', this.opponent);

    this.bindEvents();
    this.setupWebSocket();
    
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
    
    // 监听重连成功，请求同步棋盘
    SocketClient.on('connected', () => {
      console.log('✅ WebSocket重连成功，请求同步棋盘...');
      // 请求服务器同步当前房间的棋盘状态
      SocketClient.send('requestBoardSync', { roomId: this.roomId });
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
      
      wx.showModal({
        title: title,
        content: message,
        showCancel: true,
        confirmText: '返回菜单',
        cancelText: '查看棋局',
        success: (res) => {
          if (res.confirm) {
            this.returnToMenu();
          }
        },
      });
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

    if (this.gameOver) {
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
        
        // 震动反馈
        wx.vibrateShort({
          type: 'light'
        });
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
      let count = 1;
      
      // 正向
      let i = 1;
      while (
        x + i * dx >= 0 && x + i * dx < Config.BOARD_SIZE &&
        y + i * dy >= 0 && y + i * dy < Config.BOARD_SIZE &&
        this.board[x + i * dx][y + i * dy] === color
      ) {
        count++;
        i++;
      }
      
      // 反向
      i = 1;
      while (
        x - i * dx >= 0 && x - i * dx < Config.BOARD_SIZE &&
        y - i * dy >= 0 && y - i * dy < Config.BOARD_SIZE &&
        this.board[x - i * dx][y - i * dy] === color
      ) {
        count++;
        i++;
      }

      if (count >= Config.WIN_COUNT) {
        return true;
      }
    }

    return false;
  }

  /**
   * 处理游戏结束
   */
  handleGameOver(winnerColor) {
    this.gameOver = true;
    this.winner = winnerColor;

    const isMyWin = winnerColor === this.myColor;

    wx.showModal({
      title: isMyWin ? '你赢了！🎉' : '你输了！',
      content: isMyWin ? '恭喜获胜！' : '再接再厉！',
      showCancel: true,
      confirmText: '返回菜单',
      cancelText: '查看棋局',
      success: (res) => {
        if (res.confirm) {
          this.returnToMenu();
        }
      },
    });
  }

  /**
   * 返回菜单
   */
  returnToMenu() {
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

    const barHeight = 80;
    const barY = this.safeTop + 100;

    // 背景
    CanvasHelper.fillRoundRect(ctx, 20, barY, windowWidth - 40, barHeight, 10, 'rgba(255, 255, 255, 0.9)');

    // 对手信息
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    
    const opponentName = this.opponent.nickname || '对手';
    const opponentColor = this.myColor === Config.PIECE.BLACK ? '执白' : '执黑';
    
    ctx.fillText(`对手：${opponentName}（${opponentColor}）`, 40, barY + 25);

    // 回合指示
    ctx.font = '16px Arial';
    const isMyTurn = this.currentPlayer === this.myColor;
    const turnText = isMyTurn ? '✅ 你的回合' : '⏳ 对手回合';
    const myColorText = this.myColor === Config.PIECE.BLACK ? '执黑' : '执白';
    
    ctx.fillStyle = isMyTurn ? '#27ae60' : '#95a5a6';
    ctx.fillText(`你（${myColorText}）- ${turnText}`, 40, barY + 50);

    // 棋子指示
    ctx.save();
    const pieceX = windowWidth - 60;
    const pieceY = barY + barHeight / 2;
    
    ctx.beginPath();
    ctx.arc(pieceX, pieceY, 18, 0, Math.PI * 2);
    ctx.fillStyle = this.currentPlayer === Config.PIECE.BLACK ? '#000000' : '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 连接状态指示
    if (!SocketClient.connected) {
      ctx.save();
      ctx.fillStyle = '#e74c3c';
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      ctx.fillText('● 连接断开', windowWidth - 40, barY + 70);
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
    const statusBarHeight = 180; // 顶部状态栏高度
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
   * 绘制预览棋子（半透明，带提示）
   */
  drawPreviewPiece(row, col, color) {
    const ctx = this.ctx;
    const x = this.offsetX + col * this.cellSize;
    const y = this.offsetY + row * this.cellSize;
    const radius = Config.PIECE_RADIUS;
    
    ctx.save();
    
    // 设置半透明
    ctx.globalAlpha = 0.6;
    
    // 绘制提示圈（虚线）
    const pulseRadius = radius * 1.5;
    ctx.strokeStyle = color === Config.PIECE.BLACK ? '#000000' : '#666666';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // 绘制半透明棋子
    if (color === Config.PIECE.BLACK) {
      ctx.fillStyle = '#333333';
    } else {
      ctx.fillStyle = '#DDDDDD';
    }
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制边框
    ctx.strokeStyle = color === Config.PIECE.BLACK ? '#000000' : '#999999';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();
    
    // 绘制"点击确认"文字
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#FF6B6B';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('再点一次', x, y + radius + 18);
    
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

