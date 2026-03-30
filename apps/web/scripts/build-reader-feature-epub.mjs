/**
 * Builds fixture EPUBs under fixtures/epub/ (same block order for EN + ES companion import):
 *   - reader-feature-sample.epub (English)
 *   - reader-feature-sample.es.epub (Spanish — bundled translation, no API)
 *   - reader-feature-sample.blocks.json (paired blocks for Vitest — no epubjs in CI)
 * Run from apps/web: npm run epub:feature-sample
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseHTML } from 'linkedom'
import JSZip from 'jszip'

const __dirname = dirname(fileURLToPath(import.meta.url))
/** scripts/ → apps/web/ → apps/ → repository root */
const repoRoot = join(__dirname, '..', '..', '..')
const fixturesEpub = join(repoRoot, 'fixtures', 'epub')
const outPathEn = join(fixturesEpub, 'reader-feature-sample.epub')
const outPathEs = join(fixturesEpub, 'reader-feature-sample.es.epub')
const outPathBlocksJson = join(fixturesEpub, 'reader-feature-sample.blocks.json')

const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

const packageOpfEn = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0" prefix="cc: http://creativecommons.org/ns#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Reader Feature Sample</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">reader-feature-sample-1</dc:identifier>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>
`

const packageOpfEs = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0" prefix="cc: http://creativecommons.org/ns#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Muestra de funciones del lector</dc:title>
    <dc:language>es</dc:language>
    <dc:identifier id="bookid">reader-feature-sample-es-1</dc:identifier>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>
`

const navXhtmlEn = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
      <li><a href="ch1.xhtml">Chapter One</a></li>
      <li><a href="ch2.xhtml">Chapter Two</a></li>
    </ol>
  </nav>
</body>
</html>
`

const navXhtmlEs = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es">
<head><title>Navegación</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contenido</h1>
    <ol>
      <li><a href="ch1.xhtml">Capítulo uno</a></li>
      <li><a href="ch2.xhtml">Capítulo dos</a></li>
    </ol>
  </nav>
</body>
</html>
`

/** Same element order as Spanish ch1 — required for companion pairing. */
const ch1XhtmlEn = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <title>Chapter One</title>
  <meta charset="utf-8"/>
</head>
<body>
  <p>Time and day meet in this line. Night turns into morning before we walk again.</p>
  <p>I walk to the house and see the door. The window shows a little light inside the room.</p>
  <p>I think I know this place. My heart remembers the story I read in an old book.</p>
  <p>Every word mattered to the child and the friend who shared the world of that tale.</p>
  <p>Life is short; love and hope can fill it. The sun, the moon, and one bright star marked the sky.</p>
  <p>We hear the wind and feel the sea. A ship once waited where the road meets the forest.</p>
  <h2>Questions of hope</h2>
  <p>One simple question can change a year. In a quiet moment I asked for peace instead of fear.</p>
  <p>I dream at night and wake by day. My voice was small, but the song still carried truth.</p>
  <blockquote>Love and life go together. Truth is better than any lie, good or bad.</blockquote>
  <ul>
    <li>People work, play, and learn when they have time.</li>
    <li>Teachers teach answers, yet the great question remains.</li>
  </ul>
</body>
</html>
`

const ch1XhtmlEs = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es">
<head>
  <title>Capítulo uno</title>
  <meta charset="utf-8"/>
</head>
<body>
  <p>El tiempo y el día se encuentran en esta línea. La noche se vuelve mañana antes de volver a caminar.</p>
  <p>Camino hasta la casa y veo la puerta. La ventana muestra una pequeña luz dentro de la habitación.</p>
  <p>Creo que conozco este lugar. Mi corazón recuerda la historia que leí en un libro viejo.</p>
  <p>Cada palabra importaba al niño y al amigo que compartieron el mundo de ese relato.</p>
  <p>La vida es breve; el amor y la esperanza pueden llenarla. El sol, la luna y una estrella brillante marcaron el cielo.</p>
  <p>Oímos el viento y sentimos el mar. Una vez un barco esperaba donde el camino se encuentra con el bosque.</p>
  <h2>Preguntas de esperanza</h2>
  <p>Una pregunta sencilla puede cambiar un año. En un momento tranquilo pedí paz en lugar de miedo.</p>
  <p>Sueño de noche y despierto de día. Mi voz era pequeña, pero la canción aún llevaba verdad.</p>
  <blockquote>El amor y la vida van juntos. La verdad es mejor que cualquier mentira, buena o mala.</blockquote>
  <ul>
    <li>La gente trabaja, juega y aprende cuando tiene tiempo.</li>
    <li>Los maestros enseñan respuestas, pero la gran pregunta sigue ahí.</li>
  </ul>
</body>
</html>
`

