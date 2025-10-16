import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RoomStatus } from '@/common/constants/game.constants';

@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true, name: 'room_code' })
  @Index()
  roomCode: string;

  @Column({ type: 'bigint', unsigned: true, name: 'creator_id' })
  creatorId: string;

  @Column({ type: 'varchar', length: 100, name: 'creator_nickname' })
  creatorNickname: string;

  @Column({ type: 'bigint', unsigned: true, nullable: true, name: 'joiner_id' })
  joinerId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'joiner_nickname' })
  joinerNickname: string | null;

  @Column({ type: 'varchar', length: 20, default: 'waiting' })
  @Index()
  status: string; // 'waiting' | 'playing' | 'finished'

  @Column({ type: 'bigint', unsigned: true, nullable: true, name: 'winner_id' })
  winnerId: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'started_at' })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'finished_at' })
  finishedAt: Date | null;

  @Column({ type: 'tinyint', name: 'room_type', default: 0 })
  roomType: number; // 0: friend, 1: random

  @Column({ type: 'varchar', length: 64, nullable: true })
  password: string | null;

  @Column({ type: 'tinyint', default: 2, name: 'max_players' })
  maxPlayers: number;

  @Column({ type: 'tinyint', default: 1, name: 'current_players' })
  currentPlayers: number;

  @Column({ type: 'datetime', name: 'expires_at' })
  @Index()
  expiresAt: Date;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt: Date;
}

