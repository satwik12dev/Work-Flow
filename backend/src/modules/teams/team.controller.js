import { teamService } from './team.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

class TeamController {
  create = asyncHandler(async (req, res) => {
    const team = await teamService.createTeam(
      req.organizationId,
      req.body,
      req.user._id
    );
    ApiResponse.created(res, 'Team created successfully', { team });
  });

  list = asyncHandler(async (req, res) => {
    const result = await teamService.listTeams(req.organizationId, req.query);
    ApiResponse.success(res, 'Teams retrieved successfully', result);
  });

  getById = asyncHandler(async (req, res) => {
    const team = await teamService.getTeamById(req.organizationId, req.params.id);
    ApiResponse.success(res, 'Team details retrieved successfully', { team });
  });

  update = asyncHandler(async (req, res) => {
    const team = await teamService.updateTeam(
      req.organizationId,
      req.params.id,
      req.body
    );
    ApiResponse.success(res, 'Team updated successfully', { team });
  });

  delete = asyncHandler(async (req, res) => {
    const result = await teamService.deleteTeam(req.organizationId, req.params.id);
    ApiResponse.success(res, result.message);
  });

  addMember = asyncHandler(async (req, res) => {
    const member = await teamService.addMember(
      req.organizationId,
      req.params.id,
      req.body.userId
    );
    ApiResponse.created(res, 'Member added to team successfully', { member });
  });

  removeMember = asyncHandler(async (req, res) => {
    const result = await teamService.removeMember(
      req.organizationId,
      req.params.id,
      req.params.userId
    );
    ApiResponse.success(res, result.message);
  });

  assignManager = asyncHandler(async (req, res) => {
    const team = await teamService.assignManager(
      req.organizationId,
      req.params.id,
      req.body.managerId
    );
    ApiResponse.success(res, 'Team manager assigned successfully', { team });
  });

  getWorkload = asyncHandler(async (req, res) => {
    const result = await teamService.getTeamWorkload(req.organizationId, req.params.id);
    ApiResponse.success(res, 'Team workload retrieved successfully', result);
  });
}

export const teamController = new TeamController();

