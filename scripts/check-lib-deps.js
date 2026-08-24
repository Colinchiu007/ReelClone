#!/usr/bin/env node
/**
 * 诊断 @reelclone/* 依赖声明缺口。
 *
 * NX 依赖图只读 package.json，若某 lib 被 import 但未在 package.json
 * 的 dependencies/peerDependencies 声明，NX 就缺边，干净环境下并行编译
 * 服务时会报 TS2307（lib 尚未先构建）。本地因 dist 已存在 + 缓存会掩盖。
 *
 * 用法: node scripts/check-lib-deps.js [serviceName...]
 *   不带参数扫描全部 apps/* 和 libs/*
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const RE = /(from|\bimport\s*\()\s*['"]@reelclone\/([a-z-]+)['"]/g
const targets = process.argv.slice(2)

/**
 * 剥离 TS 注释（行注释 + 块注释），避免注释中的 import 造成误报。
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
    .replace(/\/\/[^\n]*/g, '') // 行注释
}

/**
 * 返回 { runtime: Set, test: Set }，runtime = 非 spec 源码 import，
 * test = 仅 spec 文件 import。
 */
function scanDir(dir) {
  const files = []
  const selfName = path.basename(dir)
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const full = path.join(p, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(full)
    }
  }
  walk(dir)
  const runtime = new Set()
  const test = new Set()
  for (const f of files) {
    const text = stripComments(fs.readFileSync(f, 'utf8'))
    let m
    RE.lastIndex = 0
    while ((m = RE.exec(text)) !== null) {
      const lib = m[2]
      if (lib === selfName) continue // 自身
      if (f.endsWith('.spec.ts') || /\.spec\.tsx?$|__tests__/.test(f)) test.add(lib)
      else runtime.add(lib)
    }
  }
  return { runtime, test }
}

const units = []
if (targets.length) {
  for (const t of targets) {
    const unitDir = path.join(root, 'apps', t)
    const libDir = path.join(root, 'libs', t)
    const isApp = fs.existsSync(unitDir)
    const isLib = fs.existsSync(libDir)
    if (isApp) units.push({ name: t, dir: unitDir, kind: 'app' })
    else if (isLib) units.push({ name: t, dir: libDir, kind: 'lib' })
    else {
      console.error(`unknown unit: ${t}`)
      process.exit(1)
    }
  }
} else {
  for (const kind of ['apps', 'libs']) {
    const base = path.join(root, kind)
    for (const name of fs.readdirSync(base)) {
      const dir = path.join(base, name)
      if (!fs.statSync(dir).isDirectory()) continue
      if (fs.existsSync(path.join(dir, 'package.json'))) units.push({ name, dir, kind })
    }
  }
}

let problems = 0
for (const { name, dir, kind } of units) {
  const { runtime, test } = scanDir(dir)
  const pkgPath = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  // package.json 中是完整名（@reelclone/common），import 中是短名（common），统一为短名比较
  const declared = new Set(
    [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})].map((k) =>
      k.replace(/^@reelclone\//, ''),
    ),
  )
  const missingRuntime = [...runtime].filter((l) => !declared.has(l))
  const missingTest = [...test].filter((l) => !declared.has(l))
  if (missingRuntime.length || missingTest.length) {
    problems++
    console.log(
      `[MISSING] ${kind}:${name}` +
        (missingRuntime.length ? `\n  runtime -> ${missingRuntime.join(', ')}` : '') +
        (missingTest.length ? `\n  test    -> ${missingTest.join(', ')}` : ''),
    )
  }
}

console.log(problems ? `\n共 ${problems} 个单位存在依赖声明缺口` : '\n全部单位依赖声明完整 ✅')
