/**
 * 游戏主场景
 */

const Config = require('../utils/Config.js');
const HttpClient = require('../api/HttpClient.js');

class GameScene {
  constructor(canvas, ctx, config) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.config = config || {};
    this.difficulty = config.difficulty || 2; // 默认中等难度
    
    // 玩家和AI的颜色
    this.playerColor = config.playerColor === 'white' ? Config.PIECE.WHITE : Config.PIECE.BLACK;
    this.aiColor = this.playerColor === Config.PIECE.BLACK ? Config.PIECE.WHITE : Config.PIECE.BLACK;
    
    console.log('🎮 游戏配置:', {
      playerColor: this.playerColor === Config.PIECE.BLACK ? '黑' : '白',
      aiColor: this.aiColor === Config.PIECE.BLACK ? '黑' : '白',
      difficulty: this.difficulty
    });
    
    // 游戏状态
    this.board = this.initBoard();
    this.currentPlayer = Config.PIECE.BLACK; // 黑方永远先手
    this.gameStarted = false;
    this.userId = null;
    this.lastMove = null;
    this.isAIThinking = false; // 防止AI重复思考
    
    // 返回按钮区域
    this.backButton = null;
    
    // 获取设备像素比，提高清晰度
    const dpr = wx.getSystemInfoSync().pixelRatio || 2;
    this.dpr = dpr;
    
    // 调整Canvas尺寸以适配高分辨率屏幕
    const { windowWidth, windowHeight } = wx.getSystemInfoSync();
    canvas.width = windowWidth * dpr;
    canvas.height = windowHeight * dpr;
    ctx.scale(dpr, dpr);
    
    // 布局参数
    const titleHeight = 80;      // 标题区域高度
    const statusBarHeight = 80;  // 底部状态栏高度
    const padding = 20;          // 边距
    
    // 计算可用空间
    const availableHeight = windowHeight - titleHeight - statusBarHeight;
    const availableWidth = windowWidth - padding * 2;
    
    // 计算合适的格子大小
    this.cellSize = Math.min(
      availableWidth / (Config.BOARD_SIZE - 1),
      availableHeight / (Config.BOARD_SIZE - 1)
    );
    
    // 棋盘尺寸
    const boardWidth = this.cellSize * (Config.BOARD_SIZE - 1);
    const boardHeight = this.cellSize * (Config.BOARD_SIZE - 1);
    
    // 水平居中
    this.offsetX = (windowWidth - boardWidth) / 2;
    
    // 垂直居中（在标题和状态栏之间）
    this.offsetY = titleHeight + (availableHeight - boardHeight) / 2;
    
