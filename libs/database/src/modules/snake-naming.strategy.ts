import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

/**
 * 将驼峰命名转换为下划线命名
 * 例如：userId -> user_id, createdAt -> created_at
 */
function snakeCase(str: string): string {
  return str
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z\d])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Snake 命名策略
 * 统一将实体属性的驼峰命名映射为数据库下划线命名
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    const name = customName ? customName : propertyName;
    return snakeCase(embeddedPrefixes.concat(name).join('_'));
  }

  relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(relationName + '_' + referencedColumnName);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return snakeCase(
      firstTableName + '_' + firstPropertyName + '_' + secondTableName,
    );
  }

  joinTableColumnTableName(tableName: string, propertyName: string): string {
    return snakeCase(tableName + '_' + propertyName);
  }

  classNameCustomizationStrategy(className: string): string {
    return className;
  }
}
