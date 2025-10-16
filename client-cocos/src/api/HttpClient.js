/**
 * HTTP请求客户端
 */

const Config = require('../utils/Config.js');

class HttpClient {
  constructor() {
    this.baseURL = Config.API_BASE_URL;
    this.token = wx.getStorageSync('token') || '';
  }

  setToken(token) {
    this.token = token;
    wx.setStorageSync('token', token);
  }

  request(url, method = 'GET', data = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const header = { 'Content-Type': 'application/json' };
      if (this.token) {
        header['Authorization'] = `Bearer ${this.token}`;
      }

      // 添加 /api 前缀
      const fullUrl = url.startsWith('/api') ? url : `/api${url}`;
      const finalUrl = `${this.baseURL}${fullUrl}`;

      console.log(`📡 发起请求: ${method} ${finalUrl}`);
      console.log(`📦 请求数据大小: ${JSON.stringify(data).length} 字节`);
      console.log(`⏱️ 超时时间: ${timeout}ms`);

      wx.request({
        url: finalUrl,
        method,
        data,
        header,
        timeout, // 设置超时时间
        success: (res) => {
          console.log(`✅ 请求成功: ${finalUrl}`, res.statusCode);
          // 统一返回完整响应，让调用方处理
          resolve(res.data);
        },
        fail: (err) => {
          console.error(`❌ 请求失败: ${finalUrl}`);
          console.error('错误详情:', err);
          console.error('错误类型:', err.errMsg);
          reject(err);
        },
      });
    });
  }

  get(url, params = {}) {
    const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
    return this.request(query ? `${url}?${query}` : url, 'GET');
  }

  post(url, data = {}, timeout = 30000) {
    return this.request(url, 'POST', data, timeout);
  }
}

module.exports = new HttpClient();

