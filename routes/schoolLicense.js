// routes/schoolLicense.js — Admin endpoints for school/district license management
//
// All routes require admin role.
//
// Endpoints:
//   GET    /api/school-licenses              — List all licenses
//   GET    /api/school-licenses/:id          — Get single license with teacher list
//   POST   /api/school-licenses              — Create a new license
//   PUT    /api/school-licenses/:id          — Update license details
//   POST   /api/school-licenses/:id/teachers — Add teachers to a license
//   DELETE /api/school-licenses/:id/teachers/:teacherId — Remove teacher from license
//   POST   /api/school-licenses/:id/propagate — Push license to all students under licensed teachers

const express = require('express');
const router = express.Router();
const SchoolLicense = require('../models/schoolLicense');
const User = require('../models/user');

// =====================================================
// GET / — List all school licenses
// =====================================================
router.get('/', async (req, res) => {
  try {
    const licenses = await SchoolLicense.find()
      .sort({ createdAt: -1 })
      .populate('adminUserId', 'firstName lastName email')
      .lean();

    res.json({ success: true, licenses });
  } catch (error) {
    console.error('[SchoolLicense] List error:', error.message);
    res.status(500).json({ message: 'Failed to list licenses' });
  }
});

// =====================================================
// GET /:id — Get single license with teacher details
// =====================================================
router.get('/:id', async (req, res) => {
  try {
    const license = await SchoolLicense.findById(req.params.id)
      .populate('adminUserId', 'firstName lastName email')
      .populate('teacherIds', 'firstName lastName email')
      .lean();

    if (!license) return res.status(404).json({ message: 'License not found' });

    // Count students covered by this license
    const studentCount = await User.countDocuments({ schoolLicenseId: license._id });
    license.currentStudentCount = studentCount;

    res.json({ success: true, license });
  } catch (error) {
    console.error('[SchoolLicense] Get error:', error.message);
    res.status(500).json({ message: 'Failed to get license' });
  }
});

// =====================================================
// POST / — Create a new school license
// Body: { schoolName, districtName?, tier, expiresAt, adminEmail?, contactName?, contactEmail?, notes? }
// =====================================================
router.post('/', async (req, res) => {
  try {
    const { schoolName, districtName, districtId, schoolId, tier, expiresAt,
            adminEmail, contactName, contactEmail, contactPhone, notes } = req.body;

    if (!schoolName || !tier) {
      return res.status(400).json({ message: 'schoolName and tier are required' });
    }

    const tierConfig = SchoolLicense.TIERS[tier];
    if (!tierConfig) {
      return res.status(400).json({ message: `Invalid tier. Choose: ${Object.keys(SchoolLicense.TIERS).join(', ')}` });
    }

    // Default expiry: 1 year from now
    const expiry = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const license = new SchoolLicense({
      schoolName,
      districtName: districtName || null,
      districtId: districtId || null,
      schoolId: schoolId || null,
      tier,
      maxStudents: tierConfig.maxStudents,
      annualPriceCents: tierConfig.annualPriceCents,
      status: 'active',
      startsAt: new Date(),
      expiresAt: expiry,
      adminEmail: adminEmail || null,
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      notes: notes || null
    });

    await license.save();
    console.log(`[SchoolLicense] Created ${tier} license for "${schoolName}" (expires ${expiry.toISOString().slice(0, 10)})`);

    res.status(201).json({ success: true, license });
  } catch (error) {
    console.error('[SchoolLicense] Create error:', error.message);
    res.status(500).json({ message: 'Failed to create license' });
  }
});

// =====================================================
// PUT /:id — Update license details
// Body: any of { schoolName, districtName, tier, status, expiresAt, maxStudents, notes }
// =====================================================
router.put('/:id', async (req, res) => {
  try {
    const license = await SchoolLicense.findById(req.params.id);
    if (!license) return res.status(404).json({ message: 'License not found' });

    const allowedFields = ['schoolName', 'districtName', 'districtId', 'schoolId',
                           'tier', 'status', 'expiresAt', 'maxStudents',
                           'adminEmail', 'contactName', 'contactEmail', 'contactPhone', 'notes'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        license[field] = req.body[field];
      }
    }

    // If tier changed, update maxStudents from tier config
    if (req.body.tier && !req.body.maxStudents) {
      const tierConfig = SchoolLicense.TIERS[req.body.tier];
      if (tierConfig) license.maxStudents = tierConfig.maxStudents;
    }

    await license.save();
    res.json({ success: true, license });
  } catch (error) {
    console.error('[SchoolLicense] Update error:', error.message);
    res.status(500).json({ message: 'Failed to update license' });
  }
});

