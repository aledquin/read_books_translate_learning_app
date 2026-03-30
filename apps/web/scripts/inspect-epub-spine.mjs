import { readFileSync } from 'node:fs'
import JSZip from 'jszip'

const p = process.argv[2]
const z = await JSZip.loadAsync(readFileSync(p))
const c = await z.file('META-INF/container.xml').async('string')
const opf = c.match(/full-path="([^"]+)"/)[1]
const opfXml = await z.file(opf).async('string')
const spine = [...opfXml.matchAll(/<itemref[^>]+idref="([^"]+)"/g)].map((m) => m[1])
const man = new Map()
for (const m of opfXml.matchAll(/<item\b([^>]*)(?:\/>|>)/g)) {
  const ch = m[1]
  const id = /id="([^"]+)"/.exec(ch)?.[1]
  const href = /href="([^"]+)"/.exec(ch)?.[1]
  const prop = /properties="([^"]*)"/.exec(ch)?.[1] ?? ''
  if (id && href) man.set(id, { href, prop })
}
function resolveHref(opfPath, href) {
  const base = opfPath.replace(/\/[^/]+$/, '')
  const stack = base ? base.split('/').filter(Boolean) : []
  const clean = href.split('#')[0]?.split('?')[0] ?? ''
  for (const seg of clean.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') stack.pop()
    else stack.push(seg)
  }
  return stack.join('/')
}
let n = 0
for (const id of spine) {
  const it = man.get(id)
  if (!it) continue
  if (/\bnav\b/i.test(it.prop)) continue
  const base = it.href.split('/').pop()?.toLowerCase() ?? ''
  if (/^(index|toc|contents)\.(xhtml|html|htm|xml)$/i.test(base)) continue
  const resolved = resolveHref(opf, it.href)
  if (!/\.(xhtml|html|htm)$/i.test(resolved)) continue
  const raw = await z.file(resolved)?.async('string')
  if (!raw) continue
  n++
  if (n <= 8) console.log(resolved)
}
console.log('total xhtml spine (non-nav)', n)
