import { organizationService } from './organization.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

class OrganizationController {
  create = asyncHandler(async (req, res) => {
    const result = await organizationService.createOrganization(req.body, req.user._id);
    ApiResponse.created(res, 'Organization created successfully', result);
  });

  getMyOrganizations = asyncHandler(async (req, res) => {
    const organizations = await organizationService.getUserOrganizations(req.user._id);
    ApiResponse.success(res, 'User organizations retrieved successfully', { organizations });
  });

  getById = asyncHandler(async (req, res) => {
    const organization = await organizationService.getOrganizationById(req.params.id);
    ApiResponse.success(res, 'Organization details retrieved successfully', { organization });
  });

  update = asyncHandler(async (req, res) => {
    const organization = await organizationService.updateOrganization(req.params.id, req.body);
    ApiResponse.success(res, 'Organization updated successfully', { organization });
  });

  delete = asyncHandler(async (req, res) => {
    const result = await organizationService.deleteOrganization(req.params.id, req.user._id);
    ApiResponse.success(res, result.message);
  });

  inviteMember = asyncHandler(async (req, res) => {
    const invitation = await organizationService.inviteMember(req.params.id, req.body, req.user);
    ApiResponse.created(res, 'Invitation sent successfully', { invitation });
  });

  listInvitations = asyncHandler(async (req, res) => {
    const invitations = await organizationService.listPendingInvitations(req.params.id);
    ApiResponse.success(res, 'Pending invitations retrieved', { invitations });
  });

  acceptInvitation = asyncHandler(async (req, res) => {
    const result = await organizationService.acceptInvitation(req.params.token, req.user);
    ApiResponse.success(res, result.message, result);
  });

  rejectInvitation = asyncHandler(async (req, res) => {
    const result = await organizationService.rejectInvitation(req.params.token, req.user);
    ApiResponse.success(res, result.message);
  });

  listMembers = asyncHandler(async (req, res) => {
    const result = await organizationService.listMembers(req.params.id, req.query);
    ApiResponse.success(res, 'Organization members retrieved successfully', result);
  });

  addMember = asyncHandler(async (req, res) => {
    const member = await organizationService.addMember(req.params.id, req.body, req.user);
    ApiResponse.created(res, 'Member added to organization successfully', { member });
  });

  updateMemberRole = asyncHandler(async (req, res) => {
    const member = await organizationService.updateMemberRole(
      req.params.id,
      req.params.memberId,
      req.body.role,
      req.user._id
    );
    ApiResponse.success(res, 'Member role updated successfully', { member });
  });

  removeMember = asyncHandler(async (req, res) => {
    const result = await organizationService.removeMember(
      req.params.id,
      req.params.memberId,
      req.user._id
    );
    ApiResponse.success(res, result.message);
  });
}

export const organizationController = new OrganizationController();

