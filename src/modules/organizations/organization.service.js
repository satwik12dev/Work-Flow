import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Organization } from './organization.model.js';
import { OrganizationMember } from './organizationMember.model.js';
import { Invitation } from './invitation.model.js';
import { User } from '../users/user.model.js';
import { EmailOutbox } from '../../models/emailOutbox.model.js';
import { enqueueEmailJob } from '../../queues/email.queue.js';
import { ApiError } from '../../utils/ApiError.js';
import { generateToken, escapeRegex } from '../../utils/helpers.js';
import { runInTransaction } from '../../utils/transaction.js';
import { getPaginationParams, createPaginationResponse } from '../../utils/pagination.js';
import { ROLES } from '../../constants/roles.js';
import { INVITATION_STATUS, MEMBER_STATUS } from '../auth/auth.constants.js';
import { logger } from '../../config/logger.js';
import { notificationService } from '../notifications/notification.service.js';
import { NOTIFICATION_TYPE } from '../../constants/notificationTypes.js';

class OrganizationService {
  /**
   * Create a new organization and assign the creator as ADMIN and owner.
   */
  async createOrganization({ name, description, settings }, userId) {
    return runInTransaction(async (session) => {
      const org = new Organization({
        name,
        description: description || '',
        settings: settings || {},
        ownerId: userId,
      });

      await org.save({ session });

      const member = new OrganizationMember({
        organizationId: org._id,
        userId,
        role: ROLES.ADMIN,
        status: MEMBER_STATUS.ACTIVE,
      });

      await member.save({ session });

      logger.info(`Organization "${org.name}" created by user ${userId}`);

      return {
        organization: org,
        member,
      };
    });
  }

  /**
   * List all organizations where the user is an active member.
   */
  async getUserOrganizations(userId) {
    const memberships = await OrganizationMember.find({
      userId,
      status: MEMBER_STATUS.ACTIVE,
    })
      .populate({
        path: 'organizationId',
        match: { isDeleted: false },
        select: 'name slug description ownerId createdAt',
      })
      .lean();

    return memberships
      .filter((m) => m.organizationId !== null)
      .map((m) => ({
        organization: m.organizationId,
        role: m.role,
        joinedAt: m.joinedAt,
      }));
  }

  /**
   * Get single organization details.
   */
  async getOrganizationById(organizationId) {
    const org = await Organization.findOne({
      _id: organizationId,
      isDeleted: false,
    }).populate('ownerId', 'name email');

    if (!org) {
      throw ApiError.notFound('Organization not found.');
    }

    const memberCount = await OrganizationMember.countDocuments({
      organizationId,
      status: MEMBER_STATUS.ACTIVE,
    });

    return {
      ...org.toJSON(),
      memberCount,
    };
  }

  /**
   * Update organization details & settings.
   */
  async updateOrganization(organizationId, updates) {
    const org = await Organization.findOne({ _id: organizationId, isDeleted: false });
    if (!org) {
      throw ApiError.notFound('Organization not found.');
    }

    if (updates.name) org.name = updates.name;
    if (updates.description !== undefined) org.description = updates.description;
    if (updates.settings) {
      org.settings = { ...org.settings, ...updates.settings };
    }

    await org.save();
    return org;
  }

  /**
   * Delete organization (owner only).
   */
  async deleteOrganization(organizationId, requestingUserId) {
    const org = await Organization.findOne({ _id: organizationId, isDeleted: false });
    if (!org) {
      throw ApiError.notFound('Organization not found.');
    }

    if (org.ownerId.toString() !== requestingUserId.toString()) {
      throw ApiError.forbidden('Only the organization owner can delete the organization.');
    }

    org.isDeleted = true;
    org.deletedAt = new Date();
    await org.save();

    logger.warn(`Organization "${org.name}" (${org._id}) was soft-deleted by owner ${requestingUserId}`);
    return { message: 'Organization deleted successfully.' };
  }

  // ─── Members & Invitations ────────────────────────────────────

