const PORTAL_LABELS: Record<string, string> = {
  'Merchant Success': 'Merchant Success Portal',
  'Sales & Marketing': 'Sales & Marketing Portal',
  Operation: 'Operations Portal',
  'Product & Engineering': 'Product & Engineering Portal',
};

export function getPortalLabel(department: string | null, isSuperAdmin: boolean): string {
  if (isSuperAdmin) {
    return 'Super Admin Portal';
  }
  if (department && PORTAL_LABELS[department]) {
    return PORTAL_LABELS[department];
  }
  return 'Team';
}

export function getDepartmentDisplayName(department: string | null): string {
  return department ?? 'Team';
}

const hasDepartmentAccess = (department: string | null, isSuperAdmin: boolean): boolean => {
  if (isSuperAdmin) {
    return true;
  }
  return Boolean(department && department.trim().length > 0);
};

export function canAccessSupportPages(department: string | null, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || department === 'Merchant Success';
}

export function canAccessMerchantsPages(department: string | null, isSuperAdmin: boolean): boolean {
  return hasDepartmentAccess(department, isSuperAdmin);
}

export function canAccessTicketsPages(department: string | null, isSuperAdmin: boolean): boolean {
  return hasDepartmentAccess(department, isSuperAdmin);
}

export function canManageSupportSettings(
  department: string | null,
  role: string | null,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) {
    return true;
  }
  const normalisedDepartment = department?.trim().toLowerCase() ?? '';
  const normalisedRole = role?.trim().toLowerCase() ?? '';
  const isMerchantSuccess = normalisedDepartment === 'merchant success';
  const isAdminRole = normalisedRole === 'admin' || normalisedRole === 'super admin';
  return isMerchantSuccess && isAdminRole;
}
