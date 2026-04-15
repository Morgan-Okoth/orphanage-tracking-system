export interface Document {
  id: string;
  requestId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  r2Key: string;
  version: number;
  uploadedById: string;
  uploadedAt: Date;
  isDeleted: boolean;
  scanStatus: string;
}