// =====================================================
// POST /:id/teachers — Add teachers to a license
// Body: { teacherIds: [ObjectId, ...] } or { teacherEmail: "teacher@school.edu" }
// =====================================================
router.post('/:id/teachers', async (req, res) => {
  try {
    const license = await SchoolLicense.findById(req.params.id);
    if (!license) return res.status(404).json({ message: 'License not found' });

    let teacherIdsToAdd = [];

    if (req.body.teacherIds) {
      teacherIdsToAdd = Array.isArray(req.body.teacherIds) ? req.body.teacherIds : [req.body.teacherIds];
    } else if (req.body.teacherEmail) {
      const teacher = await User.findOne({ email: req.body.teacherEmail, role: 'teacher' });
      if (!teacher) return res.status(404).json({ message: `No teacher found with email: ${req.body.teacherEmail}` });
      teacherIdsToAdd = [teacher._id];
    } else {
      return res.status(400).json({ message: 'Provide teacherIds array or teacherEmail' });
    }

    // Add teachers to license (avoid duplicates)
    const existingIds = new Set(license.teacherIds.map(id => id.toString()));
    const newIds = teacherIdsToAdd.filter(id => !existingIds.has(id.toString()));

    if (newIds.length === 0) {
      return res.json({ success: true, message: 'Teachers already on this license', added: 0 });
    }

    license.teacherIds.push(...newIds);
    await license.save();

    // Set schoolLicenseId on teacher accounts too
    await User.updateMany(
      { _id: { $in: newIds } },
      { $set: { schoolLicenseId: license._id } }
    );

    console.log(`[SchoolLicense] Added ${newIds.length} teacher(s) to "${license.schoolName}"`);
    res.json({ success: true, added: newIds.length, totalTeachers: license.teacherIds.length });
  } catch (error) {
    console.error('[SchoolLicense] Add teachers error:', error.message);
    res.status(500).json({ message: 'Failed to add teachers' });
  }
});

// =====================================================
// DELETE /:id/teachers/:teacherId — Remove teacher from license
// Also removes schoolLicenseId from the teacher and their students
// =====================================================
router.delete('/:id/teachers/:teacherId', async (req, res) => {
  try {
    const license = await SchoolLicense.findById(req.params.id);
    if (!license) return res.status(404).json({ message: 'License not found' });

    const teacherId = req.params.teacherId;
    license.teacherIds = license.teacherIds.filter(id => id.toString() !== teacherId);
    await license.save();

    // Remove license from teacher
    await User.findByIdAndUpdate(teacherId, { $set: { schoolLicenseId: null } });

    // Remove license from students under this teacher
    const result = await User.updateMany(
      { teacherId: teacherId, schoolLicenseId: license._id },
      { $set: { schoolLicenseId: null } }
    );

    console.log(`[SchoolLicense] Removed teacher ${teacherId} from "${license.schoolName}" (${result.modifiedCount} students affected)`);
    res.json({ success: true, studentsAffected: result.modifiedCount });
  } catch (error) {
    console.error('[SchoolLicense] Remove teacher error:', error.message);
    res.status(500).json({ message: 'Failed to remove teacher' });
  }
});

// =====================================================
// POST /:id/propagate — Push license to all students under licensed teachers
// This sets schoolLicenseId on every student whose teacherId is in the license.
// Run after adding teachers, or periodically to catch new enrollments.
// =====================================================
router.post('/:id/propagate', async (req, res) => {
  try {
    const license = await SchoolLicense.findById(req.params.id);
    if (!license) return res.status(404).json({ message: 'License not found' });

    if (!license.isValid()) {
      return res.status(400).json({ message: 'License is not active' });
    }

    // Find all students under any of the licensed teachers
    const result = await User.updateMany(
      {
        teacherId: { $in: license.teacherIds },
        role: 'student',
        schoolLicenseId: { $ne: license._id }  // Only update those not already set
      },
      { $set: { schoolLicenseId: license._id } }
    );

    // Update student count
    const totalStudents = await User.countDocuments({ schoolLicenseId: license._id, role: 'student' });
    license.currentStudentCount = totalStudents;
    await license.save();

    console.log(`[SchoolLicense] Propagated "${license.schoolName}" to ${result.modifiedCount} new students (${totalStudents} total)`);
    res.json({
      success: true,
      newStudentsLicensed: result.modifiedCount,
      totalStudentsLicensed: totalStudents,
      maxStudents: license.maxStudents,
      capacityUsed: `${Math.round((totalStudents / license.maxStudents) * 100)}%`
    });
  } catch (error) {
    console.error('[SchoolLicense] Propagate error:', error.message);
    res.status(500).json({ message: 'Failed to propagate license' });
  }
});

module.exports = router;
