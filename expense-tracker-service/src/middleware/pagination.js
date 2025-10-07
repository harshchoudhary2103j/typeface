// Pagination middleware
const paginate = (req, res, next) => {
  // TODO: Implement pagination logic
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  
  // Validate pagination parameters
  if (page < 1) {
    return res.status(400).json({
      success: false,
      message: 'Page number must be greater than 0'
    });
  }
  
  if (limit < 1 || limit > 100) {
    return res.status(400).json({
      success: false,
      message: 'Limit must be between 1 and 100'
    });
  }
  
  const offset = (page - 1) * limit;
  
  // Add pagination info to request
  req.pagination = {
    page,
    limit,
    offset
  };
  
  next();
};

// Add pagination metadata to response
const addPaginationMeta = (totalCount, page, limit) => {
  const totalPages = Math.ceil(totalCount / limit);
  
  return {
    page,
    limit,
    totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
};

module.exports = {
  paginate,
  addPaginationMeta
};