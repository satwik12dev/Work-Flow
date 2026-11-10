/**
 * Standardized API response wrapper.
 */
export class ApiResponse {
  /**
   * @param {number}      statusCode
   * @param {string}      message
   * @param {object|null} data
   */
  constructor(statusCode, message, data = null) {
    this.success = statusCode < 400;
    this.message = message;
    if (data !== null && data !== undefined) {
      this.data = data;
    }
  }

  // ── Static Helpers ───────────────────────────────────────────

  /**
   * 200 OK
   */
  static success(res, message, data = null, statusCode = 200) {
    return res.status(statusCode).json(new ApiResponse(statusCode, message, data));
  }

  /**
   * 201 Created
   */
  static created(res, message, data = null) {
    return res.status(201).json(new ApiResponse(201, message, data));
  }

  /**
   * 204 No Content
   */
  static noContent(res) {
    return res.status(204).end();
  }
}

