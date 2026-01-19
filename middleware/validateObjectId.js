/**
 * Middleware to validate MongoDB ObjectId parameters
 *
 * Prevents server crashes from invalid ObjectId format in route parameters.
 * Returns 400 Bad Request for invalid IDs instead of 500 Internal Server Error.
 */

const mongoose = require('mongoose');

/**
 * Validates that a route parameter is a valid MongoDB ObjectId
 * @param {string} paramName - The name of the parameter to validate (e.g., 'id', 'userId')
 * @returns {Function} Express middleware function
 */
function validateObjectId(paramName = 'id') {
    return (req, res, next) => {
        const id = req.params[paramName];

        if (!id) {
            return res.status(400).json({
                success: false,
                error: `Missing required parameter: ${paramName}`
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.warn(`Invalid ObjectId format for ${paramName}: ${id}`);
            return res.status(400).json({
                success: false,
                error: `Invalid ${paramName} format`
            });
        }

        // Valid ObjectId - proceed to next middleware
        next();
    };
}

/**
 * Validates multiple ObjectId parameters in a single middleware
 * @param {string[]} paramNames - Array of parameter names to validate
 * @returns {Function} Express middleware function
 */
function validateObjectIds(...paramNames) {
    return (req, res, next) => {
        for (const paramName of paramNames) {
            const id = req.params[paramName];

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required parameter: ${paramName}`
                });
            }

            if (!mongoose.Types.ObjectId.isValid(id)) {
                console.warn(`Invalid ObjectId format for ${paramName}: ${id}`);
                return res.status(400).json({
                    success: false,
                    error: `Invalid ${paramName} format`
                });
            }
        }

        // All IDs valid - proceed to next middleware
        next();
    };
}

/**
 * Validates ObjectIds in request body fields
 * @param {string[]} fieldNames - Array of body field names to validate
 * @returns {Function} Express middleware function
 */
function validateObjectIdsInBody(...fieldNames) {
    return (req, res, next) => {
        for (const fieldName of fieldNames) {
            const id = req.body[fieldName];

            // Skip if field is not present (use express-validator for required checks)
            if (!id) continue;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                console.warn(`Invalid ObjectId format in body field ${fieldName}: ${id}`);
                return res.status(400).json({
                    success: false,
                    error: `Invalid ${fieldName} format`
                });
            }
        }

        // All IDs valid - proceed to next middleware
        next();
    };
}

module.exports = {
    validateObjectId,
    validateObjectIds,
    validateObjectIdsInBody
};
