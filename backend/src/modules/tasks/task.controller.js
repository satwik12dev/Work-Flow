import { taskService } from './task.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

class TaskController {
  create = asyncHandler(async (req, res) => {
    const task = await taskService.createTask(
      req.organizationId,
      req.body,
      req.user,
      req.orgMember.role
    );
    ApiResponse.created(res, 'Task created successfully', { task });
  });

  list = asyncHandler(async (req, res) => {
    const result = await taskService.listTasks(
      req.organizationId,
      req.query,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Tasks retrieved successfully', result);
  });

  getProjectTasks = asyncHandler(async (req, res) => {
    const result = await taskService.getProjectTasks(
      req.organizationId,
      req.params.projectId,
      req.query,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Project tasks retrieved successfully', result);
  });

  getMyTasks = asyncHandler(async (req, res) => {
    const result = await taskService.getMyTasks(
      req.organizationId,
      req.query,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Your tasks retrieved successfully', result);
  });

  getById = asyncHandler(async (req, res) => {
    const task = await taskService.getTaskById(
      req.organizationId,
      req.params.id,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Task details retrieved successfully', { task });
  });

  update = asyncHandler(async (req, res) => {
    const task = await taskService.updateTask(
      req.organizationId,
      req.params.id,
      req.body,
      req.user,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Task updated successfully', { task });
  });

  updateStatus = asyncHandler(async (req, res) => {
    const task = await taskService.updateTaskStatus(
      req.organizationId,
      req.params.id,
      req.body.status,
      req.user,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Task status updated successfully', { task });
  });

  assign = asyncHandler(async (req, res) => {
    const task = await taskService.assignTask(
      req.organizationId,
      req.params.id,
      req.body.assignedTo,
      req.user,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Task assignment updated successfully', { task });
  });

  delete = asyncHandler(async (req, res) => {
    const result = await taskService.deleteTask(
      req.organizationId,
      req.params.id,
      req.user,
      req.orgMember.role
    );
    ApiResponse.success(res, result.message);
  });

  getActivity = asyncHandler(async (req, res) => {
    const activity = await taskService.getTaskActivity(
      req.organizationId,
      req.params.id,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Task activity history retrieved', { activity });
  });
}

export const taskController = new TaskController();

