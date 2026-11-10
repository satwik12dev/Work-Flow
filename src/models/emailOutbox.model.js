import mongoose from 'mongoose';

const emailOutboxSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        'OTP_VERIFICATION',
        'PASSWORD_RESET',
        'TASK_ASSIGNED',
        'TASK_REASSIGNED',
        'ORG_INVITATION',
        'DEADLINE_REMINDER',
        'GENERIC_NOTIFICATION',
      ],
    },
    recipientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    recipientName: {
      type: String,
      trim: true,
      default: '',
    },
    subject: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'QUEUED', 'SENT', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    providerMessageId: {
      type: String,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

emailOutboxSchema.index({ status: 1, createdAt: 1 });

export const EmailOutbox = mongoose.model('EmailOutbox', emailOutboxSchema);

