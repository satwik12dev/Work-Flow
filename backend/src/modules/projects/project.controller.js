import { projectService } from './project.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

class ProjectController {
  create = asyncHandler(async (req, res) => {
    const project = await projectService.createProject(
      req.organizationId,
      req.body,
      req.user._id
    );
    ApiResponse.created(res, 'Project created successfully', { project });
  });

  list = asyncHandler(async (req, res) => {
    const result = await projectService.listProjects(
      req.organizationId,
      req.query,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Projects retrieved successfully', result);
  });

  getById = asyncHandler(async (req, res) => {
    const project = await projectService.getProjectById(
      req.organizationId,
      req.params.id,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Project details retrieved successfully', { project });
  });

  update = asyncHandler(async (req, res) => {
    const project = await projectService.updateProject(
      req.organizationId,
      req.params.id,
      req.body,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Project updated successfully', { project });
  });

  changeStatus = asyncHandler(async (req, res) => {
    const project = await projectService.changeProjectStatus(
      req.organizationId,
      req.params.id,
      req.body.status,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Project status updated successfully', { project });
  });

  delete = asyncHandler(async (req, res) => {
    const result = await projectService.deleteProject(
      req.organizationId,
      req.params.id
    );
    ApiResponse.success(res, result.message);
  });

  addMember = asyncHandler(async (req, res) => {
    const member = await projectService.addMember(
      req.organizationId,
      req.params.id,
      req.body,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.created(res, 'Member added to project successfully', { member });
  });

  removeMember = asyncHandler(async (req, res) => {
    const result = await projectService.removeMember(
      req.organizationId,
      req.params.id,
      req.params.userId,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, result.message);
  });

  assignManager = asyncHandler(async (req, res) => {
    const project = await projectService.assignManager(
      req.organizationId,
      req.params.id,
      req.body.managerId
    );
    ApiResponse.success(res, 'Project manager assigned successfully', { project });
  });
}

export const projectController = new ProjectController();

