export type DraftStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown>; removeItem: (key: string) => Promise<unknown> };

export function draftKey(server: string, userId: string, organizationId: string | null | undefined, contactId: number) {
  return `cotrimbot:draft:v1:${encodeURIComponent(JSON.stringify([server, userId, organizationId ?? '', contactId]))}`;
}

export function createDraftStore(storage: DraftStorage) {
  const writes = new Map<string, Promise<unknown>>();
  return {
    async read(key: string) { await writes.get(key)?.catch(() => {}); return await storage.getItem(key) ?? ''; },
    write(key: string, text: string) {
      const task = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => text === '' ? storage.removeItem(key) : storage.setItem(key, text));
      writes.set(key, task);
      const clean = () => { if (writes.get(key) === task) writes.delete(key); };
      void task.then(clean, clean);
      return task;
    },
  };
}
