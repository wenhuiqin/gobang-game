import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { GAME_CONFIG } from '@/common/constants/game.constants';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  @Index()
  openid: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  unionid: string;

  @Column({ type: 'varchar', length: 100 })
  nickname: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'avatar_url' })
  avatarUrl: string;

  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ type: 'int', default: 0 })
  exp: number;

  @Column({ type: 'int', default: 0, name: 'total_games' })
  totalGames: number;

  @Column({ type: 'int', default: 0, name: 'win_games' })
  winGames: number;

  @Column({ type: 'int', default: 0, name: 'lose_games' })
  loseGames: number;

  @Column({ type: 'int', default: 0, name: 'draw_games' })
  drawGames: number;

  @Column({ type: 'int', default: 0, name: 'win_streak' })
  winStreak: number;

  @Column({ type: 'int', default: 0, name: 'max_win_streak' })
  maxWinStreak: number;

  @Column({ type: 'int', default: GAME_CONFIG.RATING_DEFAULT })
  @Index()
  rating: number;

  @Column({ type: 'datetime', nullable: true, name: 'last_login_at' })
  lastLoginAt: Date;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt: Date;
}

