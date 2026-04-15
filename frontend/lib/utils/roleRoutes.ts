import { UserRole } from '../types/user';

export function getDashboardRoute(role: UserRole): string {
  switch (role) {
    case UserRole.SUPERADMIN:
      return '/superadmin';
    case UserRole.ADMIN_LEVEL_2:
      return '/auditor';
    case UserRole.ADMIN_LEVEL_1:
      return '/admin';
    case UserRole.STUDENT:
    default:
      return '/student';
  }
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case UserRole.SUPERADMIN:
      return 'Superadmin';
    case UserRole.ADMIN_LEVEL_2:
      return 'Auditor';
    case UserRole.ADMIN_LEVEL_1:
      return 'Operations Admin';
    case UserRole.STUDENT:
    default:
      return 'Beneficiary';
  }
}
