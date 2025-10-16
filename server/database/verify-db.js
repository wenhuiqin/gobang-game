#!/usr/bin/env node

/**
 * 数据库验证脚本 - 检查数据库表和结构
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

async function verifyDatabase() {
  console.log('================================');
  console.log('数据库验证');
  console.log('================================\n');

  let connection;

  try {
    connection = await mysql.createConnection(config);
    
    // 检查所有表
    const [tables] = await connection.query('SHOW TABLES');
    console.log('📊 数据库表列表：');
    tables.forEach(table => {
      console.log(`  ✓ ${Object.values(table)[0]}`);
    });
    console.log('');

    // 检查 users 表结构
    const [usersColumns] = await connection.query('DESCRIBE users');
    console.log('👥 users 表结构：');
    usersColumns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    console.log('');

    // 检查 game_records 表结构
    const [gameColumns] = await connection.query('DESCRIBE game_records');
    console.log('🎮 game_records 表结构：');
    gameColumns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    console.log('');

    // 检查 rooms 表结构
    const [roomColumns] = await connection.query('DESCRIBE rooms');
    console.log('🏠 rooms 表结构：');
    roomColumns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    console.log('');

    // 检查 leaderboards 表结构
    const [leaderboardColumns] = await connection.query('DESCRIBE leaderboards');
    console.log('🏆 leaderboards 表结构：');
    leaderboardColumns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    console.log('');

    console.log('================================');
    console.log('✓ 数据库验证通过！');
    console.log('================================\n');

  } catch (error) {
    console.error('✗ 验证失败：', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

verifyDatabase();

