export enum UserRole {
  STUDENT = 'STUDENT',
  ADMIN_LEVEL_1 = 'ADMIN_LEVEL_1',
  ADMIN_LEVEL_2 = 'ADMIN_LEVEL_2',
}

export enum AccountStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  DEACTIVATED = 'DEACTIVATED',
  REJECTED = 'REJECTED',
}

export interface User {
  id: string;
  email: string;
  phone: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  accountStatus: AccountStatus;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}
