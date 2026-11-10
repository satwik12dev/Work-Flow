import mongoose from 'mongoose';
import { ALL_TASK_STATUSES, TASK_STATUS } from '../../constants/taskStatus.js';
import { ALL_PRIORITIES, PRIORITY } from '../../constants/priorities.js';

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      minlength: [2, 'Task title must be at least 2 characters'],
      maxlength: [200, 'Task title must be at most 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ALL_TASK_STATUSES,
      default: TASK_STATUS.TODO,
      index: true,
    },
    priority: {
      type: String,
      enum: ALL_PRIORITIES,
      default: PRIORITY.MEDIUM,
      index: true,
    },
    dueDate: {
      type: Date,
      default: null,
      index: true,
    },
    estimatedHours: {
      type: Number,
      min: [0, 'Estimated hours cannot be negative'],
      default: 0,
    },
    actualHours: {
      type: Number,
      min: [0, 'Actual hours cannot be negative'],
      default: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
    attachments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Attachment',
      },
    ],
    completedAt: {
      type: Date,
      default: null,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────
taskSchema.virtual('isOverdue').get(function () {
  if (!this.dueDate || this.status === TASK_STATUS.DONE) return false;
  return new Date() > new Date(this.dueDate);
});

// ─── Compound Indexes ─────────────────────────────────────────
taskSchema.index({ organizationId: 1, projectId: 1, status: 1 });
taskSchema.index({ organizationId: 1, assignedTo: 1, status: 1 });
taskSchema.index({ organizationId: 1, dueDate: 1, status: 1 });

export const Task = mongoose.model('Task', taskSchema);

