// services/cleverApi.js — Clever API v3.0 client
//
// Centralised HTTP helper for all Clever REST calls.
// Used by passport strategy (login-time refresh) and the sync service.

const https = require('https');

const CLEVER_BASE = 'https://api.clever.com/v3.0';

/**
 * Make an authenticated GET request to the Clever API.
 * @param {string} path - API path (e.g. '/me', '/students/abc123')
 * @param {string} accessToken - Bearer token from OAuth flow
 * @returns {Promise<object>} parsed JSON body
 */
function cleverGet(path, accessToken) {
  const url = `${CLEVER_BASE}${path}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            const err = new Error(`Clever API ${res.statusCode}: ${parsed.message || body}`);
            err.status = res.statusCode;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse Clever response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Clever API request timed out'));
    });
  });
}

/**
 * Follow Clever's cursor-based pagination to collect all items.
 * @param {string} path - initial API path (e.g. '/sections/abc/students')
 * @param {string} accessToken
 * @returns {Promise<object[]>} array of data objects across all pages
 */
async function cleverGetAll(path, accessToken) {
  const items = [];
  let nextPath = path;

  while (nextPath) {
    const res = await cleverGet(nextPath, accessToken);
    if (Array.isArray(res.data)) {
      items.push(...res.data);
    }
    // Clever v3.0 pagination: links[].rel === 'next'
    const nextLink = (res.links || []).find(l => l.rel === 'next');
    if (nextLink && nextLink.uri) {
      // URI is absolute; strip the base so cleverGet can prepend it
      nextPath = nextLink.uri.replace(CLEVER_BASE, '');
    } else {
      nextPath = null;
    }
  }
  return items;
}

/* ------------------------------------------------------------------ */
/*  High-level helpers used during login and sync                     */
/* ------------------------------------------------------------------ */

/** GET /me — returns { type, data: { id } } */
async function getMe(accessToken) {
  return cleverGet('/me', accessToken);
}

/** Full user record by type and ID */
async function getUserData(cleverType, cleverId, accessToken) {
  return cleverGet(`/${cleverType}s/${cleverId}`, accessToken);
}

/** Sections for a teacher */
async function getTeacherSections(teacherCleverId, accessToken) {
  return cleverGetAll(`/teachers/${teacherCleverId}/sections`, accessToken);
}

/** Sections for a student */
async function getStudentSections(studentCleverId, accessToken) {
  return cleverGetAll(`/students/${studentCleverId}/sections`, accessToken);
}

/** Students enrolled in a section */
async function getSectionStudents(sectionCleverId, accessToken) {
  return cleverGetAll(`/sections/${sectionCleverId}/students`, accessToken);
}

/** Teachers assigned to a section */
async function getSectionTeachers(sectionCleverId, accessToken) {
  return cleverGetAll(`/sections/${sectionCleverId}/teachers`, accessToken);
}

/** Single section record */
async function getSection(sectionCleverId, accessToken) {
  return cleverGet(`/sections/${sectionCleverId}`, accessToken);
}

/** Schools in a district */
async function getDistrictSchools(districtId, accessToken) {
  return cleverGetAll(`/districts/${districtId}/schools`, accessToken);
}

/** Sections in a school */
async function getSchoolSections(schoolId, accessToken) {
  return cleverGetAll(`/schools/${schoolId}/sections`, accessToken);
}

module.exports = {
  cleverGet,
  cleverGetAll,
  getMe,
  getUserData,
  getTeacherSections,
  getStudentSections,
  getSectionStudents,
  getSectionTeachers,
  getSection,
  getDistrictSchools,
  getSchoolSections
};
