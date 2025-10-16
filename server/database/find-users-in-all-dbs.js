#!/usr/bin/env node

/**
 * 在所有数据库中查找users表
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

async function findUsersInAllDbs() {
  let connection;

  try {
    connection = await mysql.createConnection(config);
    
    console.log('================================');
    console.log('在所有数据库中查找用户数据');
    console.log('================================\n');

    // 查询所有数据库
    const [databases] = await connection.query('SHOW DATABASES');
    
    for (const db of databases) {
      const dbName = Object.values(db)[0];
      
      // 跳过系统数据库
      if (['information_schema', 'mysql', 'performance_schema', 'sys', '__recycle_bin__'].includes(dbName)) {
        continue;
      }
      
      try {
        await connection.query(`USE ${dbName}`);
        
        // 检查是否有users表
        const [tables] = await connection.query("SHOW TABLES LIKE 'users'");
        
        if (tables.length > 0) {
          const [users] = await connection.query('SELECT * FROM users LIMIT 10');
          console.log(`📂 数据库: ${dbName}`);
          console.log(`   表: users`);
          console.log(`   记录数: ${users.length}`);
          
          if (users.length > 0) {
            console.log('   数据：');
            users.forEach(user => {
              console.log(`     - ID: ${user.id} | ${user.nickname} | ${user.openid}`);
            });
          }
          console.log('');
        }
      } catch (err) {
        // 忽略错误
      }
    }

    console.log('================================\n');

  } catch (error) {
    console.error('查找失败：', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

findUsersInAllDbs();

