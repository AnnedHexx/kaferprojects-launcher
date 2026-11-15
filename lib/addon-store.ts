'use client'

/**
 * Almacén local de packs de Instancia (.mcaddon / .mcpack / .mcworld).
 * Los archivos se guardan como Blob en IndexedDB porque pueden pesar varios MB
 * y no caben en localStorage.
 */

const DB_NAME = 'eko-addons'
const STORE = 'files'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este dispositivo no permite guardar packs.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacén de packs.'))
  })
}

export function createAddonFileId(): string {
  return `addon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function saveAddonBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(blob, id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el pack.'))
      tx.onabort = () => reject(tx.error || new Error('No se pudo guardar el pack.'))
    })
  } finally {
    db.close()
  }
}

export async function loadAddonBlob(id: string): Promise<Blob | null> {
  const db = await openDb()
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get(id)
      request.onsuccess = () => resolve((request.result as Blob) || null)
      request.onerror = () => reject(request.error || new Error('No se pudo leer el pack.'))
    })
  } finally {
    db.close()
  }
}

export async function deleteAddonBlob(id: string): Promise<void> {
  if (!id) return
  try {
    const db = await openDb()
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
        tx.onabort = () => resolve()
      })
    } finally {
      db.close()
    }
  } catch {}
}
