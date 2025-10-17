/**
 * 场景管理器
 */

const LoginScene = require('../scenes/LoginScene.js');
const MenuScene = require('../scenes/MenuScene.js');
const GameScene = require('../scenes/GameScene.js');
const RankScene = require('../scenes/RankScene.js');
const HttpClient = require('../api/HttpClient.js');

class SceneManager {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.currentScene = null;
    this.userInfo = null;
    this.isRunning = false;
    
    // 保存单例实例
    SceneManager.instance = this;
  }

  /**
   * 启动场景管理器
   */
  start() {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo');
    const token = wx.getStorageSync('token');
    
    if (userInfo && token) {
      this.userInfo = userInfo;
      // 恢复HttpClient的token（关键！）
      HttpClient.setToken(token);
      
      // 检查是否有待加入的房间（通过分享进入）
      const pendingRoomCode = wx.getStorageSync('pendingRoomCode');
      if (pendingRoomCode) {
        wx.removeStorageSync('pendingRoomCode'); // 清除标记
        
        // 显示加入提示
        wx.showModal({
          title: '好友邀请',
          content: `是否加入房间 ${pendingRoomCode}？`,
          confirmText: '加入',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              this.joinRoomDirectly(pendingRoomCode);
            } else {
              this.showMenu();
            }
          }
        });
      } else {
        this.showMenu();
      }
    } else {
      this.showLogin();
    }
    
    this.isRunning = true;
    this.gameLoop();
  }
  
  /**
   * 直接加入房间（通过分享链接）
   */
  async joinRoomDirectly(roomCode) {
    wx.showLoading({ title: '加入中...', mask: true });
    
    try {
      const response = await HttpClient.post('/room/join', { roomCode });
      wx.hideLoading();
      
      if (response.code === 0 && response.data) {
        const { room, yourColor, opponent } = response.data;
        
        console.log('✅ 通过分享链接加入房间:', { roomCode, yourColor, opponent });
        
        wx.showToast({
          title: '加入成功',
          icon: 'success',
          duration: 1500
        });
        
        // 进入双人对战场景
        setTimeout(() => {
          this.startMultiplayer(roomCode, yourColor, opponent);
        }, 1500);
      } else {
        wx.showToast({
          title: response.message || '加入失败',
          icon: 'none'
        });
        this.showMenu();
      }
    } catch (error) {
      wx.hideLoading();
      console.error('加入房间错误:', error);
      wx.showToast({
        title: '加入失败',
        icon: 'none'
      });
      this.showMenu();
    }
  }

  /**
   * 显示登录场景
   */
  showLogin() {
    this.destroyCurrentScene();
    
    this.currentScene = new LoginScene(
      this.canvas,
      this.ctx,
      (userInfo) => {
        this.userInfo = userInfo;
        this.showMenu();
      }
    );
  }

  /**
   * 显示主菜单
   */
  async showMenu() {
    // 刷新用户信息以获取最新战绩
    await this.refreshUserInfo();
    
    this.destroyCurrentScene();
    
    this.currentScene = new MenuScene(
      this.canvas,
      this.ctx,
      this.userInfo,
      (mode, difficulty, playerColor) => {
        if (mode === 'ai') {
          this.startGame(mode, difficulty, playerColor);
        }
      }
    );
  }

  /**
   * 刷新用户信息
   */
  async refreshUserInfo() {
    try {
      const response = await HttpClient.get('/user/profile');
      if (response.code === 0 && response.data) {
        this.userInfo = response.data;
        wx.setStorageSync('userInfo', this.userInfo);
        console.log('✅ 用户信息已刷新:', this.userInfo);
      }
    } catch (error) {
      console.error('❌ 刷新用户信息失败:', error);
      // 使用缓存的用户信息
      this.userInfo = wx.getStorageSync('userInfo') || this.userInfo;
    }
  }

  /**
   * 开始游戏
   */
  startGame(mode, difficulty, playerColor) {
    this.destroyCurrentScene();
    
    this.currentScene = new GameScene(
      this.canvas,
      this.ctx,
      {
        mode,
        difficulty,
        playerColor: playerColor || 'black', // 默认执黑
        userId: this.userInfo.id,
      }
    );
    
    this.currentScene.start();
  }

  /**
   * 销毁当前场景
   */
  destroyCurrentScene() {
    if (this.currentScene && this.currentScene.destroy) {
      this.currentScene.destroy();
    }
    this.currentScene = null;
  }

  /**
   * 游戏主循环
   */
  gameLoop() {
    if (!this.isRunning) return;
    
    if (this.currentScene && this.currentScene.render) {
      this.currentScene.render();
    }
    
    requestAnimationFrame(() => this.gameLoop());
  }

  /**
   * 停止场景管理器
   */
  stop() {
    this.isRunning = false;
    this.destroyCurrentScene();
  }
  
  /**
   * 显示排行榜
   */
  showRank() {
    this.destroyCurrentScene();
    
    this.currentScene = new RankScene(
      this.canvas,
      this.ctx,
      this.userInfo
    );
  }

  /**
   * 切换场景（静态方法）
   */
  static switchScene(sceneName) {
    if (!SceneManager.instance) {
      console.error('SceneManager 未初始化');
      return;
    }
    
    switch (sceneName) {
      case 'login':
        SceneManager.instance.showLogin();
        break;
      case 'menu':
        SceneManager.instance.showMenu();
        break;
      case 'rank':
        SceneManager.instance.showRank();
        break;
      default:
        console.error('未知场景:', sceneName);
    }
  }

  static startMultiplayerGame(roomId, myColor, opponentId) {
    if (!SceneManager.instance) {
      console.error('SceneManager 未初始化');
      return;
    }
    
    SceneManager.instance.startMultiplayer(roomId, myColor, opponentId);
  }

  startMultiplayer(roomId, myColor, opponent) {
    // 关键修复：强制关闭所有微信原生UI（modal/loading/toast）
    wx.hideLoading();
    wx.hideToast();
    // 注意：wx.showModal 没有 wx.hideModal，但可以用 wx.showLoading 来覆盖
    
    console.log('🎮 多人对战初始化:', { roomId, myColor, opponent });
    
    this.destroyCurrentScene();
    
    const MultiplayerGameScene = require('../scenes/MultiplayerGameScene.js');
    this.currentScene = new MultiplayerGameScene(
      this.canvas,
      this.ctx,
      {
        mode: 'multiplayer',
        roomId,
        myColor,
        opponentId: opponent && opponent.id ? opponent.id : null,
        opponent: opponent, // 传递完整的对手信息
        userId: this.userInfo.id,
      }
    );
  }
}

// 静态实例
SceneManager.instance = null;

module.exports = SceneManager;

