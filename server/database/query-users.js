#!/usr/bin/env node

/**
 * 查询用户数据
 */

const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};

async function queryUsers() {
  let connection;

  try {
    connection = await mysql.createConnection(config);
    
    console.log('================================');
    console.log('用户数据查询');
    console.log('================================\n');

    // 查询所有用户
    const [users] = await connection.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 10');
    
    if (users.length === 0) {
      console.log('暂无用户数据\n');
    } else {
      console.log(`共找到 ${users.length} 个用户：\n`);
      users.forEach(user => {
        console.log(`👤 ID: ${user.id}`);
        console.log(`   昵称: ${user.nickname}`);
        console.log(`   OpenID: ${user.openid}`);
        console.log(`   等级: ${user.level} | 经验: ${user.exp}`);
        console.log(`   总对局: ${user.total_games} | 胜: ${user.win_games} | 负: ${user.lose_games}`);
        console.log(`   评分: ${user.rating}`);
        console.log(`   创建时间: ${user.created_at}`);
        console.log('');
      });
    }

    console.log('================================\n');

  } catch (error) {
    console.error('查询失败：', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

queryUsers();

