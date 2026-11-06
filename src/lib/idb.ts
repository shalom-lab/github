/** IndexedDB for named secrets JSON templates (not BYOK token). */
const DB_NAME = "highutb-secrets";
const STORE = "templates";
const META_STORE = "meta";
const ACTIVE_KEY = "activeTemplateId";
const VERSION = 2;

/** `json` 存规范化后的 JSON 字符串，例如 {"A":"B"}。 */
export type SecretsTemplate = {
  id: string;
  name: string;
  json: string;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const old = event.oldVersion;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }

      // v1 → v2: migrate single { id, text } into named template
      if (old < 2 && old > 0) {
        const tx = req.transaction;
        if (tx) {
          const store = tx.objectStore(STORE);
          const getReq = store.get("default");
          getReq.onsuccess = () => {
            const row = getReq.result as
              | { id: string; text?: string; json?: string; name?: string }
              | undefined;
            if (!row) return;
            const json = row.json ?? row.text ?? "";
            if (!json.trim()) {
              store.delete("default");
              return;
            }
            const next: SecretsTemplate = {
              id: row.id === "default" ? crypto.randomUUID() : row.id,
              name: row.name?.trim() || "默认模板",
              json,
              updatedAt: Date.now(),
            };
            store.delete("default");
            store.put(next);
            tx.objectStore(META_STORE).put(next.id, ACTIVE_KEY);
          };
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
  });
}

export async function listTemplates(): Promise<SecretsTemplate[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as SecretsTemplate[]).slice();
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error("读取模板列表失败"));
    tx.oncomplete = () => db.close();
  });
}

export async function getActiveTemplateId(): Promise<string> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(ACTIVE_KEY);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? "");
    req.onerror = () => reject(req.error ?? new Error("读取活动模板失败"));
    tx.oncomplete = () => db.close();
  });
}

export async function setActiveTemplateId(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put(id, ACTIVE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("设置活动模板失败"));
  });
}

export async function saveNamedTemplate(
  name: string,
  json: string,
  id?: string,
): Promise<SecretsTemplate> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("请填写模板名称");
  const record: SecretsTemplate = {
    id: id?.trim() || crypto.randomUUID(),
    name: trimmed,
    json,
    updatedAt: Date.now(),
  };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, META_STORE], "readwrite");
    tx.objectStore(STORE).put(record);
    tx.objectStore(META_STORE).put(record.id, ACTIVE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve(record);
    };
    tx.onerror = () => reject(tx.error ?? new Error("保存模板失败"));
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, META_STORE], "readwrite");
    tx.objectStore(STORE).delete(id);
    const meta = tx.objectStore(META_STORE);
    const getReq = meta.get(ACTIVE_KEY);
    getReq.onsuccess = () => {
      if (getReq.result === id) meta.delete(ACTIVE_KEY);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("删除模板失败"));
  });
}