  /**
   * Invite a user to join an organization.
   */
  async inviteMember(organizationId, { email, role }, invitingUser) {
    const normalizedEmail = email.toLowerCase().trim();
    const org = await Organization.findOne({ _id: organizationId, isDeleted: false });
    if (!org) {
      throw ApiError.notFound('Organization not found.');
    }

    // 1. Check if user is already an active member
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      const alreadyMember = await OrganizationMember.findOne({
        organizationId,
        userId: existingUser._id,
      });

      if (alreadyMember) {
        if (alreadyMember.status === MEMBER_STATUS.ACTIVE) {
          throw ApiError.conflict('User is already an active member of this organization.');
        } else {
          // Reactivate member
          alreadyMember.status = MEMBER_STATUS.ACTIVE;
          alreadyMember.role = role || ROLES.EMPLOYEE;
          await alreadyMember.save();
          return { message: 'Existing suspended member reactivated.', member: alreadyMember };
        }
      }
    }

    // 2. Check existing pending invitation
    let invitation = await Invitation.findOne({
      organizationId,
      email: normalizedEmail,
      status: INVITATION_STATUS.PENDING,
    });

    const token = generateToken(32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    if (invitation) {
      invitation.token = token;
      invitation.role = role || ROLES.EMPLOYEE;
      invitation.expiresAt = expiresAt;
      invitation.invitedBy = invitingUser._id;
      await invitation.save();
    } else {
      invitation = await Invitation.create({
        organizationId,
        invitedBy: invitingUser._id,
        email: normalizedEmail,
        role: role || ROLES.EMPLOYEE,
        token,
        expiresAt,
        status: INVITATION_STATUS.PENDING,
      });
    }

    // 3. Create Outbox event & dispatch email
    const eventId = uuidv4();
    const outboxEvent = await EmailOutbox.create({
      eventId,
      organizationId,
      eventType: 'ORG_INVITATION',
      recipientEmail: normalizedEmail,
      subject: `[WorkFlowX] Invitation to join ${org.name}`,
      payload: {
        organizationName: org.name,
        invitedBy: invitingUser.name,
        role: invitation.role,
        inviteToken: token,
      },
      status: 'QUEUED',
    });

    try {
      await enqueueEmailJob(outboxEvent);
    } catch (err) {
      logger.error(`Failed to enqueue invitation email for ${normalizedEmail}: ${err.message}`);
    }

    if (existingUser) {
      await notificationService.createAndEmit({
        recipientId: existingUser._id,
        organizationId,
        type: NOTIFICATION_TYPE.ORG_INVITATION,
        title: 'Organization Invitation',
        message: `${invitingUser.name} invited you to join "${org.name}" as ${invitation.role}.`,
        metadata: { organizationId, inviteToken: token, role: invitation.role },
      });
    }

    return invitation;
  }

  /**
   * Accept an organization invitation.
   */
  async acceptInvitation(token, authenticatedUser) {
    const invitation = await Invitation.findOne({
      token,
      status: INVITATION_STATUS.PENDING,
    });

    if (!invitation) {
      throw ApiError.badRequest('Invalid or expired invitation token.');
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = INVITATION_STATUS.EXPIRED;
      await invitation.save();
      throw ApiError.badRequest('This invitation has expired.');
    }

    if (authenticatedUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw ApiError.forbidden(
        `This invitation was sent to ${invitation.email}. You are logged in as ${authenticatedUser.email}.`
      );
    }

    // Check if membership already exists
    let member = await OrganizationMember.findOne({
      organizationId: invitation.organizationId,
      userId: authenticatedUser._id,
    });

    if (!member) {
      member = await OrganizationMember.create({
        organizationId: invitation.organizationId,
        userId: authenticatedUser._id,
        role: invitation.role,
        status: MEMBER_STATUS.ACTIVE,
      });
    } else {
      member.status = MEMBER_STATUS.ACTIVE;
      member.role = invitation.role;
      await member.save();
    }

    invitation.status = INVITATION_STATUS.ACCEPTED;
    await invitation.save();

    logger.info(`User ${authenticatedUser.email} joined org ${invitation.organizationId} as ${invitation.role}`);

    return {
      message: 'Invitation accepted successfully.',
      organizationId: invitation.organizationId,
      role: member.role,
    };
  }

  /**
   * Reject an organization invitation.
   */
  async rejectInvitation(token, authenticatedUser) {
    const invitation = await Invitation.findOne({
      token,
      status: INVITATION_STATUS.PENDING,
    });

    if (!invitation) {
      throw ApiError.badRequest('Invalid or expired invitation.');
    }

    if (authenticatedUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw ApiError.forbidden('You are not authorized to reject this invitation.');
    }

    invitation.status = INVITATION_STATUS.REJECTED;
    await invitation.save();

    return { message: 'Invitation rejected.' };
  }

