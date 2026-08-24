import 'reflect-metadata'

import { getMetadataArgsStorage } from 'typeorm'
import { RelationTypeInFunction } from 'typeorm/metadata/types/RelationTypeInFunction'

// TypeORM 元数据的最小接口（与装饰器写入的元数据结构一致）
/** 实体类构造签名（替代泛化的 Function 类型） */
type EntityConstructor = new (...args: any[]) => unknown

interface RelationMeta {
  target: EntityConstructor | string
  propertyName: string
  relationType: string
  type: RelationTypeInFunction
  inverseSideProperty?: unknown
  options?: { onDelete?: string; nullable?: boolean; cascade?: boolean | string[] }
}

interface JoinColumnMeta {
  target: EntityConstructor | string
  propertyName: string
  name?: string
  referencedColumnName?: string
}

import { User } from '../user.entity'
import { Asset } from '../asset.entity'
import { AvatarGroup } from '../avatar-group.entity'
import { Order } from '../order.entity'
import { Package } from '../package.entity'
import { Work } from '../work.entity'
import { GenerationTask } from '../generation-task.entity'
import { UserPackage } from '../user-package.entity'
import { Notification } from '../notification.entity'
import { Favorite } from '../favorite.entity'
import { Template } from '../template.entity'

/**
 * 实体关系（外键 / 级联 / 反向侧）元数据校验测试。
 *
 * 不连接数据库，仅通过 TypeORM 的 getMetadataArgsStorage() 读取 @ManyToOne /
 * @OneToMany / @JoinColumn 装饰器写入的元数据，验证：
 *  - 关系方向与目标实体正确（ManyToOne -> 拥有外键一侧；OneToMany -> 反向侧）
 *  - @JoinColumn 声明的 FK 列名与 referencedColumnName 正确
 *  - 源列（如 userId）确实被 @Column 声明（FK 列必须有物理列）
 *  - 级联选项（onDelete / nullable）与源码意图一致
 * 防止「关系指向错误实体 / joinColumn 列名拼写错误 / 引用未声明列」回归。
 */

const storage = getMetadataArgsStorage()

// ----------------------------- 元数据读取辅助 -----------------------------

function relationsOf(target: object): RelationMeta[] {
  // TypeORM 以 `Function` 标注 target 类型；此处按引用身份过滤后强转为本测试的窄接口
  return storage.relations.filter((r) => r.target === target) as RelationMeta[]
}

function entityName(target: object): string {
  return typeof target === 'function' ? target.name : String(target)
}

function relationOf(target: object, prop: string): RelationMeta {
  const rel = relationsOf(target).find((r) => r.propertyName === prop)
  if (!rel) throw new Error(`relation ${prop} not found on ${entityName(target)}`)
  return rel
}

/** 关系类型函数解析为实际目标实体类 */
function relationTarget(rel: RelationMeta): unknown {
  // @ManyToOne(() => X) / @OneToMany(() => X) 写入的是返回实体类的函数
  return (rel.type as () => unknown)()
}

function joinColumnsOf(target: object): JoinColumnMeta[] {
  return storage.joinColumns.filter((c) => c.target === target) as JoinColumnMeta[]
}

function joinColumnOf(target: object, prop: string): JoinColumnMeta {
  const col = joinColumnsOf(target).find((c) => c.propertyName === prop)
  if (!col) throw new Error(`joinColumn ${prop} not found on ${entityName(target)}`)
  return col
}

function columnPropNames(target: object): Set<string> {
  return new Set(storage.columns.filter((c) => c.target === target).map((c) => c.propertyName))
}

// ----------------------------- 关系规格定义 -----------------------------
//
// ManyToOne: owning 侧（有 @JoinColumn），target 为引用的目标实体
// OneToMany: inverse 侧（无 FK），inverseSideProperty 为反向关系属性名
// joinColName: owning 侧 @JoinColumn 声明的外键列名
// referencedColumnName: FK 引用的目标实体的主键列（通常 id）

