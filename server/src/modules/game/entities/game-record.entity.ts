import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { GameType, GameResult } from '@/common/constants/game.constants';
import { User } from '@/modules/user/entities/user.entity';

@Entity('game_records')
export class GameRecord {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'room_id' })
  @Index()
  roomId: string;

  @Column({ type: 'tinyint', name: 'game_type' })
  gameType: GameType;

  @Column({ type: 'bigint', unsigned: true, name: 'black_player_id', nullable: true })
  @Index()
  blackPlayerId: string;

  @Column({ type: 'bigint', unsigned: true, name: 'white_player_id', nullable: true })
  @Index()
  whitePlayerId: string;

  @Column({ type: 'bigint', unsigned: true, name: 'winner_id', nullable: true })
  winnerId: string;

  @Column({ type: 'tinyint', name: 'game_result' })
  gameResult: GameResult;

  @Column({ type: 'int', default: 0, name: 'total_steps' })
  totalSteps: number;

  @Column({ type: 'int', default: 0 })
  duration: number;

  @Column({ type: 'text', name: 'game_data', nullable: true })
  gameData: string;

  @Column({ type: 'tinyint', name: 'ai_difficulty', nullable: true })
  aiDifficulty: number;

  @Column({ type: 'datetime', name: 'started_at' })
  @Index()
  startedAt: Date;

  @Column({ type: 'datetime', name: 'ended_at' })
  endedAt: Date;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'black_player_id' })
  blackPlayer: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'white_player_id' })
  whitePlayer: User;
}

