import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "tafakah-documents";
const STORE_NAME = "files";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveFile(key: string, data: string): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, data, key);
}

export async function getFile(key: string): Promise<string | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, key);
}

export async function deleteFile(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
}

export async function deleteFilesWithPrefix(prefix: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const allKeys = await store.getAllKeys();
  for (const key of allKeys) {
    if (String(key).startsWith(prefix)) {
      await store.delete(key);
    }
  }
  await tx.done;
}
