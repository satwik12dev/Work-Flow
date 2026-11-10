import { ApiError } from '../utils/ApiError.js';
import { ROLE_HIERARCHY } from '../constants/roles.js';

/**
 * RBAC authorization middleware.
 * Verifies that the authenticated user's organization role matches at least one of the allowed roles.
 *
 * Usage:
 *   router.post('/', authenticate, orgContext(), authorize('ADMIN'), handler);
 *   router.patch('/', authenticate, orgContext(), authorize('ADMIN', 'MANAGER'), handler);
 *
 * @param  {...string} allowedRoles - 'ADMIN', 'MANAGER', 'EMPLOYEE'
 */
export const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.orgMember) {
    throw ApiError.forbidden('Organization membership context is required for authorization.');
  }

  const userRole = req.orgMember.role;

  if (!allowedRoles.includes(userRole)) {
    throw ApiError.forbidden(
      `Access denied. Requires one of [${allowedRoles.join(', ')}] role, but you are [${userRole}].`
    );
  }

  next();
};

/**
 * Hierarchical role authorization.
 * Ensures user has at least the minimum role level:
 * ADMIN (3) >= MANAGER (2) >= EMPLOYEE (1).
 *
 * Usage:
 *   router.post('/', authenticate, orgContext(), authorizeMinRole('MANAGER'), handler);
 *
 * @param {string} minRole - 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
 */
export const authorizeMinRole = (minRole) => (req, _res, next) => {
  if (!req.orgMember) {
    throw ApiError.forbidden('Organization membership context is required for authorization.');
  }

  const userRole = req.orgMember.role;
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

  if (userLevel < requiredLevel) {
    throw ApiError.forbidden(
      `Access denied. Requires at least [${minRole}] role, but you are [${userRole}].`
    );
  }

  next();
};

