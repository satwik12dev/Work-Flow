import mongoose from 'mongoose';
import { ALL_PROJECT_STATUSES, PROJECT_STATUS } from '../../constants/projectStatus.js';
import { ALL_PRIORITIES, PRIORITY } from '../../constants/priorities.js';

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      minlength: [2, 'Project name must be at least 2 characters'],
      maxlength: [120, 'Project name must be at most 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project manager is required'],
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ALL_PROJECT_STATUSES,
      default: PROJECT_STATUS.PLANNING,
      index: true,
    },
    priority: {
      type: String,
      enum: ALL_PRIORITIES,
      default: PRIORITY.MEDIUM,
      index: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────
projectSchema.index({ organizationId: 1, status: 1 });
projectSchema.index({ organizationId: 1, managerId: 1 });
projectSchema.index({ organizationId: 1, teamId: 1 });
projectSchema.index({ organizationId: 1, name: 1, isDeleted: 1 });

export const Project = mongoose.model('Project', projectSchema);

