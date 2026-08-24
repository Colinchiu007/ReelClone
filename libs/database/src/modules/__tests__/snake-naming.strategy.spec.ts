import { SnakeNamingStrategy } from '../snake-naming.strategy'

/**
 * SnakeNamingStrategy 转换逻辑测试。
 *
 * 验证驼峰 -> 下划线映射，以及各命名方法（columnName / relationName /
 * joinColumnName / joinTableName / joinTableColumnTableName / className 定制）
 * 是否与 TypeORM 生成 DDL 的期望一致。确保 entity 属性与数据库列名始终对齐，
 * 防止 camelCase/snake_case 不一致导致查询列名错误。
 */

const strategy = new SnakeNamingStrategy()

describe('SnakeNamingStrategy', () => {
  describe('columnName / snakeCase 基础', () => {
    const cases: [string, string][] = [
      ['userId', 'user_id'],
      ['createdAt', 'created_at'],
      ['openId', 'open_id'],
      ['avatarUrl', 'avatar_url'],
      ['currentPoints', 'current_points'],
      ['id', 'id'],
      ['name', 'name'],
    ]

    it.each(cases)('maps %s -> %s', (prop, expected) => {
      expect(strategy.columnName(prop, undefined, [])).toBe(expected)
    })

    it('prefers customName over derived snake case', () => {
      expect(strategy.columnName('userId', 'owner_id', [])).toBe('owner_id')
    })

    it('honors embedded prefixes', () => {
      expect(strategy.columnName('name', undefined, ['billing', 'customer'])).toBe(
        'billing_customer_name',
      )
    })
  })

  describe('relationName', () => {
    it('snake-cases relation property names', () => {
      expect(strategy.relationName('avatarGroup')).toBe('avatar_group')
      expect(strategy.relationName('userPackage')).toBe('user_package')
    })
  })

  describe('joinColumnName', () => {
    it('combines relation and referenced column', () => {
      expect(strategy.joinColumnName('user', 'id')).toBe('user_id')
      expect(strategy.joinColumnName('avatarGroup', 'id')).toBe('avatar_group_id')
    })
  })

  describe('joinTableName', () => {
    it('combines tables and property', () => {
      expect(strategy.joinTableName('users', 'roles', 'role')).toBe('users_role_roles')
    })
  })

  describe('joinTableColumnTableName', () => {
    it('combines table and property', () => {
      expect(strategy.joinTableColumnTableName('userRole', 'roleId')).toBe('user_role_role_id')
    })
  })

  describe('classNameCustomizationStrategy', () => {
    it('returns className unchanged', () => {
      expect(strategy.classNameCustomizationStrategy('User')).toBe('User')
    })
  })

  describe('embedded + concat edge cases', () => {
    it('handles empty prefix array', () => {
      expect(strategy.columnName('mobile', undefined, [])).toBe('mobile')
    })

    it('handles acronym boundary (HTTP -> http)', () => {
      // API_Key -> api_key
      expect(strategy.columnName('APIKey', undefined, [])).toBe('api_key')
    })
  })

  it('is an instance of NamingStrategyInterface-compatible class', () => {
    expect(strategy).toBeDefined()
    expect(typeof strategy.columnName).toBe('function')
    expect(typeof strategy.relationName).toBe('function')
    expect(typeof strategy.joinColumnName).toBe('function')
    expect(typeof strategy.joinTableName).toBe('function')
  })
})