    this.bindEvents();
  }

  initBoard() {
    return Array(Config.BOARD_SIZE).fill(null)
      .map(() => Array(Config.BOARD_SIZE).fill(Config.PIECE.EMPTY));
  }

  bindEvents() {
    this.touchHandler = (e) => {
      if (!this.gameStarted) return;
      const touch = e.touches[0];
      this.handleTouch(touch.clientX, touch.clientY);
    };
    wx.onTouchStart(this.touchHandler);
  }

  handleTouch(x, y) {
    // 检测返回按钮点击
    if (this.backButton) {
      const btn = this.backButton;
      if (x >= btn.x && x <= btn.x + btn.width && 
          y >= btn.y && y <= btn.y + btn.height) {
        console.log('点击返回按钮');
        wx.showModal({
          title: '确认返回',
          content: '确定要返回菜单吗？当前游戏进度将丢失。',
          confirmText: '确定',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              // 返回菜单
              const SceneManager = require('../utils/SceneManager.js');
              SceneManager.switchScene('menu');
            }
          },
        });
        return;
      }
    }
    
    // 如果AI正在思考，忽略玩家操作
    if (this.isAIThinking) {
      return;
    }
    
    // 如果是AI对战模式，检查是否轮到玩家
    if (this.config.mode === 'ai' && this.currentPlayer !== this.playerColor) {
      console.log('❌ 还没轮到你，当前是', this.currentPlayer === Config.PIECE.BLACK ? '黑方' : '白方', '回合');
      return;
    }
    
    const pos = this.getTouchPosition(x, y);
    if (pos && this.board[pos.x][pos.y] === Config.PIECE.EMPTY) {
      this.placePiece(pos.x, pos.y);
    }
  }

  getTouchPosition(touchX, touchY) {
    const threshold = this.cellSize / 2;
    for (let i = 0; i < Config.BOARD_SIZE; i++) {
      for (let j = 0; j < Config.BOARD_SIZE; j++) {
        const x = this.offsetX + i * this.cellSize;
        const y = this.offsetY + j * this.cellSize;
        if (Math.abs(touchX - x) <= threshold && 
            Math.abs(touchY - y) <= threshold) {
          return { x: i, y: j };
        }
      }
    }
    return null;
  }

  placePiece(x, y, isAIMove = false) {
    // 检查位置是否为空
    if (this.board[x][y] !== Config.PIECE.EMPTY) {
      console.error('❌ 位置已被占用:', x, y, '当前值:', this.board[x][y]);
      return;
    }
    
    this.board[x][y] = this.currentPlayer;
    this.lastMove = { x, y };
    
    console.log(`✅ ${this.currentPlayer === Config.PIECE.BLACK ? '黑方' : '白方'}下棋: (${x}, ${y})`);
    
    // 输出当前棋盘上的所有棋子
    let pieces = [];
    for (let i = 0; i < Config.BOARD_SIZE; i++) {
      for (let j = 0; j < Config.BOARD_SIZE; j++) {
        if (this.board[i][j] !== Config.PIECE.EMPTY) {
          pieces.push(`(${i},${j})=${this.board[i][j]}`);
        }
      }
    }
    console.log('📍 当前棋盘:', pieces.join(', '));
    
    // 检查胜利
    if (this.checkWin(x, y)) {
      this.isAIThinking = false; // 重置AI思考状态
      
      // 如果是人机对战，记录结果
      if (this.config.mode === 'ai') {
        const playerWon = this.currentPlayer === this.playerColor;
        this.recordGameResult(playerWon);
      }
      
      setTimeout(() => {
        wx.showModal({
          title: '🎉 游戏结束',
          content: this.currentPlayer === Config.PIECE.BLACK ? '⚫ 黑方获胜！' : '⚪ 白方获胜！',
          showCancel: true,
          cancelText: '查看棋局',
          confirmText: '再来一局',
          success: (res) => {
            if (res.confirm) {
              this.reset();
            }
            // res.cancel 时不做任何操作，保留当前棋局
          },
        });
      }, 300);
      return;
    }
    
    // 切换玩家
    this.currentPlayer = this.currentPlayer === Config.PIECE.BLACK 
      ? Config.PIECE.WHITE 
      : Config.PIECE.BLACK;
    
    console.log(`🔄 切换到${this.currentPlayer === Config.PIECE.BLACK ? '黑方' : '白方'}`);
    
    // 如果是AI对战且轮到AI，且不是AI刚下的棋，自动下棋
    if (this.config.mode === 'ai' && this.currentPlayer === this.aiColor && !isAIMove) {
      console.log('🤖 触发AI思考...');
      setTimeout(() => {
        this.aiMove();
      }, 500); // 延迟0.5秒，让玩家看清楚
    }
  }

  async aiMove(retryCount = 0) {
    const MAX_RETRIES = 3; // 最多重试3次
    
    if (this.isAIThinking) {
      console.log('AI正在思考中，跳过');
      return;
    }
    
    this.isAIThinking = true;
    const HttpClient = require('../api/HttpClient.js');
    
    try {
      console.log(`🤖 AI开始思考 (尝试 ${retryCount + 1}/${MAX_RETRIES + 1})，当前玩家:`, this.currentPlayer);
      console.log('AI开始思考，当前棋盘:', this.board);
      
      // 深拷贝棋盘数据，避免引用问题
      const boardCopy = JSON.parse(JSON.stringify(this.board));
      
      console.log('发送给AI的棋盘:', boardCopy);
      
      // 调用后端AI接口（困难模式需要更长时间）
      const timeout = this.difficulty === 3 ? 60000 : 30000; // 困难模式60秒，其他30秒
      console.log(`⏱️ AI请求超时设置: ${timeout}ms`);
      
      const response = await HttpClient.post('/game/ai-move', {
        board: boardCopy,
        difficulty: this.difficulty,
        aiColor: this.aiColor, // 告诉后端AI是哪个颜色
      }, timeout);
      
      console.log('🔍 AI完整响应:', JSON.stringify(response));
      console.log('🔍 response.code:', response.code);
      console.log('🔍 response.data:', response.data);
      console.log('🔍 response.data.position:', response.data && response.data.position);
      
      if (response.code === 0 && response.data && response.data.position) {
        const { x, y } = response.data.position;
        console.log('✅ AI位置解析成功:', x, y);
        
        console.log(`🤖 AI想要下在: (${x}, ${y}), 当前位置状态:`, this.board[x][y]);
        
        // 验证位置是否为空
        if (this.board[x][y] !== Config.PIECE.EMPTY) {
          console.error(`❌ AI返回的位置(${x}, ${y})已被占用!`);
          
          // 重试
          if (retryCount < MAX_RETRIES) {
            console.log(`🔄 AI位置冲突，准备重试...`);
            wx.showToast({
              title: `电脑重新思考中...`,
              icon: 'loading',
              duration: 1000
            });
            this.isAIThinking = false;
            setTimeout(() => {
              this.aiMove(retryCount + 1);
            }, 1000);
            return;
          } else {
            console.error(`❌ AI重试${MAX_RETRIES}次后仍然失败`);
            wx.showToast({
              title: '电脑出错，请重新开始',
              icon: 'none',
            });
            this.currentPlayer = this.playerColor;
            this.isAIThinking = false;
            return;
          }
        }
        
        // 直接在棋盘上放置AI棋子（不通过placePiece，避免再次触发AI）
        this.board[x][y] = this.aiColor;
        this.lastMove = { x, y };
        
        const aiColorName = this.aiColor === Config.PIECE.BLACK ? '黑方' : '白方';
        console.log(`✅ AI(${aiColorName})下棋: (${x}, ${y})`);
        
        // 输出当前棋盘
        let pieces = [];
        for (let i = 0; i < Config.BOARD_SIZE; i++) {
          for (let j = 0; j < Config.BOARD_SIZE; j++) {
            if (this.board[i][j] !== Config.PIECE.EMPTY) {
              pieces.push(`(${i},${j})=${this.board[i][j]}`);
            }
          }
        }
        console.log('📍 AI下棋后棋盘:', pieces.join(', '));
        
        // 检查AI是否获胜
        if (this.checkWin(x, y)) {
          this.isAIThinking = false;
          
          // 记录游戏结果（AI获胜，玩家失败）
          this.recordGameResult(false);
          
          const aiColorIcon = this.aiColor === Config.PIECE.BLACK ? '⚫' : '⚪';
          const aiColorText = this.aiColor === Config.PIECE.BLACK ? '黑方' : '白方';
          setTimeout(() => {
            wx.showModal({
              title: '🎉 游戏结束',
              content: `${aiColorIcon} 电脑(${aiColorText})获胜！`,
              showCancel: true,
              cancelText: '查看棋局',
              confirmText: '再来一局',
              success: (res) => {
                if (res.confirm) {
                  this.reset();
                }
                // res.cancel 时不做任何操作，保留当前棋局
              },
            });
          }, 300);
          return;
        }
        
        // 切换回玩家
        this.currentPlayer = this.playerColor;
        const playerColorName = this.playerColor === Config.PIECE.BLACK ? '黑方' : '白方';
        console.log(`🔄 切换到${playerColorName}(玩家)`);
      } else {
        throw new Error('AI响应格式错误');
      }
    } catch (error) {
      console.error(`❌ AI移动错误 (尝试 ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
      
      // 重试
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 准备重试AI请求...`);
        wx.showToast({
          title: `电脑重新思考中 (${retryCount + 1}/${MAX_RETRIES})`,
          icon: 'loading',
          duration: 1500
        });
        this.isAIThinking = false;
        setTimeout(() => {
          this.aiMove(retryCount + 1);
        }, 1500);
        return;
      } else {
        // 重试次数用尽
        console.error(`❌ AI重试${MAX_RETRIES}次后仍然失败，放弃`);
        wx.showModal({
          title: '电脑出错',
          content: `电脑连续${MAX_RETRIES}次失败，可能是网络问题或服务器繁忙。是否重新开始游戏？`,
          confirmText: '重新开始',
          cancelText: '继续游戏',
          success: (res) => {
            if (res.confirm) {
              this.reset();
            } else {
              // 让玩家继续
              this.currentPlayer = this.playerColor;
            }
          }
        });
      }
    } finally {
      this.isAIThinking = false;
    }
  }

  checkWin(x, y) {
    const color = this.board[x][y];
    const directions = [
      [[0,1], [0,-1]],   // 横
      [[1,0], [-1,0]],   // 竖
      [[1,1], [-1,-1]],  // 主对角
      [[1,-1], [-1,1]],  // 副对角
    ];

    for (const [dir1, dir2] of directions) {
      let count = 1;
      count += this.countDirection(x, y, dir1[0], dir1[1], color);
      count += this.countDirection(x, y, dir2[0], dir2[1], color);
      if (count >= Config.WIN_COUNT) return true;
    }
    return false;
  }

  countDirection(x, y, dx, dy, color) {
    let count = 0;
    let nx = x + dx, ny = y + dy;
    while (nx >= 0 && nx < Config.BOARD_SIZE && 
           ny >= 0 && ny < Config.BOARD_SIZE && 
           this.board[nx][ny] === color) {
      count++;
      nx += dx;
      ny += dy;
    }
    return count;
  }

  start() {
    this.gameStarted = true;
    // 游戏循环由SceneManager管理，不需要自己启动
    
    // 如果AI执黑（玩家执白），游戏开始后AI先手
    if (this.config.mode === 'ai' && this.aiColor === Config.PIECE.BLACK) {
      console.log('🤖 AI执黑先手，AI开始思考...');
      setTimeout(() => {
        this.aiMove();
      }, 800); // 延迟0.8秒，让玩家看清楚棋盘
    }
  }

  destroy() {
    wx.offTouchStart(this.touchHandler);
  }

  render() {
    const { windowWidth, windowHeight, safeArea } = wx.getSystemInfoSync();
    
    this.ctx.clearRect(0, 0, windowWidth, windowHeight);
    
    // 绘制渐变背景
    const gradient = this.ctx.createLinearGradient(0, 0, 0, windowHeight);
    gradient.addColorStop(0, '#f5f7fa');
    gradient.addColorStop(1, '#c3cfe2');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, windowWidth, windowHeight);
    
    // 获取安全区域顶部高度（避开刘海）
    const safeTop = safeArea ? safeArea.top : 40;
    const titleY = safeTop + 50; // 在安全区域下方50px
    
    // 绘制标题（带阴影）
    this.ctx.save();
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowOffsetY = 3;
    this.ctx.fillStyle = '#2c3e50';
    this.ctx.font = 'bold 36px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('传统五子棋', windowWidth / 2, titleY);
    this.ctx.restore();
    
    // 绘制返回按钮
    this.drawBackButton(safeTop);
    
    // 绘制棋盘
    this.drawBoard();
    
    // 绘制棋子
    this.drawPieces();
    
    // 绘制状态栏
    this.drawStatusBar(windowWidth, windowHeight);
  }
  
  drawBackButton(safeTop) {
    const ctx = this.ctx;
    
    // 返回箭头位置和大小
    const arrowSize = 40;
    const arrowX = 20;
    const arrowY = safeTop + 15;
    
    // 保存按钮区域供点击检测（稍微扩大点击区域）
    this.backButton = {
      x: arrowX - 5,
      y: arrowY - 5,
      width: arrowSize + 10,
      height: arrowSize + 10,
    };
    
    // 绘制黑色箭头
    ctx.save();
    ctx.strokeStyle = '#2c3e50';
    ctx.fillStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // 箭头主体（向左的箭头）
    const centerX = arrowX + arrowSize / 2;
    const centerY = arrowY + arrowSize / 2;
    
    // 绘制箭头线
    ctx.beginPath();
    ctx.moveTo(centerX + 12, centerY);
    ctx.lineTo(centerX - 8, centerY);
    ctx.stroke();
    
    // 绘制箭头头部
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
  
  drawStatusBar(windowWidth, windowHeight) {
    const ctx = this.ctx;
    
    // 状态栏背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(0, windowHeight - 80, windowWidth, 80);
    
    // 分隔线
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, windowHeight - 80);
    ctx.lineTo(windowWidth, windowHeight - 80);
    ctx.stroke();
    
    // 当前回合指示器
    const y = windowHeight - 40;
    
    // 绘制当前玩家指示
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    
    if (this.currentPlayer === Config.PIECE.BLACK) {
      // 黑方回合
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(windowWidth / 2 - 50, y, 15, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = '#2c3e50';
      ctx.fillText('黑方回合', windowWidth / 2 + 20, y + 8);
    } else {
      // 白方回合
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(windowWidth / 2 - 50, y, 15, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#2c3e50';
      ctx.fillText('白方回合', windowWidth / 2 + 20, y + 8);
    }
  }

  drawBoard() {
    const ctx = this.ctx;
    const size = Config.BOARD_SIZE;
    const cellSize = this.cellSize;

    // 棋盘阴影
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
    
    // 棋盘背景（木纹效果）
    const boardGradient = ctx.createLinearGradient(
      this.offsetX, 
      this.offsetY,
      this.offsetX + cellSize * (size - 1),
      this.offsetY + cellSize * (size - 1)
    );
    boardGradient.addColorStop(0, '#DEB887');
    boardGradient.addColorStop(0.5, '#D4A76A');
    boardGradient.addColorStop(1, '#CD9B5E');
    
    ctx.fillStyle = boardGradient;
    ctx.fillRect(
      this.offsetX - 10,
      this.offsetY - 10,
      cellSize * (size - 1) + 20,
      cellSize * (size - 1) + 20
    );
    ctx.restore();

    // 网格线（抗锯齿）
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1.5;

    for (let i = 0; i < size; i++) {
      // 横线
      ctx.beginPath();
      ctx.moveTo(this.offsetX, this.offsetY + i * cellSize);
      ctx.lineTo(this.offsetX + (size - 1) * cellSize, this.offsetY + i * cellSize);
      ctx.stroke();

      // 竖线
      ctx.beginPath();
      ctx.moveTo(this.offsetX + i * cellSize, this.offsetY);
      ctx.lineTo(this.offsetX + i * cellSize, this.offsetY + (size - 1) * cellSize);
      ctx.stroke();
    }

    // 星位（更明显）
    const stars = [[3,3], [3,11], [7,7], [11,3], [11,11]];
    ctx.fillStyle = '#000000';
    stars.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(
        this.offsetX + x * cellSize,
        this.offsetY + y * cellSize,
        4, 0, 2 * Math.PI
      );
      ctx.fill();
    });
  }

  drawPieces() {
    for (let i = 0; i < Config.BOARD_SIZE; i++) {
      for (let j = 0; j < Config.BOARD_SIZE; j++) {
        if (this.board[i][j] !== Config.PIECE.EMPTY) {
          this.drawPiece(i, j, this.board[i][j]);
        }
      }
    }
  }

  drawPiece(x, y, color) {
    const ctx = this.ctx;
    const centerX = this.offsetX + x * this.cellSize;
    const centerY = this.offsetY + y * this.cellSize;
    const radius = this.cellSize * 0.4;

    ctx.save();
    
    if (color === Config.PIECE.BLACK) {
      // 黑子 - 带光泽效果
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      const blackGradient = ctx.createRadialGradient(
        centerX - radius * 0.3, centerY - radius * 0.3, 0,
        centerX, centerY, radius
      );
      blackGradient.addColorStop(0, '#555555');
      blackGradient.addColorStop(0.7, '#000000');
      blackGradient.addColorStop(1, '#000000');
      
      ctx.fillStyle = blackGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      // 白子 - 带光泽效果
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      const whiteGradient = ctx.createRadialGradient(
        centerX - radius * 0.3, centerY - radius * 0.3, 0,
        centerX, centerY, radius
      );
      whiteGradient.addColorStop(0, '#FFFFFF');
      whiteGradient.addColorStop(0.7, '#F0F0F0');
      whiteGradient.addColorStop(1, '#E0E0E0');
      
      ctx.fillStyle = whiteGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    ctx.restore();
    
    // 标记最后一步
    if (this.lastMove && this.lastMove.x === x && this.lastMove.y === y) {
      ctx.save();
      ctx.strokeStyle = color === Config.PIECE.BLACK ? '#FF0000' : '#FF0000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
    }
  }

  reset() {
    this.board = this.initBoard();
    this.currentPlayer = Config.PIECE.BLACK;
    this.lastMove = null;
    this.isAIThinking = false;
    
    // 如果是AI对战且AI执黑（玩家执白后手），让AI先下一子
    if (this.config.mode === 'ai' && this.aiColor === Config.PIECE.BLACK) {
      console.log('🤖 AI执黑，重新开始，AI先手');
      setTimeout(() => {
        this.aiMove();
      }, 500);
    }
  }

  /**
   * 记录游戏结果到后端
   */
  recordGameResult(playerWon) {
    const HttpClient = require('../api/HttpClient.js');
    const userInfo = wx.getStorageSync('userInfo');
    
    if (!userInfo || !userInfo.id) {
      console.warn('⚠️ 未登录，无法记录游戏结果');
      return;
    }

    // 计算总步数
    let totalSteps = 0;
    for (let i = 0; i < Config.BOARD_SIZE; i++) {
      for (let j = 0; j < Config.BOARD_SIZE; j++) {
        if (this.board[i][j] !== Config.PIECE.EMPTY) {
          totalSteps++;
        }
      }
    }

    const data = {
      userId: userInfo.id,
      playerWon: playerWon,
      difficulty: this.difficulty,
      playerColor: this.playerColor,
      totalSteps: totalSteps
    };

    console.log('📊 准备记录游戏结果:', data);

    HttpClient.post('/game/ai-game-result', data)
      .then(response => {
        console.log('✅ 游戏结果记录成功:', response);
      })
      .catch(error => {
        console.error('❌ 游戏结果记录失败:', error);
      });
  }
}

module.exports = GameScene;

