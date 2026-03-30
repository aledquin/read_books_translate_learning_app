import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { BookRecord } from '../types/book'

const DB_NAME = 'progressive-reader-v1'
const DB_VERSION = 2

interface LibDB extends DBSchema {
  books: {
    key: string
    value: BookRecord
  }
  translationCache: {
    key: string
    value: { pairId: string; es: string }
  }
}

let dbPromise: Promise<IDBPDatabase<LibDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<LibDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('books')
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains('translationCache')) {
          db.createObjectStore('translationCache')
        }
      },
    })
  }
  return dbPromise
}

/** FNV-1a when Web Crypto is missing (non-secure HTTP origins except localhost). */
function translationCacheKeyFnv(payload: string): string {
  let h1 = 2166136261 >>> 0
  let h2 = 374761393 >>> 0
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 16777619) >>> 0
    h2 ^= c * ((i % 255) + 1)
    h2 = Math.imul(h2, 2654435761) >>> 0
  }
  return `fnv:${h1.toString(16)}:${h2.toString(16)}:${payload.length}`
}

/** Stable key for caching MyMemory results (same plain + pair → same key). */
export async function translationCacheKey(plain: string, pairId: string): Promise<string> {
  const norm = plain.replace(/\s+/g, ' ').trim()
  const payload = `${pairId}\0${norm}`
  try {
    const subtle = globalThis.crypto?.subtle
    if (typeof subtle?.digest === 'function') {
      const enc = new TextEncoder().encode(payload)
      const buf = await subtle.digest('SHA-256', enc)
      return (
        'sha256:' +
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      )
    }
  } catch {
    /* ignore */
  }
  return translationCacheKeyFnv(payload)
}

export async function getCachedTranslationEs(key: string): Promise<string | undefined> {
  const db = await getDb()
  const row = await db.get('translationCache', key)
  return row?.es
}

export async function setCachedTranslationEs(
  key: string,
  pairId: string,
  es: string,
): Promise<void> {
  const db = await getDb()
  await db.put('translationCache', { pairId, es }, key)
}

export async function saveBook(record: BookRecord): Promise<void> {
  const db = await getDb()
  await db.put('books', record, record.id)
}

export async function loadBook(id: string): Promise<BookRecord | undefined> {
  const db = await getDb()
  return db.get('books', id)
}

export async function listBooks(): Promise<Pick<BookRecord, 'id' | 'title' | 'addedAt'>[]> {
  const db = await getDb()
  const all = await db.getAll('books')
  return all
    .map((b) => ({ id: b.id, title: b.title, addedAt: b.addedAt }))
    .sort((a, b) => b.addedAt - a.addedAt)
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('books', id)
}
