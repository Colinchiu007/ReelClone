// 迁移脚本统一导出
// 类名末尾的 13 位数字为 JavaScript 时间戳，TypeORM 据此排序与校验
export { InitMain1700000000000 } from './main/0001_init_main'
export { InitBilling1700000000001 } from './billing/0001_init_billing'
export { InitTemplate1700000000002 } from './template/0001_init_template'
export { AddUgcFields1700000000003 } from './template/0002_add_ugc_fields'
export { InitBenchmark1700000000003 } from './benchmark/0001_init_benchmark'
export { AddUserRole1700000000004 } from './main/0003_add_user_role'
export { AddSystemConfig1700000000005 } from './main/0004_add_system_config'
