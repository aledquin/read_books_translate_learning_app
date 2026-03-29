import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { BookRecord } from '../types/book'

interface LibDB extends DBSchema {
  books: {
    key: string
    value: BookRecord
  }
}

let dbPromise: Promise<IDBPDatabase<LibDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<LibDB>('progressive-reader-v1', 1, {
      upgrade(db) {
        db.createObjectStore('books')
      },
    })
  }
  return dbPromise
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