const ch2XhtmlEn = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <title>Chapter Two</title>
  <meta charset="utf-8"/>
</head>
<body>
  <h2>The city and the road</h2>
  <p>Water and fire shaped the old city. A man and a woman walked the road toward home.</p>
  <p>The horse and the dog rested near a tree. A bird watched from a stone by the table.</p>
  <p>Bread and wine sat on the chair. Gold and stone tell different stories under the eye of the king.</p>
  <p>The queen spoke of war and peace. Young and old people listened in that public place.</p>
  <p>Sleep came after a long day of work. I did not want death; I wanted another morning.</p>
  <p>The forest path was dark, but the city light returned. Name this year as you wish.</p>
  <p>This short sample ends here. Use tap translation, replace mode, or word blend to test the reader.</p>
</body>
</html>
`

const ch2XhtmlEs = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es">
<head>
  <title>Capítulo dos</title>
  <meta charset="utf-8"/>
</head>
<body>
  <h2>La ciudad y el camino</h2>
  <p>El agua y el fuego moldearon la ciudad antigua. Un hombre y una mujer caminaron por el camino hacia casa.</p>
  <p>El caballo y el perro descansaron cerca de un árbol. Un pájaro miraba desde una piedra junto a la mesa.</p>
  <p>El pan y el vino estaban en la silla. El oro y la piedra cuentan historias distintas bajo la mirada del rey.</p>
  <p>La reina habló de guerra y paz. Jóvenes y mayores escucharon en aquel lugar público.</p>
  <p>El sueño llegó tras un largo día de trabajo. No quería la muerte; quería otra mañana.</p>
  <p>El sendero del bosque estaba oscuro, pero la luz de la ciudad regresó. Nombra este año como quieras.</p>
  <p>Esta breve muestra termina aquí. Usa la traducción al toque, el modo de reemplazo o la mezcla de palabras para probar el lector.</p>
</body>
</html>
`

/**
 * Mirrors `extractEpub` block order (p, h1–h4, blockquote, li) for tests.
 */
function blocksFromXhtmlString(xhtml, chapterIndex, chapterTitle, globalCounter) {
  const { document } = parseHTML(xhtml)
  const body = document.body
  if (!body) return
  const candidates = body.querySelectorAll('p, h1, h2, h3, h4, blockquote, li')
  candidates.forEach((el, j) => {
    const plain = el.textContent.replace(/\s+/g, ' ').trim()
    if (!plain) return
    globalCounter.blocks.push({
      chapterIndex,
      chapterTitle,
      blockIndex: j,
      globalIndex: globalCounter.i++,
      html: el.outerHTML,
      plain,
    })
  })
}

function buildCompanionBlocksJson() {
  const globalCounter = { i: 0, blocks: [] }
  blocksFromXhtmlString(ch1XhtmlEn, 0, 'Section 1', globalCounter)
  blocksFromXhtmlString(ch2XhtmlEn, 1, 'Section 2', globalCounter)
  const enBlocks = globalCounter.blocks

  const esCounter = { i: 0, blocks: [] }
  blocksFromXhtmlString(ch1XhtmlEs, 0, 'Section 1', esCounter)
  blocksFromXhtmlString(ch2XhtmlEs, 1, 'Section 2', esCounter)
  const esBlocks = esCounter.blocks

  const n = Math.min(enBlocks.length, esBlocks.length)
  const blocks = enBlocks.map((b, i) => {
    if (i >= n) return b
    const pe = esBlocks[i].plain
    return pe ? { ...b, plainEs: pe } : b
  })

  return {
    title: 'Reader Feature Sample',
    blocks,
    meta: {
      enBlocks: enBlocks.length,
      esBlocks: esBlocks.length,
      paired: n,
      note: 'Regenerate with npm run epub:feature-sample (apps/web).',
    },
  }
}

async function writeEpub(outPath, packageOpf, navXhtml, ch1Xhtml, ch2Xhtml) {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', containerXml)
  zip.file('OEBPS/package.opf', packageOpf)
  zip.file('OEBPS/nav.xhtml', navXhtml)
  zip.file('OEBPS/ch1.xhtml', ch1Xhtml)
  zip.file('OEBPS/ch2.xhtml', ch2Xhtml)

  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, buf)
  console.log('Wrote', outPath, `(${buf.length} bytes)`)
}

await writeEpub(outPathEn, packageOpfEn, navXhtmlEn, ch1XhtmlEn, ch2XhtmlEn)
await writeEpub(outPathEs, packageOpfEs, navXhtmlEs, ch1XhtmlEs, ch2XhtmlEs)

const blocksPayload = buildCompanionBlocksJson()
writeFileSync(outPathBlocksJson, `${JSON.stringify(blocksPayload, null, 2)}\n`, 'utf8')
console.log('Wrote', outPathBlocksJson)
