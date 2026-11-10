import mongoose from 'mongoose';
import { OrganizationMember } from '../modules/organizations/organizationMember.model.js';
import { Organization } from '../modules/organizations/organization.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { MEMBER_STATUS } from '../modules/auth/auth.constants.js';

/**
 * Middleware that extracts organization context, verifies membership and active status,
 * and attaches `req.organizationId` and `req.orgMember` to the Express Request.
 *
 * Checks in order:
 * 1. Header `x-organization-id`
 * 2. URL param `organizationId` or `orgId`
 * 3. Query param `organizationId`
 */
export const orgContext = (optional = false) =>
  asyncHandler(async (req, _res, next) => {
    const rawOrgId =
      req.headers['x-organization-id'] ||
      req.params.organizationId ||
      req.params.orgId ||
      req.query.organizationId;

    if (!rawOrgId) {
      if (optional) {
        return next();
      }
      throw ApiError.badRequest('Organization context is required. Pass X-Organization-Id header.');
    }

    if (!mongoose.Types.ObjectId.isValid(rawOrgId)) {
      throw ApiError.badRequest('Invalid Organization ID.');
    }

    // Verify organization exists and is not soft-deleted
    const org = await Organization.findOne({ _id: rawOrgId, isDeleted: false });
    if (!org) {
      throw ApiError.notFound('Organization not found.');
    }

    // Verify user is an active member
    const member = await OrganizationMember.findOne({
      organizationId: org._id,
      userId: req.user._id,
    });

    if (!member) {
      throw ApiError.forbidden('You are not a member of this organization.');
    }

    if (member.status === MEMBER_STATUS.SUSPENDED) {
      throw ApiError.forbidden('Your membership in this organization is currently suspended.');
    }

    // Attach to request
    req.organization = org;
    req.organizationId = org._id;
    req.orgMember = member;

    next();
  });

