/**
 * IEP Templates Routes
 *
 * Provides API endpoints for teachers to:
 * - Browse accommodation and goal templates
 * - Apply templates to student IEPs
 * - Filter templates by grade level and category
 *
 * @module routes/iepTemplates
 */

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { isTeacher } = require('../middleware/auth');
const {
    getAccommodationTemplates,
    getAccommodationTemplate,
    getGoalTemplates,
    getGoalTemplate,
    getGoalTemplatesByGrade,
    getGoalTemplatesByCategory,
    applyAccommodationTemplate,
    applyGoalTemplate,
    getTemplateCategories
} = require('../utils/iepTemplates');

/**
 * GET /api/iep-templates/categories
 * Get all template categories
 */
router.get('/categories', isTeacher, (req, res) => {
    try {
        const categories = getTemplateCategories();
        res.json({
            success: true,
            categories
        });
    } catch (error) {
        console.error('[IEP Templates] Error getting categories:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching template categories'
        });
    }
});

/**
 * GET /api/iep-templates/accommodations
 * Get all accommodation templates
 */
router.get('/accommodations', isTeacher, (req, res) => {
    try {
        const { category } = req.query;
        let templates = getAccommodationTemplates();

        if (category) {
            templates = templates.filter(t => t.category === category);
        }

        res.json({
            success: true,
            templates
        });
    } catch (error) {
        console.error('[IEP Templates] Error getting accommodation templates:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching accommodation templates'
        });
    }
});

/**
 * GET /api/iep-templates/accommodations/:templateId
 * Get a specific accommodation template
 */
router.get('/accommodations/:templateId', isTeacher, (req, res) => {
    try {
        const template = getAccommodationTemplate(req.params.templateId);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        res.json({
            success: true,
            template
        });
    } catch (error) {
        console.error('[IEP Templates] Error getting accommodation template:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching accommodation template'
        });
    }
});

/**
 * GET /api/iep-templates/goals
 * Get all goal templates, optionally filtered
 */
router.get('/goals', isTeacher, (req, res) => {
    try {
        const { gradeLevel, category } = req.query;
        let templates;

        if (gradeLevel) {
            templates = getGoalTemplatesByGrade(gradeLevel);
        } else if (category) {
            templates = getGoalTemplatesByCategory(category);
        } else {
            templates = getGoalTemplates();
        }

        res.json({
            success: true,
            templates
        });
    } catch (error) {
        console.error('[IEP Templates] Error getting goal templates:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching goal templates'
        });
    }
});

/**
 * GET /api/iep-templates/goals/:templateId
 * Get a specific goal template
 */
router.get('/goals/:templateId', isTeacher, (req, res) => {
    try {
        const template = getGoalTemplate(req.params.templateId);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        res.json({
            success: true,
            template
        });
    } catch (error) {
        console.error('[IEP Templates] Error getting goal template:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching goal template'
        });
    }
});

/**
 * POST /api/iep-templates/apply/accommodations/:studentId
 * Apply an accommodation template to a student's IEP
 */
router.post('/apply/accommodations/:studentId', isTeacher, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { templateId, merge = true } = req.body;

        if (!templateId) {
            return res.status(400).json({
                success: false,
                message: 'Template ID is required'
            });
        }

        // Verify teacher has access to this student
        const student = await User.findOne({
            _id: studentId,
            role: 'student',
            teacherId: req.user._id
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found or not assigned to you'
            });
        }

        // Initialize IEP if needed
        if (!student.iepPlan) {
            student.iepPlan = { accommodations: {}, goals: [] };
        }

        // Apply template
        const newAccommodations = applyAccommodationTemplate(
            student.iepPlan,
            templateId,
            merge
        );

        // Track history
        const historyEntry = {
            date: new Date(),
            editorId: req.user._id,
            field: 'accommodations',
            from: student.iepPlan.accommodations,
            to: newAccommodations,
            templateApplied: templateId
        };

        // Update student
        student.iepPlan.accommodations = newAccommodations;

        // Add to any existing goal history if there are goals
        if (student.iepPlan.goals && student.iepPlan.goals.length > 0) {
            // We'll track template application in the first goal's history
            if (!student.iepPlan.goals[0].history) {
                student.iepPlan.goals[0].history = [];
            }
            student.iepPlan.goals[0].history.push({
                date: new Date(),
                editorId: req.user._id,
                field: 'accommodations_template',
                from: null,
                to: templateId
            });
        }

        await student.save();

        const template = getAccommodationTemplate(templateId);

        res.json({
            success: true,
            message: `Applied "${template.name}" template to ${student.firstName}'s IEP`,
            accommodations: newAccommodations
        });
    } catch (error) {
        console.error('[IEP Templates] Error applying accommodation template:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error applying template'
        });
    }
});

