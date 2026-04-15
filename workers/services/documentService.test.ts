import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '../types';

// ─── Mock drizzle so DocumentService uses our mock db directly ────────────────

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock('../utils/validation', () => ({
  validateFile: vi.fn().mockReturnValue({ valid: true }),
  scanForMalware: vi.fn().mockResolvedValue({ clean: true }),
}));

// Import after mocks are set up
import { DocumentService } from './documentService';
import { StorageService } from './storageService';

// ─── Mock StorageService ──────────────────────────────────────────────────────

function createMockStorageService() {
  return {
    generateR2Key: vi.fn().mockReturnValue('requests/req-1/timestamp-abc-document.pdf'),
    uploadDocument: vi.fn().mockResolvedValue(undefined),
    generateDownloadUrl: vi.fn().mockResolvedValue('requests/req-1/timestamp-abc-document.pdf'),
    getDocument: vi.fn().mockResolvedValue({ body: new ReadableStream() }),
    documentExists: vi.fn().mockResolvedValue(true),
    softDelete: vi.fn().mockResolvedValue(undefined),
    getDocumentMetadata: vi.fn().mockResolvedValue({}),
    listDocumentVersions: vi.fn().mockResolvedValue([]),
  } as unknown as StorageService;
}

// ─── Test data helpers ────────────────────────────────────────────────────────

function makeDocument(overrides: Partial<any> = {}) {
  return {
    id: 'doc-1',
    requestId: 'req-1',
    fileName: 'invoice.pdf',
    fileType: 'application/pdf',
    fileSize: 1024 * 100, // 100KB
    r2Key: 'requests/req-1/timestamp-invoice.pdf',
    r2Bucket: 'financial-documents',
    version: 1,
    uploadedById: 'user-student-1',
    uploadedAt: new Date(),
    isDeleted: 0, // SQLite stores booleans as integers
    scanStatus: 'clean',
    ...overrides,
  };
}

function makeRequest(overrides: Partial<any> = {}) {
  return {
    id: 'req-1',
    studentId: 'user-student-1',
    type: 'SCHOOL_FEES',
    amount: 5000,
    reason: 'School fees for term 2',
    status: 'SUBMITTED',
    submittedAt: new Date(),
    ...overrides,
  };
}

function makeFileData(sizeBytes: number = 1024): ArrayBuffer {
  return new ArrayBuffer(sizeBytes);
}

// ─── Helper to set up mockDb.select chain ─────────────────────────────────────

function setupSelectReturning(value: any) {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(value),
        all: vi.fn().mockResolvedValue(value === null ? [] : Array.isArray(value) ? value : [value]),
      }),
    }),
  });
}

function setupSelectReturningAll(rows: any[]) {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(rows[0] ?? null),
        all: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function setupInsertOk() {
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue(undefined) }),
  });
}

