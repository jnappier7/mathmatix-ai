// routes/canvas.js
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');

// @desc    Render the main interactive canvas page
// @route   GET /
// @access  Private
router.get('/', isAuthenticated, (req, res) => {
    // This simply renders the EJS view file we are about to create.
    // We can pass user data to the view later if needed.
    res.render('canvas', { user: req.user });
});

module.exports = router;// JavaScript Document