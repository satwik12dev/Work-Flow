export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
});

/**
 * Numeric hierarchy used for "at least role X" checks.
 * Higher number = more privileges.
 */
export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.ADMIN]: 3,
  [ROLES.MANAGER]: 2,
  [ROLES.EMPLOYEE]: 1,
});

export const ALL_ROLES = Object.values(ROLES);

