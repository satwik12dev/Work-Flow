import { commentService } from './comment.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

class CommentController {
  create = asyncHandler(async (req, res) => {
    const comment = await commentService.addComment(
      req.organizationId,
      req.params.taskId,
      req.body.content,
      req.user,
      req.orgMember.role
    );
    ApiResponse.created(res, 'Comment added successfully', { comment });
  });

  list = asyncHandler(async (req, res) => {
    const result = await commentService.listComments(
      req.organizationId,
      req.params.taskId,
      req.query,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Comments retrieved successfully', result);
  });

  update = asyncHandler(async (req, res) => {
    const comment = await commentService.updateComment(
      req.organizationId,
      req.params.commentId,
      req.body.content,
      req.user._id
    );
    ApiResponse.success(res, 'Comment updated successfully', { comment });
  });

  delete = asyncHandler(async (req, res) => {
    const result = await commentService.deleteComment(
      req.organizationId,
      req.params.commentId,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, result.message);
  });
}

export const commentController = new CommentController();

