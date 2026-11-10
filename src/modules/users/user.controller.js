import { userService } from './user.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

class UserController {
  getProfile = asyncHandler(async (req, res) => {
    const user = await userService.getById(req.user._id);
    ApiResponse.success(res, 'User profile retrieved successfully', { user });
  });

  updateProfile = asyncHandler(async (req, res) => {
    const user = await userService.updateProfile(req.user._id, req.body);
    ApiResponse.success(res, 'Profile updated successfully', { user });
  });

  searchUsers = asyncHandler(async (req, res) => {
    const result = await userService.searchUsers(req.query);
    ApiResponse.success(res, 'Users retrieved successfully', result);
  });
}

export const userController = new UserController();