  /**
   * List members of an organization with search and pagination.
   */
  async listMembers(organizationId, query) {
    const { page, limit, skip, sort } = getPaginationParams(query);
    const filter = { organizationId, status: MEMBER_STATUS.ACTIVE };

    if (query.role) {
      filter.role = query.role;
    }

    let memberQuery = OrganizationMember.find(filter)
      .populate('userId', 'name email lastLoginAt')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const [members, totalDocs] = await Promise.all([
      memberQuery.lean(),
      OrganizationMember.countDocuments(filter),
    ]);

    // Optional text filter on populated user fields
    let filteredMembers = members;
    if (query.search) {
      const searchRegex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filteredMembers = members.filter(
        (m) => m.userId && (searchRegex.test(m.userId.name) || searchRegex.test(m.userId.email))
      );
    }

    return {
      members: filteredMembers,
      pagination: createPaginationResponse(totalDocs, page, limit),
    };
  }

  /**
   * Update a member's role within an organization.
   */
  async updateMemberRole(organizationId, memberId, newRole, requestingUserId) {
    const member = await OrganizationMember.findOne({
      _id: memberId,
      organizationId,
    });

    if (!member) {
      throw ApiError.notFound('Member not found in this organization.');
    }

    // Owner check
    const org = await Organization.findById(organizationId);
    if (org.ownerId.toString() === member.userId.toString()) {
      throw ApiError.badRequest('Cannot change the role of the organization owner.');
    }

    member.role = newRole;
    await member.save();

    logger.info(`Member ${memberId} role changed to ${newRole} by ${requestingUserId}`);
    return member;
  }

  /**
   * Remove a member from an organization.
   */
  async removeMember(organizationId, memberId, requestingUserId) {
    const member = await OrganizationMember.findOne({
      _id: memberId,
      organizationId,
    });

    if (!member) {
      throw ApiError.notFound('Member not found in this organization.');
    }

    const org = await Organization.findById(organizationId);
    if (org.ownerId.toString() === member.userId.toString()) {
      throw ApiError.badRequest('The organization owner cannot be removed.');
    }

    await OrganizationMember.deleteOne({ _id: memberId });
    logger.info(`Member ${memberId} removed from organization ${organizationId} by ${requestingUserId}`);

    return { message: 'Member removed successfully.' };
  }

  /**
   * Directly add an already-registered user to an organization with a role (Admin only).
   */
  async addMember(organizationId, { userId, email, role }, requestingUser) {
    const org = await Organization.findOne({ _id: organizationId, isDeleted: false });
    if (!org) {
      throw ApiError.notFound('Organization not found.');
    }

    const targetUser = userId
      ? await User.findById(userId)
      : await User.findOne({ email: email.toLowerCase().trim() });

    if (!targetUser) {
      throw ApiError.notFound('Registered user not found.');
    }

    let member = await OrganizationMember.findOne({
      organizationId,
      userId: targetUser._id,
    });

    if (member) {
      if (member.status === MEMBER_STATUS.ACTIVE) {
        throw ApiError.conflict('User is already an active member of this organization.');
      }
      member.status = MEMBER_STATUS.ACTIVE;
      member.role = role || ROLES.EMPLOYEE;
      await member.save();
    } else {
      member = await OrganizationMember.create({
        organizationId,
        userId: targetUser._id,
        role: role || ROLES.EMPLOYEE,
        status: MEMBER_STATUS.ACTIVE,
      });
    }

    await notificationService.createAndEmit({
      recipientId: targetUser._id,
      organizationId,
      type: NOTIFICATION_TYPE.ROLE_CHANGED,
      title: 'Added to Organization',
      message: `${requestingUser.name} added you to "${org.name}" as ${member.role}.`,
      metadata: { organizationId, role: member.role },
    });

    await member.populate('userId', 'name email');
    logger.info(`User ${targetUser._id} directly added to org ${organizationId} as ${member.role}`);
    return member;
  }

  /**
   * List pending invitations for an organization.
   */
  async listPendingInvitations(organizationId) {
    return Invitation.find({
      organizationId,
      status: INVITATION_STATUS.PENDING,
      expiresAt: { $gt: new Date() },
    })
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
  }
}

export const organizationService = new OrganizationService();

