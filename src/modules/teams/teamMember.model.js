import mongoose from 'mongoose';

const teamMemberSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
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
// Prevent duplicate membership within the same team
teamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });

// Scoped queries for user's teams in an organization
teamMemberSchema.index({ organizationId: 1, userId: 1 });

export const TeamMember = mongoose.model('TeamMember', teamMemberSchema);

