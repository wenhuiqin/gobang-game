-- 五子棋游戏数据库结构
-- MySQL 8.0+

-- 创建数据库
CREATE DATABASE IF NOT EXISTS gomoku_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gomoku_game;

-- 用户表
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
  `openid` VARCHAR(128) NOT NULL UNIQUE COMMENT '微信openid',
  `unionid` VARCHAR(128) DEFAULT NULL COMMENT '微信unionid',
  `nickname` VARCHAR(100) NOT NULL COMMENT '昵称',
  `avatar_url` VARCHAR(500) DEFAULT NULL COMMENT '头像URL',
  `level` INT DEFAULT 1 COMMENT '等级',
  `exp` INT DEFAULT 0 COMMENT '经验值',
  `total_games` INT DEFAULT 0 COMMENT '总对局数',
  `win_games` INT DEFAULT 0 COMMENT '胜利局数',
  `lose_games` INT DEFAULT 0 COMMENT '失败局数',
  `draw_games` INT DEFAULT 0 COMMENT '平局数',
  `win_streak` INT DEFAULT 0 COMMENT '当前连胜',
  `max_win_streak` INT DEFAULT 0 COMMENT '最高连胜',
  `rating` INT DEFAULT 1000 COMMENT 'ELO评分',
  `last_login_at` DATETIME DEFAULT NULL COMMENT '最后登录时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX `idx_openid` (`openid`),
  INDEX `idx_rating` (`rating` DESC),
  INDEX `idx_win_games` (`win_games` DESC),
  INDEX `idx_max_win_streak` (`max_win_streak` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 对战记录表
DROP TABLE IF EXISTS `game_records`;
CREATE TABLE `game_records` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '记录ID',
  `room_id` VARCHAR(64) NOT NULL COMMENT '房间ID',
  `game_type` TINYINT NOT NULL COMMENT '游戏类型 1随机匹配 2人机 3好友',
  `black_player_id` BIGINT UNSIGNED COMMENT '黑方玩家ID',
  `white_player_id` BIGINT UNSIGNED COMMENT '白方玩家ID',
  `winner_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '胜者ID, NULL表示平局',
  `game_result` TINYINT NOT NULL COMMENT '结果 1黑胜 2白胜 3平局 4黑方超时 5白方超时',
  `total_steps` INT DEFAULT 0 COMMENT '总步数',
  `duration` INT DEFAULT 0 COMMENT '对局时长(秒)',
  `game_data` TEXT COMMENT '棋谱数据(JSON)',
  `ai_difficulty` TINYINT DEFAULT NULL COMMENT 'AI难度 1简单 2中等 3困难',
  `started_at` DATETIME NOT NULL COMMENT '开始时间',
  `ended_at` DATETIME NOT NULL COMMENT '结束时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX `idx_black_player` (`black_player_id`),
  INDEX `idx_white_player` (`white_player_id`),
  INDEX `idx_room_id` (`room_id`),
  INDEX `idx_started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对战记录表';

-- 房间表
DROP TABLE IF EXISTS `rooms`;
CREATE TABLE `rooms` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '房间ID',
  `room_code` VARCHAR(32) NOT NULL UNIQUE COMMENT '房间号',
  `creator_id` BIGINT UNSIGNED NOT NULL COMMENT '创建者ID',
  `creator_nickname` VARCHAR(100) NOT NULL COMMENT '创建者昵称',
  `joiner_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '加入者ID',
  `joiner_nickname` VARCHAR(100) DEFAULT NULL COMMENT '加入者昵称',
  `status` VARCHAR(20) DEFAULT 'waiting' COMMENT '状态 waiting/playing/finished',
  `winner_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '获胜者ID',
  `started_at` DATETIME DEFAULT NULL COMMENT '开始时间',
  `finished_at` DATETIME DEFAULT NULL COMMENT '结束时间',
  `room_type` TINYINT DEFAULT 0 COMMENT '房间类型 0好友 1随机',
  `password` VARCHAR(64) DEFAULT NULL COMMENT '房间密码',
  `max_players` TINYINT DEFAULT 2 COMMENT '最大玩家数',
  `current_players` TINYINT DEFAULT 1 COMMENT '当前玩家数',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX `idx_room_code` (`room_code`),
  INDEX `idx_status` (`status`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='房间表';

-- 排行榜表
DROP TABLE IF EXISTS `leaderboards`;
CREATE TABLE `leaderboards` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT 'ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `rank_type` VARCHAR(20) NOT NULL COMMENT '榜单类型 win/winrate/streak',
  `period` VARCHAR(20) NOT NULL COMMENT '周期 daily/weekly/monthly/all',
  `rank` INT NOT NULL COMMENT '排名',
  `score` DECIMAL(10,2) NOT NULL COMMENT '分数',
  `period_date` DATE NOT NULL COMMENT '周期日期',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY `idx_unique_rank` (`rank_type`, `period`, `period_date`, `user_id`),
  INDEX `idx_rank` (`rank_type`, `period`, `period_date`, `rank`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排行榜表';

