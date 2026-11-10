import mongoose from 'mongoose';
import slugify from 'slugify';
import { nanoid } from 'nanoid';

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name must be at most 100 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    settings: {
      allowEmployeeInvite: {
        type: Boolean,
        default: false,
      },
      defaultTaskPriority: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        default: 'MEDIUM',
      },
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

// ─── Pre-save: Auto-generate unique slug ─────────────────────
organizationSchema.pre('save', async function (next) {
  if (!this.isModified('name') && this.slug) return next();

  let baseSlug = slugify(this.name, { lower: true, strict: true }) || 'org';
  let candidateSlug = baseSlug;

  // Check collision
  const existing = await mongoose.models.Organization.findOne({
    slug: candidateSlug,
    _id: { $ne: this._id },
  });

  if (existing) {
    candidateSlug = `${baseSlug}-${nanoid(6).toLowerCase()}`;
  }

  this.slug = candidateSlug;
  next();
});

export const Organization = mongoose.model('Organization', organizationSchema);

