'use client';

import { useEffect, useCallback } from 'react';

const DB_NAME = 'fts-offline';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function useOfflineDraft<T>(key: string) {
  const saveDraft = useCallback(
    async (data: T) => {
      try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ key, data, savedAt: Date.now() });
        await new Promise<void>((res, rej) => {
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
        });
        db.close();
      } catch {
        // Silently fail — offline draft saving is best-effort
      }
    },
    [key],
  );

  const loadDraft = useCallback(async (): Promise<T | null> => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const result = await new Promise<{ key: string; data: T } | undefined>((res, rej) => {
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      db.close();
      return result?.data ?? null;
    } catch {
      return null;
    }
  }, [key]);

  const clearDraft = useCallback(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      db.close();
    } catch {
      // Silently fail
    }
  }, [key]);

  return { saveDraft, loadDraft, clearDraft };
}

/** Register the service worker */
export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registration failed:', err));
  }, []);
}
