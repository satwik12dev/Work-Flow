import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_ASSIGNED',
        'TASK_REASSIGNED',
        'TASK_STATUS_CHANGED',
        'TASK_DELETED',
        'COMMENT_ADDED',
        'ATTACHMENT_UPLOADED',
        'ATTACHMENT_DELETED',
        'PROJECT_CREATED',
        'PROJECT_UPDATED',
      ],
    },
    entityType: {
      type: String,
      required: true,
      enum: ['TASK', 'PROJECT', 'TEAM', 'ORGANIZATION'],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────
activityLogSchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 });

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

