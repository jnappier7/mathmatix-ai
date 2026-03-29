// middleware/requestId.js — Assigns a unique request ID early in the pipeline for tracing
const crypto = require('crypto');

function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = { requestId };
