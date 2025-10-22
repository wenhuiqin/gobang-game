/**
 * 场景追踪器（单例模式）
 * 用于追踪和销毁所有活跃的MultiplayerGameScene
 */
class SceneTracker {
  constructor() {
    this.scenes = [];
  }

  /**
   * 注册新场景
   */
  register(scene) {
    console.log(`📊 [SceneTracker] 注册场景: ${scene.sceneId}`);
    console.log(`📊 [SceneTracker] 注册前场景数量: ${this.scenes.length}`);
    this.scenes.push(scene);
    console.log(`📊 [SceneTracker] 注册后场景数量: ${this.scenes.length}`);
  }

  /**
   * 注销场景
   */
  unregister(scene) {
    const index = this.scenes.indexOf(scene);
    if (index > -1) {
      this.scenes.splice(index, 1);
      console.log(`📊 [SceneTracker] 已注销场景: ${scene.sceneId}`);
      console.log(`📊 [SceneTracker] 剩余场景数量: ${this.scenes.length}`);
    }
  }

  /**
   * 销毁所有场景（但不调用destroy，避免循环）
   */
  destroyAll() {
    console.log(`🧹 [SceneTracker] 销毁所有场景，当前数量: ${this.scenes.length}`);
    
    if (this.scenes.length === 0) {
      console.log(`✅ [SceneTracker] 没有需要销毁的场景`);
      return;
    }
    
    // 复制数组
    const scenesToDestroy = [...this.scenes];
    
    // ⚠️ 先清空数组，避免destroy中的unregister操作
    this.scenes = [];
    
    // ⚠️ 关键：先清除所有WebSocket监听器（只清除一次，不在循环内）
    const SocketClient = require('../api/SocketClient.js');
    console.log(`  🧹 [SceneTracker] 清除所有WebSocket监听器`);
    SocketClient.off('moveMade');
    SocketClient.off('gameOver');
    SocketClient.off('error');
    SocketClient.off('boardSync');
    SocketClient.off('disconnected');
    SocketClient.off('connected');
    SocketClient.off('restartGameRequest');
    SocketClient.off('gameRestarted');
    
    // 手动清理每个场景
    scenesToDestroy.forEach((scene) => {
      if (!scene.destroyed) {
        console.log(`  🧹 [SceneTracker] 销毁场景: ${scene.sceneId}`);
        
        // 设置销毁标志
        scene.destroyed = true;
        scene.running = false;
        
        // 取消RAF
        if (scene.rafId) {
          cancelAnimationFrame(scene.rafId);
          scene.rafId = null;
        }
      }
    });
    
    console.log(`✅ [SceneTracker] 所有场景已销毁，已清除所有监听器`);
  }

  /**
   * 获取场景数量
   */
  getCount() {
    return this.scenes.length;
  }
}

// 导出单例
module.exports = new SceneTracker();