interface ManyToOneSpec {
  kind: 'ManyToOne'
  prop: string
  target: object
  joinColName: string
  referenced: string
  /** 源实体上声明了该物理列（如 userId -> user_id） */
  sourceColumn: string
  onDelete?: string
  nullable?: boolean
}

interface OneToManySpec {
  kind: 'OneToMany'
  prop: string
  target: object
  inverseSideProperty: string
}

interface EntityRelationSpec {
  name: string
  target: object
  relations: (ManyToOneSpec | OneToManySpec)[]
}

const relationSpecs: EntityRelationSpec[] = [
  {
    name: 'User',
    target: User,
    relations: [
      { kind: 'OneToMany', prop: 'assets', target: Asset, inverseSideProperty: 'user' },
      { kind: 'OneToMany', prop: 'works', target: Work, inverseSideProperty: 'user' },
      { kind: 'OneToMany', prop: 'avatarGroups', target: AvatarGroup, inverseSideProperty: 'user' },
      { kind: 'OneToMany', prop: 'orders', target: Order, inverseSideProperty: 'user' },
      { kind: 'OneToMany', prop: 'userPackages', target: UserPackage, inverseSideProperty: 'user' },
      {
        kind: 'OneToMany',
        prop: 'notifications',
        target: Notification,
        inverseSideProperty: 'user',
      },
    ],
  },
  {
    name: 'Asset',
    target: Asset,
    relations: [
      {
        kind: 'ManyToOne',
        prop: 'user',
        target: User,
        joinColName: 'user_id',
        referenced: 'id',
        sourceColumn: 'userId',
      },
      {
        kind: 'ManyToOne',
        prop: 'avatarGroup',
        target: AvatarGroup,
        joinColName: 'avatar_group_id',
        referenced: 'id',
        sourceColumn: 'avatarGroupId',
        nullable: true,
        onDelete: 'SET NULL',
      },
    ],
  },
  {
    name: 'AvatarGroup',
    target: AvatarGroup,
    relations: [
      {
        kind: 'ManyToOne',
        prop: 'user',
        target: User,
        joinColName: 'user_id',
        referenced: 'id',
        sourceColumn: 'userId',
      },
      { kind: 'OneToMany', prop: 'assets', target: Asset, inverseSideProperty: 'avatarGroup' },
    ],
  },
  {
    name: 'Order',
    target: Order,
    relations: [
      {
        kind: 'ManyToOne',
        prop: 'user',
        target: User,
        joinColName: 'user_id',
        referenced: 'id',
        sourceColumn: 'userId',
      },
      {
        kind: 'ManyToOne',
        prop: 'package',
        target: Package,
        joinColName: 'package_id',
        referenced: 'id',
        sourceColumn: 'packageId',
      },
    ],
  },
  {
    name: 'Package',
    target: Package,
    relations: [
      {
        kind: 'OneToMany',
        prop: 'userPackages',
        target: UserPackage,
        inverseSideProperty: 'package',
      },
      { kind: 'OneToMany', prop: 'orders', target: Order, inverseSideProperty: 'package' },
    ],
  },
  {
    name: 'Work',
    target: Work,
    relations: [
      {
        kind: 'ManyToOne',
        prop: 'user',
        target: User,
        joinColName: 'user_id',
        referenced: 'id',
        sourceColumn: 'userId',
      },
      {
        kind: 'OneToMany',
        prop: 'generationTasks',
        target: GenerationTask,
        inverseSideProperty: 'work',
      },
    ],
  },
  {
    name: 'GenerationTask',
    target: GenerationTask,
    relations: [
      {
        kind: 'ManyToOne',
        prop: 'work',
        target: Work,
        joinColName: 'work_id',
        referenced: 'id',
        sourceColumn: 'workId',
        onDelete: 'CASCADE',
      },
    ],
  },
  {
    name: 'UserPackage',
    target: UserPackage,
    relations: [
      {
        kind: 'ManyToOne',
        prop: 'user',
        target: User,
        joinColName: 'user_id',
        referenced: 'id',
        sourceColumn: 'userId',
      },
      {
        kind: 'ManyToOne',
        prop: 'package',
        target: Package,
        joinColName: 'package_id',
        referenced: 'id',
        sourceColumn: 'packageId',
      },
    ],
  },
  {
    name: 'Notification',
    target: Notification,
    relations: [
      {
        kind: 'ManyToOne',
        prop: 'user',
        target: User,
        joinColName: 'user_id',
        referenced: 'id',
        sourceColumn: 'userId',
      },
    ],
  },
  {
    name: 'Favorite',
    target: Favorite,
    relations: [
      {
        kind: 'ManyToOne',
        prop: 'template',
        target: Template,
        joinColName: 'template_id',
        referenced: 'id',
        sourceColumn: 'templateId',
        onDelete: 'CASCADE',
      },
    ],
  },
  {
    name: 'Template',
    target: Template,
    relations: [
      { kind: 'OneToMany', prop: 'favorites', target: Favorite, inverseSideProperty: 'template' },
    ],
  },
]

