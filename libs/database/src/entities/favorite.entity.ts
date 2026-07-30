import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { Template } from './template.entity'

// 跨库实体仅用于类型参考，不在此文件中建立 TypeORM 关系装饰器
// import { User } from './user.entity';

/**
 * 模板收藏实体
 * 同一用户同一模板只能收藏一次（唯一约束 userId + templateId）
 */
@Entity('favorites')
@Index(['userId', 'templateId'], { unique: true })
export class Favorite {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 用户 ID（跨库 main，仅存 ID） */
  @Column({ type: 'uuid' })
  userId: string

  /** 模板 ID */
  @Column({ type: 'uuid' })
  templateId: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  // ---------------- 关联关系 ----------------

  // 跨库逻辑关联：user 跨 main 库，通过 user_id 逻辑关联（不用 TypeORM 关系装饰器）

  /** 收藏的模板（template 库内多对一） */
  @ManyToOne(() => Template, (template) => template.favorites, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: Template
}
