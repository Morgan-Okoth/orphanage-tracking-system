import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * useOfflineDraft wraps IndexedDB which is hard to mock fully in jsdom.
 * These tests verify the hook's error-resilience: it should never throw
 * even when IDB is unavailable or returns unexpected results.
 */

// We test the underlying openDB + operations by importing the hook
// and calling its returned functions directly (no renderHook needed
// since the hook has no state — it only returns stable callbacks).
import { useOfflineDraft } from '../../lib/hooks/useOfflineDraft';

// Minimal IDB mock that resolves immediately
function makeIDBMock(storeData: Record<string, unknown> = {}) {
  const objectStore = {
    put: vi.fn((record: { key: string; data: unknown }) => {
      storeData[record.key] = record.data;
      const req = { onsuccess: null as (() => void) | null };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    }),
    get: vi.fn((key: string) => {
      const result = storeData[key] !== undefined ? { key, data: storeData[key] } : undefined;
      const req = { result, onsuccess: null as (() => void) | null };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    }),
    delete: vi.fn((key: string) => {
      delete storeData[key];
      const req = { onsuccess: null as (() => void) | null };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    }),
  };

  const tx = {
    objectStore: vi.fn(() => objectStore),
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  setTimeout(() => tx.oncomplete?.(), 10);

  const db = { transaction: vi.fn(() => tx), close: vi.fn() };

  const openReq = {
    result: db,
    onupgradeneeded: null as ((e: Event) => void) | null,
    onsuccess: null as ((e: Event) => void) | null,
    onerror: null as ((e: Event) => void) | null,
  };
  setTimeout(() => openReq.onsuccess?.({} as Event), 0);

  return { openReq, db, tx, objectStore, storeData };
}

describe('useOfflineDraft', () => {
  it('loadDraft returns null when IDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    // Call the hook functions directly — they catch errors internally
    const { loadDraft } = useOfflineDraft('test-key');
    const result = await loadDraft();
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });

  it('saveDraft does not throw when IDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { saveDraft } = useOfflineDraft('test-key');
    await expect(saveDraft({ value: 'test' })).resolves.not.toThrow();
    vi.unstubAllGlobals();
  });

  it('clearDraft does not throw when IDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { clearDraft } = useOfflineDraft('test-key');
    await expect(clearDraft()).resolves.not.toThrow();
    vi.unstubAllGlobals();
  });

  it('loadDraft returns null for missing key with working IDB', async () => {
    const { openReq } = makeIDBMock({});
    vi.stubGlobal('indexedDB', { open: vi.fn(() => openReq) });
    const { loadDraft } = useOfflineDraft('missing-key');
    const result = await loadDraft();
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });
});
