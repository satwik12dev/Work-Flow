import mongoose from 'mongoose';
import { ALL_ROLES, ROLES } from '../../constants/roles.js';
import { MEMBER_STATUS } from '../auth/auth.constants.js';

const organizationMemberSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.EMPLOYEE,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(MEMBER_STATUS),
      default: MEMBER_STATUS.ACTIVE,
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Compound Unique Index (Prevent duplicate memberships) ────
organizationMemberSchema.index({ userId: 1, organizationId: 1 }, { unique: true });

// Scoped queries
organizationMemberSchema.index({ organizationId: 1, status: 1, role: 1 });

export const OrganizationMember = mongoose.model(
  'OrganizationMember',
  organizationMemberSchema
);

