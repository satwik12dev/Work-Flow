/**
 * Extract pagination parameters from Express query object.
 *
 * @param {object} query  req.query
 * @returns {{ page: number, limit: number, skip: number, sort: object }}
 */
export const getPaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  return { page, limit, skip, sort: { [sortBy]: sortOrder } };
};

/**
 * Build a pagination metadata object for API responses.
 *
 * @param {number} totalDocs  Total number of documents matching the query
 * @param {number} page       Current page
 * @param {number} limit      Items per page
 * @returns {object}
 */
export const createPaginationResponse = (totalDocs, page, limit) => {
  const totalPages = Math.ceil(totalDocs / limit);
  return {
    currentPage: page,
    totalPages,
    totalDocs,
    limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

