const Config = require('../utils/Config.js');

/**
 * WebSocket客户端
 */
class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.userId = null;
    this.listeners = {}; // 事件监听器
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000; // 3秒
    this.shouldReconnect = false; // 是否应该自动重连
    this.reconnectContext = null; // 保存断线前的上下文（匹配、游戏等）
  }

  /**
   * 连接WebSocket
   */
  connect(userId, autoReconnect = true) {
    if (this.connected) {
      console.log('⚠️ Socket已连接');
      return;
    }

    // 确保userId是字符串类型，保持一致性
    this.userId = String(userId);
    this.shouldReconnect = autoReconnect;
    
    console.log(`📝 设置userId: ${this.userId}(${typeof this.userId})`);
    
    // 清除之前的重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // 微信小游戏使用wx.connectSocket
    const url = `${Config.WS_BASE_URL}?userId=${this.userId}`;
    console.log(`🔌 连接WebSocket (尝试 ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts}):`, url);

    const socketTask = wx.connectSocket({
      url,
      success: () => {
        console.log('✅ Socket连接请求已发送');
      },
      fail: (err) => {
        console.error('❌ Socket连接失败:', err);
        this.handleReconnect();
      },
    });

    this.socket = socketTask;

    // 监听连接打开
    socketTask.onOpen(() => {
      console.log('✅ Socket已打开');
      this.connected = true;
      const isReconnect = this.reconnectAttempts > 0;
      this.reconnectAttempts = 0; // 重置重连计数
      
      this.emit('connected', { isReconnect });
      
      // 如果是重连，尝试恢复之前的状态
      if (isReconnect && this.reconnectContext) {
        console.log('🔄 重连成功，恢复上下文:', this.reconnectContext);
        this.restoreContext();
      }
    });

    // 监听消息
    socketTask.onMessage((res) => {
      try {
        console.log('📩 原始消息:', res.data);
        
        // 原生WebSocket - 直接解析JSON
        const message = JSON.parse(res.data);
        console.log('📩 解析消息:', message);
        
        if (message.event && message.data !== undefined) {
          this.emit(message.event, message.data);
        }
      } catch (err) {
        console.error('❌ 解析消息失败:', err, res.data);
      }
    });

    // 监听错误
    socketTask.onError((err) => {
      console.error('❌ Socket错误:', err);
      this.emit('error', err);
    });

    // 监听关闭
    socketTask.onClose((res) => {
      console.log('🔌 Socket已关闭:', res);
      this.connected = false;
      this.emit('disconnected');
      
      // 如果不是主动关闭，尝试重连
      if (this.shouldReconnect) {
        this.handleReconnect();
      }
    });
  }

  /**
   * 保存当前上下文（用于断线重连）
   */
  saveContext(type, data) {
    this.reconnectContext = { type, data, timestamp: Date.now() };
    console.log('💾 保存重连上下文:', this.reconnectContext);
  }

  /**
   * 清除上下文
   */
  clearContext() {
    this.reconnectContext = null;
  }

  /**
   * 恢复上下文
   */
  restoreContext() {
    if (!this.reconnectContext) return;

    const { type, data, timestamp } = this.reconnectContext;
    const elapsed = Date.now() - timestamp;

    // 超过5分钟的上下文认为过期
    if (elapsed > 5 * 60 * 1000) {
      console.log('⚠️ 上下文已过期，不恢复');
      this.clearContext();
      return;
    }

    console.log(`🔄 恢复上下文: ${type}`, data);

    switch (type) {
      case 'matching':
        // 重新加入匹配队列
        wx.showToast({ title: '重新匹配中...', icon: 'loading' });
        this.joinMatch(data.rating);
        break;
      
      case 'game':
        // 重新同步游戏状态
        wx.showToast({ title: '恢复游戏中...', icon: 'loading' });
        this.emit('reconnected', data);
        break;
      
      default:
        console.log('⚠️ 未知的上下文类型:', type);
    }
  }

  /**
   * 处理重连
   */
  handleReconnect() {
    if (!this.shouldReconnect) {
      console.log('⚠️ 自动重连已禁用');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ 达到最大重连次数，停止重连');
      this.clearContext();
      wx.showToast({
        title: '连接失败，请重新进入',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    this.reconnectAttempts++;
    console.log(`⏳ ${this.reconnectDelay / 1000}秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    // 显示重连提示
    wx.showToast({
      title: `重连中(${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
      icon: 'loading',
      duration: this.reconnectDelay
    });

    this.reconnectTimer = setTimeout(() => {
      if (this.userId && !this.connected) {
        console.log('🔄 尝试重连...');
        this.connect(this.userId, true);
      }
    }, this.reconnectDelay);
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.shouldReconnect = false; // 禁用自动重连
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connected = false;
    }
    
    this.reconnectAttempts = 0;
  }

  /**
   * 发送消息
   */
  send(event, data = {}) {
    if (!this.connected) {
      console.warn('⚠️ Socket未连接');
      return;
    }

    // 原生WebSocket - JSON格式
    const message = JSON.stringify({ event, data });
    console.log('📤 发送消息:', event, data);
    console.log('📤 完整消息:', message);

    this.socket.send({
      data: message,
      success: () => {
        console.log('✅ 消息发送成功');
      },
      fail: (err) => {
        console.error('❌ 消息发送失败:', err);
      },
    });
  }

  /**
   * 监听事件（防止重复添加同一个callback）
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    
    // ⚠️ 防止重复添加同一个callback（引起监听器累积bug）
    const exists = this.listeners[event].includes(callback);
    if (!exists) {
      this.listeners[event].push(callback);
      console.log(`✅ 注册监听器: ${event} (共${this.listeners[event].length}个)`);
    } else {
      console.warn(`⚠️ 监听器已存在，跳过: ${event}`);
    }
  }

  /**
   * 取消监听
   */
  off(event, callback) {
    if (!this.listeners[event]) {
      return;
    }
    
    if (callback) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    } else {
      delete this.listeners[event];
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    if (!this.listeners[event]) {
      return;
    }
    
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`❌ 事件处理错误 [${event}]:`, err);
      }
    });
  }

  /**
   * 加入匹配
   */
  joinMatch(rating) {
    console.log(`📤 加入匹配队列: userId=${this.userId}(${typeof this.userId}), rating=${rating}`);
    this.send('joinMatch', { userId: this.userId, rating });
  }

  /**
   * 取消匹配
   */
  cancelMatch() {
    this.send('cancelMatch', { userId: this.userId });
  }

  /**
   * 下棋
   */
  makeMove(roomId, x, y) {
    // 确保类型一致性
    const roomIdStr = String(roomId);
    const userIdStr = String(this.userId);
    
    console.log(`📤 发送makeMove: roomId=${roomIdStr}(${typeof roomIdStr}), userId=${userIdStr}(${typeof userIdStr}), x=${x}, y=${y}`);
    this.send('makeMove', { roomId: roomIdStr, userId: userIdStr, x, y });
  }

  /**
   * 认输
   */
  surrender(roomId) {
    const roomIdStr = String(roomId);
    const userIdStr = String(this.userId);
    console.log(`📤 发送认输: roomId=${roomIdStr}, userId=${userIdStr}`);
    this.send('surrender', { roomId: roomIdStr, userId: userIdStr });
  }
}

// 单例模式
const socketClient = new SocketClient();

module.exports = socketClient;

