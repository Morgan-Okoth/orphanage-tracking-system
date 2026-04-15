import { D1Database } from '@cloudflare/workers-types';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { documents, documentAccess, auditLogs } from '../db/schema';
import { StorageService } from './storageService';
import { AuditAction, UserRole } from '../types';
import { validateFile, scanForMalware } from '../utils/validation';

export interface UploadDocumentParams {
  requestId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData: ArrayBuffer;
  uploadedById: string;
  version?: number;
}

export interface DocumentMetadata {
  id: string;
  requestId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  r2Key: string;
  r2Bucket: string;
  version: number;
  uploadedById: string;
  uploadedAt: Date;
  isDeleted: boolean;
  scanStatus: string;
}

/**
 * Document management service
 * Handles document uploads, downloads, access control, and audit logging
 */
export class DocumentService {
  private db: ReturnType<typeof drizzle>;
  private storageService: StorageService;

  constructor(
    database: D1Database,
    storageService: StorageService
  ) {
    this.db = drizzle(database);
    this.storageService = storageService;
  }

  /**
   * Upload a document to R2 and create database record
   */
  async uploadDocument(params: UploadDocumentParams): Promise<DocumentMetadata> {
    const { requestId, fileName, fileType, fileSize, fileData, uploadedById, version } = params;

    // Validate file
    const validation = validateFile(fileName, fileType, fileSize);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Scan for malware (placeholder)
    const scanResult = await scanForMalware(fileData);
    if (!scanResult.clean) {
      throw new Error(`Malware detected: ${scanResult.threat}`);
    }

    // Generate unique R2 key
    const r2Key = this.storageService.generateR2Key(requestId, fileName);
    const r2Bucket = 'financial-documents';

    // Upload to R2
    await this.storageService.uploadDocument(r2Key, fileData, fileType, {
      requestId,
      uploadedById,
      originalFileName: fileName,
    });

    // Determine version number
    let documentVersion = version || 1;
    if (!version) {
      // Check if there are existing documents for this request with same name
      const existingDocs = await this.db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.requestId, requestId),
            eq(documents.fileName, fileName)
          )
        )
        .all();

      if (existingDocs.length > 0) {
        const maxVersion = Math.max(...existingDocs.map(doc => doc.version));
        documentVersion = maxVersion + 1;
      }
    }

    // Create database record
    const documentId = crypto.randomUUID();
    await this.db.insert(documents).values({
      id: documentId,
      requestId,
      fileName,
      fileType,
      fileSize,
      r2Key,
      r2Bucket,
      version: documentVersion,
      uploadedById,
      uploadedAt: new Date(),
      isDeleted: false,
      scanStatus: scanResult.clean ? 'clean' : 'pending',
    });

    // Log document upload to audit trail
    await this.db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: uploadedById,
      action: AuditAction.DOCUMENT_UPLOADED,
      resourceType: 'Document',
      resourceId: documentId,
      metadata: JSON.stringify({
        requestId,
        fileName,
        fileSize,
        version: documentVersion,
      }),
      ipAddress: 'unknown', // Will be set by handler
      userAgent: 'unknown',
      timestamp: new Date(),
    });

    // Fetch and return the created document
    const createdDoc = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .get();

    if (!createdDoc) {
      throw new Error('Failed to create document record');
    }

    return this.mapToDocumentMetadata(createdDoc);
  }

  /**
   * Get document metadata by ID
   */
  async getDocumentById(documentId: string): Promise<DocumentMetadata | null> {
    const doc = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .get();

    if (!doc) {
      return null;
    }

    return this.mapToDocumentMetadata(doc);
  }

  /**
   * Get all documents for a request
   */
  async getDocumentsByRequestId(requestId: string): Promise<DocumentMetadata[]> {
    const docs = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.requestId, requestId),
          eq(documents.isDeleted, false)
        )
      )
      .all();

    return docs.map(doc => this.mapToDocumentMetadata(doc));
  }

  /**
   * Get document versions
   */
  async getDocumentVersions(requestId: string, fileName: string): Promise<DocumentMetadata[]> {
    const docs = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.requestId, requestId),
          eq(documents.fileName, fileName)
        )
      )
      .orderBy(documents.version)
      .all();

    return docs.map(doc => this.mapToDocumentMetadata(doc));
  }

  /**
   * Soft delete a document
   */
  async softDeleteDocument(documentId: string, deletedById: string): Promise<void> {
    await this.db
      .update(documents)
      .set({ isDeleted: true })
      .where(eq(documents.id, documentId));

    // Log deletion to audit trail
    await this.db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: deletedById,
      action: AuditAction.DOCUMENT_UPLOADED, // Using existing enum, ideally add DOCUMENT_DELETED
      resourceType: 'Document',
      resourceId: documentId,
      metadata: JSON.stringify({ action: 'soft_delete' }),
      ipAddress: 'unknown',
      userAgent: 'unknown',
      timestamp: new Date(),
    });
  }

  /**
   * Check if user can access document
   */
  async canAccessDocument(
    documentId: string,
    userId: string,
    userRole: UserRole
  ): Promise<boolean> {
    const doc = await this.getDocumentById(documentId);
    if (!doc) {
      return false;
    }

    // Admins can access all documents
    if (userRole === UserRole.ADMIN_LEVEL_1 || userRole === UserRole.ADMIN_LEVEL_2) {
      return true;
    }

    // Students can only access their own documents
    // Need to check if the request belongs to the student
    const { requests } = await import('../db/schema');
    const request = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, doc.requestId))
      .get();

    if (!request) {
      return false;
    }

    return request.studentId === userId;
  }

  /**
   * Log document access
   */
  async logDocumentAccess(
    documentId: string,
    userId: string,
    ipAddress: string
  ): Promise<void> {
    const accessId = crypto.randomUUID();
    await this.db.insert(documentAccess).values({
      id: accessId,
      documentId,
      userId,
      accessedAt: new Date(),
      ipAddress,
    });

    // Also log to audit trail
    await this.db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId,
      action: AuditAction.DOCUMENT_ACCESSED,
      resourceType: 'Document',
      resourceId: documentId,
      metadata: JSON.stringify({}),
      ipAddress,
      userAgent: 'unknown',
      timestamp: new Date(),
    });
  }

  /**
   * Get document from R2 storage
   */
  async getDocumentFile(r2Key: string) {
    return await this.storageService.getDocument(r2Key);
  }

  /**
   * Generate download URL (returns R2 key for now)
   */
  async generateDownloadUrl(documentId: string): Promise<string> {
    const doc = await this.getDocumentById(documentId);
    if (!doc) {
      throw new Error('Document not found');
    }

    if (doc.isDeleted) {
      throw new Error('Document has been deleted');
    }

    return await this.storageService.generateDownloadUrl(doc.r2Key);
  }

  /**
   * Map database record to DocumentMetadata
   */
  private mapToDocumentMetadata(doc: any): DocumentMetadata {
    return {
      id: doc.id,
      requestId: doc.requestId,
      fileName: doc.fileName,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      r2Key: doc.r2Key,
      r2Bucket: doc.r2Bucket,
      version: doc.version,
      uploadedById: doc.uploadedById,
      uploadedAt: new Date(doc.uploadedAt),
      isDeleted: Boolean(doc.isDeleted),
      scanStatus: doc.scanStatus,
    };
  }
}
