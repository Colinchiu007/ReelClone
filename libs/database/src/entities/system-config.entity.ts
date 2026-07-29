import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm'

/**
 * 系统配置实体
 *
 * 用于运行时存储 API Key 等可热刷新的配置项（main 库）。
 * 通过 ConfigStoreService 读写，配合 Redis 缓存 + Pub/Sub 实现热刷新。
 */
@Entity('system_config')
export class SystemConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 配置键（如 seedance_api_keys, llm_api_key, oss_access_key_id） */
  @Column({ type: 'varchar', length: 128, unique: true })
  configKey: string

  /** 配置值（API Key 以逗号分隔存储） */
  @Column({ type: 'text' })
  configValue: string

  /** 描述 */
  @Column({ type: 'varchar', length: 256, nullable: true })
  description: string | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