function setupUpdateOk(onSet?: (data: any) => void) {
  mockDb.update.mockReturnValue({
    set: vi.fn().mockImplementation((data: any) => {
      onSet?.(data);
      return {
        where: vi.fn().mockResolvedValue(undefined),
      };
    }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DocumentService', () => {
  let storageService: StorageService;
  let service: DocumentService;

  beforeEach(async () => {
    vi.clearAllMocks();
    storageService = createMockStorageService();
    service = new DocumentService({} as any, storageService);

    // Reset validation mock to valid by default
    const { validateFile } = await import('../utils/validation');
    vi.mocked(validateFile).mockReturnValue({ valid: true });
    const { scanForMalware } = await import('../utils/validation');
    vi.mocked(scanForMalware).mockResolvedValue({ clean: true });
  });

  // ─── uploadDocument ─────────────────────────────────────────────────────────

  describe('uploadDocument', () => {
    it('should upload a PDF document successfully', async () => {
      const doc = makeDocument();
      // First select: check existing docs for versioning (returns empty)
      // Second select: fetch created doc
      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(doc),
            all: vi.fn().mockImplementation(() => {
              selectCallCount++;
              return Promise.resolve(selectCallCount === 1 ? [] : [doc]);
            }),
          }),
        }),
      }));
      setupInsertOk();

      const result = await service.uploadDocument({
        requestId: 'req-1',
        fileName: 'invoice.pdf',
        fileType: 'application/pdf',
        fileSize: 1024 * 100,
        fileData: makeFileData(),
        uploadedById: 'user-student-1',
      });

      expect(result).toBeDefined();
      expect(result.fileName).toBe('invoice.pdf');
      expect(result.fileType).toBe('application/pdf');
      expect(storageService.uploadDocument).toHaveBeenCalledOnce();
    });

    it('should upload a JPG image successfully', async () => {
      const doc = makeDocument({ fileName: 'receipt.jpg', fileType: 'image/jpeg' });
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(doc),
            all: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      setupInsertOk();

      const result = await service.uploadDocument({
        requestId: 'req-1',
        fileName: 'receipt.jpg',
        fileType: 'image/jpeg',
        fileSize: 1024 * 200,
        fileData: makeFileData(),
        uploadedById: 'user-student-1',
      });

      expect(result).toBeDefined();
      expect(result.fileType).toBe('image/jpeg');
    });

    it('should upload a PNG image successfully', async () => {
      const doc = makeDocument({ fileName: 'photo.png', fileType: 'image/png' });
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(doc),
            all: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      setupInsertOk();

      const result = await service.uploadDocument({
        requestId: 'req-1',
        fileName: 'photo.png',
        fileType: 'image/png',
        fileSize: 1024 * 300,
        fileData: makeFileData(),
        uploadedById: 'user-student-1',
      });

      expect(result).toBeDefined();
      expect(result.fileType).toBe('image/png');
    });

    it('should reject an invalid file type (e.g. .exe)', async () => {
      const { validateFile } = await import('../utils/validation');
      vi.mocked(validateFile).mockReturnValue({
        valid: false,
        error: 'Invalid file type. Allowed types: PDF, JPG, JPEG, PNG',
      });

      await expect(
        service.uploadDocument({
          requestId: 'req-1',
          fileName: 'malware.exe',
          fileType: 'application/octet-stream',
          fileSize: 1024,
          fileData: makeFileData(),
          uploadedById: 'user-student-1',
        })
      ).rejects.toThrow('Invalid file type');

      expect(storageService.uploadDocument).not.toHaveBeenCalled();
    });

    it('should reject a file exceeding 10MB', async () => {
      const { validateFile } = await import('../utils/validation');
      vi.mocked(validateFile).mockReturnValue({
        valid: false,
        error: 'File size exceeds maximum allowed size of 10MB',
      });

      await expect(
        service.uploadDocument({
          requestId: 'req-1',
          fileName: 'large.pdf',
          fileType: 'application/pdf',
          fileSize: 11 * 1024 * 1024,
          fileData: makeFileData(),
          uploadedById: 'user-student-1',
        })
      ).rejects.toThrow('File size exceeds maximum allowed size of 10MB');

      expect(storageService.uploadDocument).not.toHaveBeenCalled();
    });

    it('should reject an empty file', async () => {
      const { validateFile } = await import('../utils/validation');
      vi.mocked(validateFile).mockReturnValue({
        valid: false,
        error: 'File is empty',
      });

      await expect(
        service.uploadDocument({
          requestId: 'req-1',
          fileName: 'empty.pdf',
          fileType: 'application/pdf',
          fileSize: 0,
          fileData: makeFileData(0),
          uploadedById: 'user-student-1',
        })
      ).rejects.toThrow('File is empty');
    });

    it('should auto-increment version for duplicate file names', async () => {
      const existingDoc = makeDocument({ version: 1 });
      const newDoc = makeDocument({ version: 2 });

      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            // get() is called after insert to fetch the created doc
            get: vi.fn().mockResolvedValue(newDoc),
            // all() is called to check existing docs for versioning
            all: vi.fn().mockImplementation(() => {
              selectCallCount++;
              return Promise.resolve(selectCallCount === 1 ? [existingDoc] : [newDoc]);
            }),
          }),
        }),
      }));
      setupInsertOk();

      const result = await service.uploadDocument({
        requestId: 'req-1',
        fileName: 'invoice.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        fileData: makeFileData(),
        uploadedById: 'user-student-1',
      });

      expect(result.version).toBe(2);
    });
  });

  // ─── getDocumentById ────────────────────────────────────────────────────────

  describe('getDocumentById', () => {
    it('should return document metadata for a valid document ID', async () => {
      const doc = makeDocument();
      setupSelectReturning(doc);

      const result = await service.getDocumentById('doc-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('doc-1');
      expect(result!.fileName).toBe('invoice.pdf');
      expect(result!.fileType).toBe('application/pdf');
      expect(result!.fileSize).toBe(1024 * 100);
    });

    it('should return null for a non-existent document ID', async () => {
      setupSelectReturning(null);

      const result = await service.getDocumentById('non-existent');

      expect(result).toBeNull();
    });
  });

  // ─── getDocumentsByRequestId ────────────────────────────────────────────────

  describe('getDocumentsByRequestId', () => {
    it('should return all non-deleted documents for a request', async () => {
      const doc1 = makeDocument({ id: 'doc-1', fileName: 'invoice.pdf' });
      const doc2 = makeDocument({ id: 'doc-2', fileName: 'receipt.jpg', fileType: 'image/jpeg' });
      setupSelectReturningAll([doc1, doc2]);

      const results = await service.getDocumentsByRequestId('req-1');

      expect(results).toHaveLength(2);
      expect(results.map((d) => d.id)).toContain('doc-1');
      expect(results.map((d) => d.id)).toContain('doc-2');
    });

    it('should return an empty array when no documents exist for a request', async () => {
      setupSelectReturningAll([]);

      const results = await service.getDocumentsByRequestId('req-no-docs');

      expect(results).toHaveLength(0);
    });
  });

  // ─── canAccessDocument ──────────────────────────────────────────────────────

  describe('canAccessDocument - access control', () => {
    it('should allow ADMIN_LEVEL_1 to access any document', async () => {
      const doc = makeDocument();
      setupSelectReturning(doc);

      const canAccess = await service.canAccessDocument('doc-1', 'admin-user-1', UserRole.ADMIN_LEVEL_1);

      expect(canAccess).toBe(true);
    });

    it('should allow ADMIN_LEVEL_2 to access any document', async () => {
      const doc = makeDocument();
      setupSelectReturning(doc);

      const canAccess = await service.canAccessDocument('doc-1', 'admin-user-2', UserRole.ADMIN_LEVEL_2);

      expect(canAccess).toBe(true);
    });

    it('should allow a student to access their own document', async () => {
      const doc = makeDocument({ requestId: 'req-1' });
      const request = makeRequest({ id: 'req-1', studentId: 'user-student-1' });

      let callCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() => {
              callCount++;
              return Promise.resolve(callCount === 1 ? doc : request);
            }),
          }),
        }),
      }));

      const canAccess = await service.canAccessDocument('doc-1', 'user-student-1', UserRole.STUDENT);

      expect(canAccess).toBe(true);
    });

    it("should deny a student access to another student's document", async () => {
      const doc = makeDocument({ requestId: 'req-1' });
      const request = makeRequest({ id: 'req-1', studentId: 'user-student-1' });

      let callCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() => {
              callCount++;
              return Promise.resolve(callCount === 1 ? doc : request);
            }),
          }),
        }),
      }));

      // user-student-2 tries to access a doc belonging to user-student-1
      const canAccess = await service.canAccessDocument('doc-1', 'user-student-2', UserRole.STUDENT);

      expect(canAccess).toBe(false);
    });

    it('should deny access when document does not exist', async () => {
      setupSelectReturning(null);

      const canAccess = await service.canAccessDocument('non-existent', 'user-student-1', UserRole.STUDENT);

      expect(canAccess).toBe(false);
    });

    it('should deny access when the associated request does not exist', async () => {
      const doc = makeDocument({ requestId: 'req-orphan' });

      let callCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() => {
              callCount++;
              // First call: fetch document, second call: fetch request (not found)
              return Promise.resolve(callCount === 1 ? doc : null);
            }),
          }),
        }),
      }));

      const canAccess = await service.canAccessDocument('doc-1', 'user-student-1', UserRole.STUDENT);

      expect(canAccess).toBe(false);
    });
  });

  // ─── generateDownloadUrl ────────────────────────────────────────────────────

  describe('generateDownloadUrl', () => {
    it('should return a download URL for a valid document', async () => {
      const doc = makeDocument();
      setupSelectReturning(doc);
      vi.mocked(storageService.generateDownloadUrl).mockResolvedValue(
        'requests/req-1/timestamp-invoice.pdf'
      );

      const url = await service.generateDownloadUrl('doc-1');

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(url).toContain('requests/req-1');
      expect(storageService.generateDownloadUrl).toHaveBeenCalledWith(doc.r2Key);
    });

    it('should throw an error for a non-existent document', async () => {
      setupSelectReturning(null);

      await expect(service.generateDownloadUrl('non-existent')).rejects.toThrow('Document not found');
    });

    it('should throw an error for a soft-deleted document', async () => {
      const deletedDoc = makeDocument({ isDeleted: 1 }); // SQLite boolean as integer
      setupSelectReturning(deletedDoc);

      await expect(service.generateDownloadUrl('doc-1')).rejects.toThrow('Document has been deleted');
    });
  });

  // ─── softDeleteDocument ─────────────────────────────────────────────────────

  describe('softDeleteDocument', () => {
    it('should mark a document as deleted without removing from storage', async () => {
      let capturedSetData: any;
      setupUpdateOk((data) => { capturedSetData = data; });
      setupInsertOk();

      await service.softDeleteDocument('doc-1', 'admin-1');

      expect(capturedSetData).toBeDefined();
      expect(capturedSetData.isDeleted).toBe(true);
      // R2 storage should NOT be called for soft delete
      expect(storageService.softDelete).not.toHaveBeenCalled();
    });
  });

  // ─── logDocumentAccess ──────────────────────────────────────────────────────

  describe('logDocumentAccess', () => {
    it('should log document access with user and IP information', async () => {
      const insertedRecords: any[] = [];
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockImplementation((data: any) => {
          insertedRecords.push({ ...data });
          return { run: vi.fn().mockResolvedValue(undefined) };
        }),
      });

      await service.logDocumentAccess('doc-1', 'user-student-1', '192.168.1.1');

      // Should have inserted into document_access and audit_logs (2 records)
      expect(insertedRecords.length).toBeGreaterThanOrEqual(1);
      const accessRecord = insertedRecords.find((r) => r.documentId === 'doc-1');
      expect(accessRecord).toBeDefined();
      expect(accessRecord.userId).toBe('user-student-1');
      expect(accessRecord.ipAddress).toBe('192.168.1.1');
    });
  });
});
