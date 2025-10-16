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
    this.config = config; // { mode: 'multiplayer', roomId, myColor, opponentId }
    
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
    
    // 房间信息
    this.roomId = config.roomId;
    this.opponentId = config.opponentId;
    
    // 最后一手位置
    this.lastMove = null;
    
    // 返回按钮区域
    this.backButton = null;

    // DPR缩放
    this.dpr = wx.getSystemInfoSync().pixelRatio || 2;

    this.bindEvents();
    this.setupWebSocket();
  }

  /**
   * 设置WebSocket监听
   */
  setupWebSocket() {
    // 确保已连接WebSocket
    if (!SocketClient.connected) {
      SocketClient.connect(this.config.userId);
    }
    
    // 清除旧的监听器
    SocketClient.off('moveMade');
    SocketClient.off('gameOver');
    SocketClient.off('error');
    
    // 监听对手下棋
    SocketClient.on('moveMade', (data) => {
      console.log('📩 对手下棋:', data);
      const { x, y, color, nextPlayer } = data;
      
      this.board[x][y] = color;
      this.currentPlayer = nextPlayer;
      this.lastMove = { x, y };
      
      // 检查胜负
      if (this.checkWin(x, y, color)) {
        this.handleGameOver(color);
      }
    });

    // 监听游戏结束
    SocketClient.on('gameOver', (data) => {
      console.log('🏁 游戏结束:', data);
      const { winner, reason } = data;
      
      this.gameOver = true;
      this.winner = winner;
      
      const message = reason === 'surrender' ? '对手认输' : '对手获胜';
      
      wx.showModal({
        title: winner === this.config.userId ? '你赢了！' : '你输了！',
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
      this.placePiece(row, col);
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

    console.log(`✅ 玩家下棋: (${x}, ${y})`);

    // 发送到服务器
    SocketClient.makeMove(this.roomId, x, y);

    // 乐观更新UI
    this.board[x][y] = this.myColor;
    this.lastMove = { x, y };
    this.currentPlayer = this.myColor === Config.PIECE.BLACK ? Config.PIECE.WHITE : Config.PIECE.BLACK;

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

    const barHeight = 60;
    const barY = this.safeTop + 100;

    // 背景
    CanvasHelper.fillRoundRect(ctx, 20, barY, windowWidth - 40, barHeight, 10, 'rgba(255, 255, 255, 0.9)');

    // 回合指示
    ctx.fillStyle = '#2c3e50';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    
    const isMyTurn = this.currentPlayer === this.myColor;
    const turnText = isMyTurn ? '你的回合' : '对手回合';
    const colorText = this.myColor === Config.PIECE.BLACK ? '执黑' : '执白';
    
    ctx.fillText(`${colorText} | ${turnText}`, 40, barY + 35);

    // 棋子指示
    ctx.save();
    const pieceX = windowWidth - 60;
    const pieceY = barY + barHeight / 2;
    
    ctx.beginPath();
    ctx.arc(pieceX, pieceY, 15, 0, Math.PI * 2);
    ctx.fillStyle = this.currentPlayer === Config.PIECE.BLACK ? '#000000' : '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 绘制棋盘
   */
  drawBoard() {
    const ctx = this.ctx;
    const { windowWidth, windowHeight } = wx.getSystemInfoSync();

    const boardSize = Math.min(windowWidth, windowHeight) * 0.85;
    const cellSize = boardSize / (Config.BOARD_SIZE - 1);
    
    this.cellSize = cellSize;
    this.offsetX = (windowWidth - boardSize) / 2;
    this.offsetY = this.safeTop + 180 + (windowHeight - this.safeTop - 240 - boardSize) / 2;

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
    wx.offTouchStart(this.touchHandler);
    SocketClient.off('moveMade');
    SocketClient.off('gameOver');
    SocketClient.off('error');
  }
}

module.exports = MultiplayerGameScene;

