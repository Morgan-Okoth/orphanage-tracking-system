export enum RequestStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  PENDING_DOCUMENTS = 'PENDING_DOCUMENTS',
  APPROVED = 'APPROVED',
  VERIFIED = 'VERIFIED',
  PAID = 'PAID',
  DISPUTED = 'DISPUTED',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
  FLAGGED = 'FLAGGED',
  ARCHIVED = 'ARCHIVED',
}

export enum RequestType {
  SCHOOL_FEES = 'SCHOOL_FEES',
  MEDICAL_EXPENSES = 'MEDICAL_EXPENSES',
  SUPPLIES = 'SUPPLIES',
  EMERGENCY = 'EMERGENCY',
  OTHER = 'OTHER',
}

export interface Request {
  id: string;
  studentId: string;
  studentName?: string;
  type: RequestType;
  amount: number;
  reason: string;
  status: RequestStatus;
  submittedAt: Date;
  reviewedAt?: Date;
  verifiedAt?: Date;
  paidAt?: Date;
  rejectionReason?: string;
  flagReason?: string;
  disputeReason?: string;
  disputeRaisedAt?: Date;
  disputeResolvedAt?: Date;
  disputeResolution?: string;
}
