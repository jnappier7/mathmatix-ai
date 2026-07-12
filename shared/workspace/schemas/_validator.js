'use strict';
/* ============================================================
   _validator.js — a tiny, dependency-free schema validator
   shared by the Living Math Workspace contracts.

   Why hand-rolled (not zod/ajv): the app is CommonJS on the
   server and Vite-bundled vanilla JS on the client. A plain
   CommonJS module with no deps imports cleanly in BOTH, matching
   the house style of utils/boardResponseSchema.js. See
   docs/BOARD_LIVING_WORKSPACE_SPEC.md §3.4.

   The load-bearing idea: `context`.
     - context:'ingest'  → validating an UNTRUSTED client payload
                           (e.g. POST /api/student-moves). Fields
                           marked serverOnly are REJECTED, and
                           unknown fields are REJECTED. This is how
                           "the client cannot declare its own move
                           mathematically correct" is enforced in code.
     - context:'server'  → internal construction by trusted server
                           code. serverOnly fields are allowed.
   ============================================================ */

function checkType(v, type) {
  switch (type) {
    case 'string':  return typeof v === 'string';
    case 'number':  return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'object':  return v !== null && typeof v === 'object' && !Array.isArray(v);
    case 'array':   return Array.isArray(v);
    // ISO-8601 timestamp string (cheap shape check, not a full parse)
    case 'iso':     return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
    default:        return true; // unknown type spec → don't block
  }
}

/**
 * Build a validator from a rules map.
 * rules: { field: { type?, enum?, required?, default?, serverOnly?, nullable? } }
 * opts:  { name, strict=true }  strict → reject unknown fields.
 */
function makeValidator(name, rules, opts = {}) {
  const strict = opts.strict !== false;
  const known = new Set(Object.keys(rules));

  function validate(input, { context = 'server' } = {}) {
    const errors = [];
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return { valid: false, errors: [`${name}: expected an object`], value: null };
    }

    // strict: reject unknown fields (blocks a client smuggling e.g. mathematicallyValid)
    if (strict) {
      for (const k of Object.keys(input)) {
        if (!known.has(k)) errors.push(`${name}.${k}: unknown field not allowed`);
      }
    }

    const value = {};
    for (const [field, rule] of Object.entries(rules)) {
      const present = input[field] !== undefined && input[field] !== null;

      // server-only fields may never arrive from an untrusted client
      if (rule.serverOnly && context === 'ingest') {
        if (input[field] !== undefined) {
          errors.push(`${name}.${field}: server-authoritative, client may not set it`);
        }
        continue;
      }

      if (!present) {
        if (rule.default !== undefined) value[field] = rule.default;
        else if (rule.required) errors.push(`${name}.${field}: required`);
        continue;
      }

      const v = input[field];
      if (rule.type && !checkType(v, rule.type)) {
        errors.push(`${name}.${field}: expected ${rule.type}`);
        continue;
      }
      if (rule.enum && !rule.enum.includes(v)) {
        errors.push(`${name}.${field}: "${v}" not one of [${rule.enum.join(', ')}]`);
        continue;
      }
      value[field] = v;
    }

    return { valid: errors.length === 0, errors, value: errors.length === 0 ? value : null };
  }

  return { name, rules, validate };
}

module.exports = { makeValidator, checkType };
