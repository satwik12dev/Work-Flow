import { describe, it, expect, jest } from '@jest/globals';
import { authorize, authorizeMinRole } from '../../../src/middlewares/authorize.js';
import { ROLES } from '../../../src/constants/roles.js';

describe('Authorize RBAC Middleware Unit Tests', () => {
  const mockRes = {};

  it('should allow user with matching role', () => {
    const req = { orgMember: { role: ROLES.ADMIN } };
    const next = jest.fn();

    authorize(ROLES.ADMIN, ROLES.MANAGER)(req, mockRes, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should throw 403 Forbidden if user role is not in allowedRoles', () => {
    const req = { orgMember: { role: ROLES.EMPLOYEE } };
    const next = jest.fn();

    expect(() => authorize(ROLES.ADMIN, ROLES.MANAGER)(req, mockRes, next)).toThrow(
      /Access denied/
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should enforce hierarchical minimum role check', () => {
    const adminReq = { orgMember: { role: ROLES.ADMIN } };
    const managerReq = { orgMember: { role: ROLES.MANAGER } };
    const employeeReq = { orgMember: { role: ROLES.EMPLOYEE } };
    const next = jest.fn();

    authorizeMinRole(ROLES.MANAGER)(adminReq, mockRes, next);
    authorizeMinRole(ROLES.MANAGER)(managerReq, mockRes, next);
    expect(next).toHaveBeenCalledTimes(2);

    expect(() => authorizeMinRole(ROLES.MANAGER)(employeeReq, mockRes, next)).toThrow(
      /Access denied/
    );
  });
});

