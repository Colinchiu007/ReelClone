const fs = require('fs')
const path = require('path')
const re = /process\.env\.([A-Z0-9_]+)/g
const set = new Set()
const fmap = {}
function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue
    const f = path.join(p, e.name)
    if (e.isDirectory()) walk(f)
    else if (/\.ts$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      const t = fs.readFileSync(f, 'utf8')
      let m
      re.lastIndex = 0
      while ((m = re.exec(t)) !== null) {
        const k = m[1]
        set.add(k)
        ;(fmap[k] = fmap[k] || []).push(
          f.replace(/\\/g, '/').replace('D:/Data/projects/ReelClone/', ''),
        )
      }
    }
  }
}
;['apps', 'libs', 'scripts', 'tests'].forEach((d) => {
  const full = path.join('D:/Data/projects/ReelClone', d)
  if (fs.existsSync(full)) walk(full)
})
console.log('=== ALL unique env vars (' + set.size + ') ===')
;[...set]
  .sort()
  .forEach((k) => console.log(k + '  <-  ' + [...new Set(fmap[k])].slice(0, 3).join(', ')))
