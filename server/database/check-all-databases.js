#!/usr/bin/env node

/**
 * 检查所有数据库和用户表
 */

const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
};

async function checkAllDatabases() {
  let connection;

  try {
    connection = await mysql.createConnection(config);
    
    console.log('================================');
    console.log('数据库检查');
    console.log('================================\n');

    // 查询所有数据库
    const [databases] = await connection.query('SHOW DATABASES');
    console.log('📂 所有数据库：');
    databases.forEach(db => {
      console.log(`  - ${Object.values(db)[0]}`);
    });
    console.log('');

    // 检查指定数据库
    console.log(`🔍 检查数据库: ${process.env.DB_DATABASE}\n`);
    
    await connection.query(`USE ${process.env.DB_DATABASE}`);
    
    // 查询所有表
    const [tables] = await connection.query('SHOW TABLES');
    console.log('📊 数据库中的表：');
    tables.forEach(table => {
      console.log(`  ✓ ${Object.values(table)[0]}`);
    });
    console.log('');

    // 查询users表
    const [users] = await connection.query('SELECT * FROM users');
    console.log(`👥 users 表数据: ${users.length} 条记录\n`);
    
    if (users.length > 0) {
      users.forEach(user => {
        console.log(`  ID: ${user.id} | ${user.nickname} | ${user.openid}`);
      });
    }
    console.log('');

    // 查询game_records表
    const [records] = await connection.query('SELECT COUNT(*) as count FROM game_records');
    console.log(`🎮 game_records 表: ${records[0].count} 条记录`);

    // 查询rooms表
    const [rooms] = await connection.query('SELECT COUNT(*) as count FROM rooms');
    console.log(`🏠 rooms 表: ${rooms[0].count} 条记录`);

    // 查询leaderboards表
    const [leaderboards] = await connection.query('SELECT COUNT(*) as count FROM leaderboards');
    console.log(`🏆 leaderboards 表: ${leaderboards[0].count} 条记录`);

    console.log('\n================================\n');

  } catch (error) {
    console.error('检查失败：', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkAllDatabases();

