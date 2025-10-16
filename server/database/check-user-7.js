#!/usr/bin/env node

const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
};

async function checkUser7() {
  let connection;

  try {
    connection = await mysql.createConnection(config);
    
    // 检查wechat_image_tools数据库
    await connection.query('USE wechat_image_tools');
    const [users] = await connection.query('SELECT * FROM users WHERE id >= 7 ORDER BY id DESC LIMIT 5');
    
    console.log('================================');
    console.log('wechat_image_tools 数据库中 ID>=7 的用户:');
    console.log('================================\n');
    
    users.forEach(user => {
      console.log(`ID: ${user.id}`);
      console.log(`昵称: ${user.nickname}`);
      console.log(`OpenID: ${user.openid}`);
      console.log(`创建时间: ${user.created_at}`);
      console.log('---');
    });
    
    console.log('');
    
    // 检查gomoku_game数据库
    await connection.query('USE gomoku_game');
    const [gomokuUsers] = await connection.query('SELECT * FROM users');
    
    console.log('================================');
    console.log('gomoku_game 数据库中的用户:');
    console.log('================================\n');
    
    if (gomokuUsers.length === 0) {
      console.log('没有数据\n');
    } else {
      gomokuUsers.forEach(user => {
        console.log(`ID: ${user.id} | ${user.nickname}`);
      });
    }

  } catch (error) {
    console.error('查询失败：', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkUser7();

