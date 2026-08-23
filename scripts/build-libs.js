#!/usr/bin/env node
/**
 * 预编译所有共享库为扁平 dist 产物。
 *
 * 服务 tsconfig.build.json 使用 paths 空映射，运行时通过 node_modules 解析
 * 到各 lib 的 dist 产物。因此必须先按依赖拓扑编译 libs，再编译各服务。
 *
 * 4 层拓扑（依据各 lib src 中的 @reelclone 导入推导）：
 *   L1: common / database / swagger / oss / capability（无 @reelclone 依赖）
 *   L2: observability / http-client / adapters-sms / adapters-wechat / ai（依赖 common）
 *   L3: platform-data（依赖 common + database + observability）
 *   L4: temporal（依赖 ai + oss + common + database）
 */
const { execSync } = require('child_process')
const path = require('path')

const ORDER = [
  ['common', 'database', 'swagger', 'oss', 'capability'],
  ['observability', 'http-client', 'adapters-sms', 'adapters-wechat', 'ai'],
  ['platform-data'],
  ['temporal'],
]

const root = path.resolve(__dirname, '..')
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')

let failed = false
for (const layer of ORDER) {
  for (const lib of layer) {
    const config = path.join(root, 'libs', lib, 'tsconfig.build.json')
    process.stdout.write(`\n=== building lib: ${lib} ===\n`)
    try {
      execSync(`node "${tsc}" -p "${config}"`, { cwd: root, stdio: 'inherit' })
    } catch (e) {
      failed = true
      process.stderr.write(`\n[build-libs] FAILED: ${lib}\n`)
      break
    }
  }
  if (failed) break
}

if (failed) {
  process.stderr.write('\n[build-libs] 共享库预编译失败\n')
  process.exit(1)
}
process.stdout.write('\n[build-libs] 全部共享库预编译成功\n')
