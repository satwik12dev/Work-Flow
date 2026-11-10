import { attachmentService } from './attachment.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

class AttachmentController {
  upload = asyncHandler(async (req, res) => {
    const files = req.files || (req.file ? [req.file] : []);
    const attachments = await attachmentService.uploadAttachments(
      req.organizationId,
      req.params.taskId,
      files,
      req.user,
      req.orgMember.role
    );
    ApiResponse.created(res, 'Attachment(s) uploaded successfully', { attachments });
  });

  listByTask = asyncHandler(async (req, res) => {
    const attachments = await attachmentService.listTaskAttachments(
      req.organizationId,
      req.params.taskId,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Task attachments retrieved successfully', { attachments });
  });

  getById = asyncHandler(async (req, res) => {
    const attachment = await attachmentService.getAttachmentById(
      req.organizationId,
      req.params.attachmentId,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Attachment retrieved successfully', { attachment });
  });

  delete = asyncHandler(async (req, res) => {
    const result = await attachmentService.deleteAttachment(
      req.organizationId,
      req.params.attachmentId,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, result.message);
  });
}

export const attachmentController = new AttachmentController();

