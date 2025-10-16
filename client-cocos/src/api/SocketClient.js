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
  }

  /**
   * 连接WebSocket
   */
  connect(userId) {
    if (this.connected) {
      console.log('⚠️ Socket已连接');
      return;
    }

    this.userId = userId;
    
    // 微信小游戏使用wx.connectSocket
    // Socket.io客户端需要特殊处理，这里简化为直接WebSocket
    const url = `${Config.WS_BASE_URL}?userId=${userId}`;
    console.log('🔌 连接WebSocket:', url);

    const socketTask = wx.connectSocket({
      url,
      success: () => {
        console.log('✅ Socket连接请求已发送');
      },
      fail: (err) => {
        console.error('❌ Socket连接失败:', err);
      },
    });

    this.socket = socketTask;

    // 监听连接打开
    socketTask.onOpen(() => {
      console.log('✅ Socket已打开');
      this.connected = true;
      this.emit('connected');
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
    socketTask.onClose(() => {
      console.log('🔌 Socket已关闭');
      this.connected = false;
      this.emit('disconnected');
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connected = false;
    }
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
   * 监听事件
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
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
    this.send('makeMove', { roomId, userId: this.userId, x, y });
  }

  /**
   * 认输
   */
  surrender(roomId) {
    this.send('surrender', { roomId, userId: this.userId });
  }
}

// 单例模式
const socketClient = new SocketClient();

module.exports = socketClient;