/**
 * POST /api/iep-templates/apply/goals/:studentId
 * Apply a goal template to a student's IEP
 */
router.post('/apply/goals/:studentId', isTeacher, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { templateId, replace = false } = req.body;

        if (!templateId) {
            return res.status(400).json({
                success: false,
                message: 'Template ID is required'
            });
        }

        // Verify teacher has access to this student
        const student = await User.findOne({
            _id: studentId,
            role: 'student',
            teacherId: req.user._id
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found or not assigned to you'
            });
        }

        // Initialize IEP if needed
        if (!student.iepPlan) {
            student.iepPlan = { accommodations: {}, goals: [] };
        }

        const previousGoalsCount = student.iepPlan.goals?.length || 0;

        // Apply template
        const newGoals = applyGoalTemplate(
            student.iepPlan,
            templateId,
            replace
        );

        student.iepPlan.goals = newGoals;
        await student.save();

        const template = getGoalTemplate(templateId);
        const addedCount = newGoals.length - (replace ? 0 : previousGoalsCount);

        res.json({
            success: true,
            message: `Added ${addedCount} goals from "${template.name}" template to ${student.firstName}'s IEP`,
            goals: newGoals,
            addedCount
        });
    } catch (error) {
        console.error('[IEP Templates] Error applying goal template:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error applying template'
        });
    }
});

/**
 * GET /api/iep-templates/recommended/:studentId
 * Get recommended templates based on student profile
 */
router.get('/recommended/:studentId', isTeacher, async (req, res) => {
    try {
        const { studentId } = req.params;

        // Verify teacher has access to this student
        const student = await User.findOne({
            _id: studentId,
            role: 'student',
            teacherId: req.user._id
        }, 'firstName lastName gradeLevel learningProfile iepPlan');

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found or not assigned to you'
            });
        }

        const recommendations = {
            accommodations: [],
            goals: []
        };

        // Recommend accommodations based on learning profile
        if (student.learningProfile) {
            if (student.learningProfile.mathAnxietyLevel >= 7) {
                recommendations.accommodations.push(getAccommodationTemplate('math-anxiety'));
            }
            if (student.learningProfile.frustrationTolerance === 'low') {
                recommendations.accommodations.push(getAccommodationTemplate('adhd'));
            }
        }

        // Recommend goals based on grade level
        if (student.gradeLevel) {
            const gradeGoals = getGoalTemplatesByGrade(student.gradeLevel);
            recommendations.goals = gradeGoals.slice(0, 3); // Top 3 recommendations
        }

        // Always include minimal accommodations as a fallback
        if (recommendations.accommodations.length === 0) {
            recommendations.accommodations.push(getAccommodationTemplate('minimal'));
        }

        res.json({
            success: true,
            student: {
                _id: student._id,
                firstName: student.firstName,
                lastName: student.lastName,
                gradeLevel: student.gradeLevel
            },
            recommendations
        });
    } catch (error) {
        console.error('[IEP Templates] Error getting recommendations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recommendations'
        });
    }
});

module.exports = router;
