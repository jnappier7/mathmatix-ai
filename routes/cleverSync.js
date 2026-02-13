// routes/cleverSync.js — Admin endpoints for Clever roster & section management
//
// All routes are mounted under /api/clever-sync and require admin auth.
// Provides:
//   GET  /sections              — list all synced sections (with filters)
//   GET  /sections/:id          — single section with full roster
//   POST /sync/school/:licenseId — trigger full roster sync for a school license
//   POST /webhook               — Clever event webhook receiver

const express = require('express');
const router  = express.Router();
const Section        = require('../models/section');
const SchoolLicense  = require('../models/schoolLicense');
const User           = require('../models/user');
const { syncSchoolRosters } = require('../services/cleverSync');

/* ------------------------------------------------------------------ */
/*  GET /sections — list sections with optional filters               */
/* ------------------------------------------------------------------ */
router.get('/sections', async (req, res) => {
  try {
    const query = {};

    // Filter by teacher
    if (req.query.teacherId) query.teacherId = req.query.teacherId;

    // Filter by school license
    if (req.query.licenseId) query.schoolLicenseId = req.query.licenseId;

    // Filter by Clever district
    if (req.query.districtId) query.cleverDistrictId = req.query.districtId;

    // Filter by grade
    if (req.query.grade) query.grade = req.query.grade;

    const sections = await Section.find(query)
      .populate('teacherId', 'firstName lastName username email')
      .sort({ name: 1 })
      .lean();

    // Compute active student count for each section
    const result = sections.map(s => ({
      ...s,
      activeStudentCount: (s.students || []).filter(st => !st.removedAt).length,
      totalStudentCount: (s.students || []).length
    }));

    res.json({ success: true, sections: result, count: result.length });
  } catch (err) {
    console.error('ERROR [GET /clever-sync/sections]:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch sections.' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /sections/:id — single section with populated roster          */
/* ------------------------------------------------------------------ */
router.get('/sections/:id', async (req, res) => {
  try {
    const section = await Section.findById(req.params.id)
      .populate('teacherId', 'firstName lastName username email')
      .populate('students.studentId', 'firstName lastName username email gradeLevel lastLogin')
      .populate('schoolLicenseId', 'schoolName tier status')
      .lean();

    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    // Split active vs removed students
    section.activeStudents = (section.students || []).filter(s => !s.removedAt);
    section.removedStudents = (section.students || []).filter(s => s.removedAt);

    res.json({ success: true, section });
  } catch (err) {
    console.error('ERROR [GET /clever-sync/sections/:id]:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch section.' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /sync/school/:licenseId — full roster sync for a school      */
/* ------------------------------------------------------------------ */
router.post('/sync/school/:licenseId', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Clever access token is required. Obtain one via district admin OAuth or Clever dashboard.'
      });
    }

    const license = await SchoolLicense.findById(req.params.licenseId);
    if (!license) {
      return res.status(404).json({ success: false, message: 'School license not found.' });
    }

    if (!license.schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School license has no Clever schoolId. Link it first via the license edit page.'
      });
    }

    console.log(`LOG: Admin-triggered Clever sync for school "${license.schoolName}" (${license.schoolId})`);

    const result = await syncSchoolRosters(license, accessToken);

    console.log(`LOG: Clever sync complete: ${result.sectionsProcessed} sections, +${result.studentsAdded}/-${result.studentsRemoved} students, ${result.errors.length} errors`);

    res.json({
      success: true,
      message: `Synced ${result.sectionsProcessed} sections.`,
      ...result
    });
  } catch (err) {
    console.error('ERROR [POST /clever-sync/sync/school]:', err);
    res.status(500).json({ success: false, message: 'Sync failed.', error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /stats — summary stats for Clever integration                 */
/* ------------------------------------------------------------------ */
router.get('/stats', async (req, res) => {
  try {
    const [
      totalSections,
      totalCleverStudents,
      totalCleverTeachers,
      licensesWithClever
    ] = await Promise.all([
      Section.countDocuments(),
      User.countDocuments({ cleverId: { $exists: true, $ne: null }, role: 'student' }),
      User.countDocuments({ cleverId: { $exists: true, $ne: null }, role: 'teacher' }),
      SchoolLicense.countDocuments({ schoolId: { $exists: true, $ne: null } })
    ]);

    // Most recent sync
    const lastSync = await Section.findOne()
      .sort({ lastSyncedAt: -1 })
      .select('lastSyncedAt syncSource name')
      .lean();

    res.json({
      success: true,
      stats: {
        totalSections,
        totalCleverStudents,
        totalCleverTeachers,
        licensesWithClever,
        lastSync: lastSync ? {
          at: lastSync.lastSyncedAt,
          source: lastSync.syncSource,
          section: lastSync.name
        } : null
      }
    });
  } catch (err) {
    console.error('ERROR [GET /clever-sync/stats]:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /webhook — Clever event webhook (roster changes, etc.)       */
/*  See: https://dev.clever.com/docs/webhooks                        */
/* ------------------------------------------------------------------ */
router.post('/webhook', async (req, res) => {
  try {
    const events = req.body?.data?.events || req.body?.events || [];

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(200).json({ success: true, message: 'No events to process.' });
    }

    let processed = 0;

    for (const event of events) {
      const { type, data } = event;

      // Handle student enrollment/unenrollment events
      if (type === 'students.created' || type === 'students.updated') {
        const studentInfo = data?.object || {};
        const cleverId = studentInfo.id;
        if (!cleverId) continue;

        const existingUser = await User.findOne({ cleverId });
        if (existingUser) {
          // Update profile fields
          if (studentInfo.name?.first) existingUser.firstName = studentInfo.name.first;
          if (studentInfo.name?.last)  existingUser.lastName  = studentInfo.name.last;
          if (studentInfo.email)       existingUser.email     = studentInfo.email;
          if (studentInfo.grade) {
            const gradeMap = {
              '1': '1st Grade', '2': '2nd Grade', '3': '3rd Grade',
              '4': '4th Grade', '5': '5th Grade', '6': '6th Grade',
              '7': '7th Grade', '8': '8th Grade', '9': '9th Grade',
              '10': '10th Grade', '11': '11th Grade', '12': '12th Grade'
            };
            existingUser.gradeLevel = gradeMap[studentInfo.grade] || studentInfo.grade;
          }
          existingUser.name = `${existingUser.firstName} ${existingUser.lastName}`.trim();
          await existingUser.save();
          processed++;
        }
      }

      if (type === 'students.deleted') {
        const cleverId = data?.object?.id;
        if (!cleverId) continue;

        // Soft-remove from all sections
        await Section.updateMany(
          { 'students.cleverId': cleverId, 'students.removedAt': null },
          { $set: { 'students.$.removedAt': new Date() } }
        );
        processed++;
      }

      if (type === 'sections.updated') {
        const sectionInfo = data?.object || {};
        const sectionCleverId = sectionInfo.id;
        if (!sectionCleverId) continue;

        const section = await Section.findOne({ cleverSectionId: sectionCleverId });
        if (section) {
          if (sectionInfo.name)    section.name    = sectionInfo.name;
          if (sectionInfo.subject) section.subject = sectionInfo.subject;
          if (sectionInfo.course)  section.course  = sectionInfo.course;
          if (sectionInfo.grade)   section.grade   = sectionInfo.grade;
          if (sectionInfo.period)  section.period  = sectionInfo.period;
          section.lastSyncedAt = new Date();
          section.syncSource   = 'webhook';
          await section.save();
          processed++;
        }
      }

      if (type === 'sections.deleted') {
        const sectionCleverId = data?.object?.id;
        if (!sectionCleverId) continue;

        // Soft-remove all students in the deleted section
        await Section.updateOne(
          { cleverSectionId: sectionCleverId },
          {
            $set: {
              'students.$[active].removedAt': new Date(),
              lastSyncedAt: new Date(),
              syncSource: 'webhook'
            }
          },
          { arrayFilters: [{ 'active.removedAt': null }] }
        );
        processed++;
      }
    }

    console.log(`LOG: Clever webhook processed ${processed}/${events.length} events`);
    res.status(200).json({ success: true, processed });
  } catch (err) {
    console.error('ERROR [POST /clever-sync/webhook]:', err);
    // Always return 200 to Clever so they don't retry indefinitely
    res.status(200).json({ success: false, message: err.message });
  }
});

module.exports = router;
