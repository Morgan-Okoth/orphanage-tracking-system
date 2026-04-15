import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackupService } from './backupService';

// ─── Mock encryption ──────────────────────────────────────────────────────────
// Use simple reversible stubs so tests don't need real crypto keys.

vi.mock('../utils/encryption', () => ({
  encrypt: vi.fn(async (plaintext: string, _key: string) => `enc:${plaintext}`),
  decrypt: vi.fn(async (ciphertext: string, _key: string) => {
    if (!ciphertext.startsWith('enc:')) throw new Error('Invalid ciphertext');
    return ciphertext.slice(4);
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENCRYPTION_KEY = 'a'.repeat(64);

function makeR2Object(key: string, uploaded: Date, size = 100): R2Object {
  return {
    key,
    size,
    uploaded,
    etag: 'etag',
    httpEtag: '"etag"',
    checksums: {} as R2Checksums,
    httpMetadata: {},
    customMetadata: {},
    storageClass: 'Standard',
    version: '1',
    writeHttpMetadata: vi.fn(),
  } as unknown as R2Object;
}

function makeR2GetResult(text: string) {
  return {
    text: vi.fn().mockResolvedValue(text),
    arrayBuffer: vi.fn(),
    json: vi.fn(),
    blob: vi.fn(),
    body: null,
    bodyUsed: false,
  } as unknown as R2ObjectBody;
}

function makeEnv(overrides: Partial<{
  dailyObjects: R2Object[];
  monthlyObjects: R2Object[];
  getResult: R2ObjectBody | null;
  dbResults: Record<string, unknown[]>;
}> = {}) {
  const {
    dailyObjects = [],
    monthlyObjects = [],
    getResult = null,
    dbResults = {},
  } = overrides;

  const deletedKeys: string[] = [];
  const putCalls: Array<{ key: string; size: number }> = [];

  const bucket = {
    put: vi.fn().mockImplementation(async (key: string, data: Uint8Array) => {
      putCalls.push({ key, size: data.byteLength });
    }),
    get: vi.fn().mockResolvedValue(getResult),
    list: vi.fn().mockImplementation(async ({ prefix }: { prefix: string }) => {
      if (prefix.includes('daily')) return { objects: dailyObjects };
      if (prefix.includes('monthly')) return { objects: monthlyObjects };
      return { objects: [] };
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      deletedKeys.push(key);
    }),
    _putCalls: putCalls,
    _deletedKeys: deletedKeys,
  };

  const db = {
    prepare: vi.fn().mockImplementation((sql: string) => {
      const table = sql.replace('SELECT * FROM ', '').trim();
      const rows = dbResults[table] ?? [];
      return { all: vi.fn().mockResolvedValue({ results: rows }) };
    }),
  };

  const cache = {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
  };

  return {
    BACKUPS_BUCKET: bucket,
    DB: db,
    CACHE: cache,
    ENCRYPTION_KEY,
  } as unknown as import('../api/index').Env;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BackupService', () => {
  let service: BackupService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BackupService();
  });

  // ─── performBackup ──────────────────────────────────────────────────────────

  describe('performBackup', () => {
    it('creates an encrypted daily backup with correct key format', async () => {
      const env = makeEnv();
      const result = await service.performBackup(env);

      expect(result.success).toBe(true);
      // Key must match backups/daily/YYYY-MM-DD.json.enc
      expect(result.key).toMatch(/^backups\/daily\/\d{4}-\d{2}-\d{2}\.json\.enc$/);
      expect(result.size).toBeGreaterThan(0);
      expect(result.isMonthly).toBe(false);

      const bucket = env.BACKUPS_BUCKET as any;
      const dailyPut = bucket._putCalls.find((c: any) => c.key.includes('daily'));
      expect(dailyPut).toBeDefined();
    });

    it('creates a monthly backup on the 1st of the month', async () => {
      // Freeze date to 1st of a month
      vi.setSystemTime(new Date('2024-03-01T02:00:00Z'));

      const env = makeEnv();
      const result = await service.performBackup(env);

      expect(result.isMonthly).toBe(true);

      const bucket = env.BACKUPS_BUCKET as any;
      const monthlyPut = bucket._putCalls.find((c: any) => c.key.includes('monthly'));
      expect(monthlyPut).toBeDefined();
      expect(monthlyPut.key).toBe('backups/monthly/2024-03.json.enc');

      vi.useRealTimers();
    });

    it('does NOT create a monthly backup on non-1st days', async () => {
      vi.setSystemTime(new Date('2024-03-15T02:00:00Z'));

      const env = makeEnv();
      const result = await service.performBackup(env);

      expect(result.isMonthly).toBe(false);

      const bucket = env.BACKUPS_BUCKET as any;
      const monthlyPut = bucket._putCalls.find((c: any) => c.key.includes('monthly'));
      expect(monthlyPut).toBeUndefined();

      vi.useRealTimers();
    });

    it('logs success metadata to CACHE KV', async () => {
      const env = makeEnv();
      await service.performBackup(env);

      expect(env.CACHE.put).toHaveBeenCalledWith(
        'backup:last_success',
        expect.stringContaining('"key"')
      );
    });

    it('includes all expected tables in the backup payload', async () => {
      const dbResults = {
        users: [{ id: 'u1' }],
        requests: [{ id: 'r1' }, { id: 'r2' }],
      };
      const env = makeEnv({ dbResults });

      const { encrypt } = await import('../utils/encryption');
      let capturedPayload: any;
      vi.mocked(encrypt).mockImplementationOnce(async (plaintext) => {
        capturedPayload = JSON.parse(plaintext);
        return `enc:${plaintext}`;
      });

      await service.performBackup(env);

      expect(capturedPayload.version).toBe('1.0');
      expect(capturedPayload.tables.users).toHaveLength(1);
      expect(capturedPayload.tables.requests).toHaveLength(2);
      expect(capturedPayload.tables).toHaveProperty('audit_logs');
    });
  });

  // ─── verifyBackup ───────────────────────────────────────────────────────────

  describe('verifyBackup', () => {
    it('returns valid=true for a real backup', async () => {
      const payload = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        tables: {
          users: [{ id: 'u1' }, { id: 'u2' }],
          requests: [{ id: 'r1' }],
        },
      };
      const encryptedText = `enc:${JSON.stringify(payload)}`;
      const env = makeEnv({ getResult: makeR2GetResult(encryptedText) });

      const result = await service.verifyBackup(env, 'backups/daily/2024-01-15.json.enc');

      expect(result.valid).toBe(true);
      expect(result.recordCount).toBe(3);
      expect(result.tables.users).toBe(2);
      expect(result.tables.requests).toBe(1);
    });

    it('returns valid=false when backup key does not exist', async () => {
      const env = makeEnv({ getResult: null });

      const result = await service.verifyBackup(env, 'backups/daily/nonexistent.json.enc');

      expect(result.valid).toBe(false);
      expect(result.recordCount).toBe(0);
    });

    it('returns valid=false when decryption fails (corrupted backup)', async () => {
      const env = makeEnv({ getResult: makeR2GetResult('corrupted-data-no-enc-prefix') });

      const result = await service.verifyBackup(env, 'backups/daily/2024-01-15.json.enc');

      expect(result.valid).toBe(false);
    });

    it('returns valid=false when payload is missing required fields', async () => {
      const badPayload = { something: 'wrong' };
      const env = makeEnv({ getResult: makeR2GetResult(`enc:${JSON.stringify(badPayload)}`) });

      const result = await service.verifyBackup(env, 'backups/daily/2024-01-15.json.enc');

      expect(result.valid).toBe(false);
    });
  });

  // ─── deleteOldBackups ───────────────────────────────────────────────────────

  describe('deleteOldBackups', () => {
    it('deletes daily backups older than 30 days', async () => {
      const now = new Date('2024-03-15T02:00:00Z');
      vi.setSystemTime(now);

      const old = makeR2Object(
        'backups/daily/2024-02-10.json.enc',
        new Date('2024-02-10T02:00:00Z') // 34 days ago
      );
      const recent = makeR2Object(
        'backups/daily/2024-03-10.json.enc',
        new Date('2024-03-10T02:00:00Z') // 5 days ago
      );

      const env = makeEnv({ dailyObjects: [old, recent] });
      await service.deleteOldBackups(env);

      const bucket = env.BACKUPS_BUCKET as any;
      expect(bucket._deletedKeys).toContain('backups/daily/2024-02-10.json.enc');
      expect(bucket._deletedKeys).not.toContain('backups/daily/2024-03-10.json.enc');

      vi.useRealTimers();
    });

    it('deletes monthly backups older than 365 days', async () => {
      const now = new Date('2024-03-15T02:00:00Z');
      vi.setSystemTime(now);

      const old = makeR2Object(
        'backups/monthly/2023-02.json.enc',
        new Date('2023-02-01T02:00:00Z') // ~13 months ago
      );
      const recent = makeR2Object(
        'backups/monthly/2024-02.json.enc',
        new Date('2024-02-01T02:00:00Z') // ~43 days ago
      );

      const env = makeEnv({ monthlyObjects: [old, recent] });
      await service.deleteOldBackups(env);

      const bucket = env.BACKUPS_BUCKET as any;
      expect(bucket._deletedKeys).toContain('backups/monthly/2023-02.json.enc');
      expect(bucket._deletedKeys).not.toContain('backups/monthly/2024-02.json.enc');

      vi.useRealTimers();
    });

    it('does not delete anything when all backups are within retention', async () => {
      const now = new Date('2024-03-15T02:00:00Z');
      vi.setSystemTime(now);

      const recent = makeR2Object(
        'backups/daily/2024-03-14.json.enc',
        new Date('2024-03-14T02:00:00Z')
      );

      const env = makeEnv({ dailyObjects: [recent] });
      await service.deleteOldBackups(env);

      const bucket = env.BACKUPS_BUCKET as any;
      expect(bucket._deletedKeys).toHaveLength(0);

      vi.useRealTimers();
    });
  });

  // ─── listBackups ────────────────────────────────────────────────────────────

  describe('listBackups', () => {
    it('returns categorized daily and monthly backups', async () => {
      const daily = [
        makeR2Object('backups/daily/2024-03-14.json.enc', new Date('2024-03-14T02:00:00Z'), 2048),
        makeR2Object('backups/daily/2024-03-13.json.enc', new Date('2024-03-13T02:00:00Z'), 1900),
      ];
      const monthly = [
        makeR2Object('backups/monthly/2024-03.json.enc', new Date('2024-03-01T02:00:00Z'), 5000),
      ];

      const env = makeEnv({ dailyObjects: daily, monthlyObjects: monthly });
      const result = await service.listBackups(env);

      expect(result.daily).toHaveLength(2);
      expect(result.monthly).toHaveLength(1);

      expect(result.daily[0].label).toBe('2024-03-14');
      expect(result.daily[0].size).toBe(2048);
      expect(result.monthly[0].label).toBe('2024-03');
    });

    it('returns empty arrays when no backups exist', async () => {
      const env = makeEnv();
      const result = await service.listBackups(env);

      expect(result.daily).toHaveLength(0);
      expect(result.monthly).toHaveLength(0);
    });
  });
});
