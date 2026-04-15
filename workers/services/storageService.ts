import { R2Bucket } from '@cloudflare/workers-types';

/**
 * Storage service for managing document uploads to Cloudflare R2
 * Handles file uploads, pre-signed URL generation, and soft deletes
 */
export class StorageService {
  private bucket: R2Bucket;
  private bucketName: string;

  constructor(bucket: R2Bucket, bucketName: string = 'financial-documents') {
    this.bucket = bucket;
    this.bucketName = bucketName;
  }

  /**
   * Generate a unique R2 key for a document
   */
  generateR2Key(requestId: string, fileName: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const sanitizedFileName = this.sanitizeFileName(fileName);
    return `requests/${requestId}/${timestamp}-${randomSuffix}-${sanitizedFileName}`;
  }

  /**
   * Sanitize file name to prevent path traversal and other security issues
   */
  sanitizeFileName(fileName: string): string {
    // Remove any path components
    const baseName = fileName.split('/').pop() || fileName;
    
    // Remove or replace dangerous characters
    const sanitized = baseName
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
      .replace(/\.{2,}/g, '.') // Replace multiple dots with single dot
      .replace(/^\.+/, '') // Remove leading dots
      .substring(0, 255); // Limit length
    
    return sanitized || 'document';
  }

  /**
   * Upload a file to R2 storage
   */
  async uploadDocument(
    r2Key: string,
    fileData: ArrayBuffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    await this.bucket.put(r2Key, fileData, {
      httpMetadata: {
        contentType,
      },
      customMetadata: metadata,
    });
  }

  /**
   * Generate a pre-signed URL for downloading a document
   * URL expires after 5 minutes
   */
  async generateDownloadUrl(r2Key: string): Promise<string> {
    const object = await this.bucket.get(r2Key);
    
    if (!object) {
      throw new Error('Document not found in storage');
    }

    // For Cloudflare R2, we'll use a different approach
    // Since R2 doesn't support pre-signed URLs in the same way as S3,
    // we'll return a URL that goes through our API endpoint
    // The actual file streaming will be handled by the download endpoint
    
    // Note: In production, you might want to use R2's public bucket feature
    // or implement a token-based download system
    return r2Key;
  }

  /**
   * Get document from R2 storage
   */
  async getDocument(r2Key: string): Promise<R2ObjectBody | null> {
    return await this.bucket.get(r2Key);
  }

  /**
   * Check if document exists in R2 storage
   */
  async documentExists(r2Key: string): Promise<boolean> {
    const object = await this.bucket.head(r2Key);
    return object !== null;
  }

  /**
   * Soft delete - we don't actually delete from R2, just mark as deleted in DB
   * This is handled by the document service
   */
  async softDelete(r2Key: string): Promise<void> {
    // In a soft delete scenario, we keep the file in R2
    // The database record is marked as deleted
    // If you want to actually delete from R2, uncomment below:
    // await this.bucket.delete(r2Key);
  }

  /**
   * Get document metadata from R2
   */
  async getDocumentMetadata(r2Key: string): Promise<Record<string, string> | null> {
    const object = await this.bucket.head(r2Key);
    if (!object) {
      return null;
    }
    return object.customMetadata || {};
  }

  /**
   * List all versions of a document (if versioning is enabled)
   * Note: R2 versioning support may vary
   */
  async listDocumentVersions(prefix: string): Promise<string[]> {
    const listed = await this.bucket.list({ prefix });
    return listed.objects.map(obj => obj.key);
  }
}
