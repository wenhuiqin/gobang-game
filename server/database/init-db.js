#!/usr/bin/env node

/**
 * 五子棋游戏数据库初始化脚本
 * 使用 Node.js + mysql2 来执行数据库初始化
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
};

async function initDatabase() {
  console.log('================================');
  console.log('五子棋游戏数据库初始化');
  console.log('================================');
  console.log(`数据库主机: ${config.host}`);
  console.log(`数据库端口: ${config.port}`);
  console.log(`数据库名称: ${process.env.DB_DATABASE}`);
  console.log('================================\n');

  let connection;

  try {
    // 连接到MySQL服务器
    console.log('正在连接到数据库...');
    connection = await mysql.createConnection(config);
    console.log('✓ 数据库连接成功\n');

    // 读取SQL文件
    console.log('正在读取 schema.sql...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    console.log('✓ SQL文件读取成功\n');

    // 执行SQL
    console.log('正在执行数据库初始化...');
    await connection.query(sql);
    console.log('✓ 数据库初始化成功\n');

    // 验证表是否创建成功
    console.log('正在验证数据库表...');
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${process.env.DB_DATABASE}'`
    );
    
    console.log('\n已创建以下表：');
    tables.forEach(table => {
      console.log(`  ✓ ${table.TABLE_NAME}`);
    });

    console.log('\n================================');
    console.log('数据库初始化完成！');
    console.log('================================\n');

  } catch (error) {
    console.error('\n✗ 数据库初始化失败：');
    console.error(error.message);
    console.error('\n请检查：');
    console.error('  1. 数据库配置是否正确（查看 .env 文件）');
    console.error('  2. 网络连接是否正常');
    console.error('  3. IP地址是否在阿里云RDS白名单中');
    console.error('  4. 用户是否有足够的权限\n');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 执行初始化
initDatabase();

