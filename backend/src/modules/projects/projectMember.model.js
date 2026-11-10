import mongoose from 'mongoose';

const projectMemberSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
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
    role: {
      type: String,
      enum: ['MANAGER', 'MEMBER'],
      default: 'MEMBER',
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────
// Prevent duplicate member in same project
projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

// Scoped queries: projects user belongs to within an organization
projectMemberSchema.index({ organizationId: 1, userId: 1 });

export const ProjectMember = mongoose.model('ProjectMember', projectMemberSchema);