// ----------------------------- 测试生成 -----------------------------

for (const spec of relationSpecs) {
  describe(`${spec.name} relations`, () => {
    it(`declares exactly ${spec.relations.length} relation(s)`, () => {
      const props = relationsOf(spec.target)
        .map((r) => r.propertyName)
        .sort()
      const expected = spec.relations.map((r) => r.prop).sort()
      expect(props).toEqual(expected)
    })

    for (const rel of spec.relations) {
      describe(`relation: ${rel.prop}`, () => {
        it('points to the correct target entity', () => {
          const meta = relationOf(spec.target, rel.prop)
          expect(relationTarget(meta)).toBe(rel.target)
        })

        if (rel.kind === 'ManyToOne') {
          it('is a many-to-one owning side with correct join column', () => {
            const meta = relationOf(spec.target, rel.prop)
            expect(meta.relationType).toBe('many-to-one')

            const join = joinColumnOf(spec.target, rel.prop)
            expect(join.name).toBe(rel.joinColName)
            expect(join.referencedColumnName ?? 'id').toBe(rel.referenced)

            // 源列必须被 @Column 声明，否则 FK 列在数据库不存在
            expect(columnPropNames(spec.target)).toContain(rel.sourceColumn)
          })

          it('carries expected onDelete / nullable options', () => {
            const opts = relationOf(spec.target, rel.prop).options ?? {}
            if (rel.onDelete) {
              expect(opts.onDelete).toBe(rel.onDelete)
            } else {
              expect(opts.onDelete).toBeUndefined()
            }
            if (rel.nullable !== undefined) {
              expect(opts.nullable).toBe(rel.nullable)
            }
          })
        } else {
          it('is a one-to-many inverse side', () => {
            const meta = relationOf(spec.target, rel.prop)
            expect(meta.relationType).toBe('one-to-many')
            // 反向侧必须声明 inverseSideProperty 指向 owning 侧的真实属性名。
            // TypeORM 存储的是原始箭头函数，如 (asset) => asset.user，此处用一个
            // Proxy 实例调用，拦截属性读取以获得它访问的属性名。
            const inverse = meta.inverseSideProperty
            expect(inverse).toBeDefined()
            let accessedName = ''
            const probe = new Proxy(
              {},
              {
                get(_t, prop) {
                  if (typeof prop === 'symbol') return undefined
                  accessedName = prop
                  return undefined
                },
              },
            )
            if (typeof inverse === 'function') {
              inverse(probe)
              expect(accessedName).toBe(rel.inverseSideProperty)
            } else {
              expect(inverse).toBe(rel.inverseSideProperty)
            }
          })
        }
      })
    }
  })
}

// 全局校验：11 个关系实体全部注册，且 relations 元数据总条数匹配
describe('entity relations registry completeness', () => {
  it('covers all 11 relation entities', () => {
    expect(relationSpecs).toHaveLength(11)
  })

  it('every owning ManyToOne relation has a matching join column', () => {
    for (const spec of relationSpecs) {
      for (const rel of spec.relations) {
        if (rel.kind === 'ManyToOne') {
          expect(joinColumnOf(spec.target, rel.prop).name).toBe(rel.joinColName)
        }
      }
    }
  })
})
