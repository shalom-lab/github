/** IndexedDB for secrets template JSON (not BYOK token). */
const DB_NAME = "highutb-secrets";
const STORE = "templates";
const RECORD_ID = "default";
const VERSION = 1;

/** `text` 存规范化后的 JSON 字符串，例如 {"A":"B"}。 */
export type SecretsTemplate = {
  id: string;
  text: string;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
  });
}

export async function loadTemplate(): Promise<string> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(RECORD_ID);
    req.onsuccess = () => {
      const row = req.result as SecretsTemplate | undefined;
      resolve(row?.text ?? "");
    };
    req.onerror = () => reject(req.error ?? new Error("读取模板失败"));
    tx.oncomplete = () => db.close();
  });
}

export async function saveTemplate(text: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const record: SecretsTemplate = {
      id: RECORD_ID,
      text,
      updatedAt: Date.now(),
    };
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("保存模板失败"));
  });
}

export async function clearTemplate(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(RECORD_ID);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("清除模板失败"));
  });
}
