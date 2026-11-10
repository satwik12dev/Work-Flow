import mongoose from 'mongoose';
import { ALL_ROLES, ROLES } from '../../constants/roles.js';
import { INVITATION_STATUS } from '../auth/auth.constants.js';

const invitationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.EMPLOYEE,
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(INVITATION_STATUS),
      default: INVITATION_STATUS.PENDING,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB auto-removes expired invitation documents
    },
  },
  {
    timestamps: true,
  }
);

invitationSchema.index({ organizationId: 1, email: 1, status: 1 });

export const Invitation = mongoose.model('Invitation', invitationSchema);

