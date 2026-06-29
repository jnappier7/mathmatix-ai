// ============================================================
// conceptModelCommand.js — the generative long-tail gate
// (CONCEPT_MODELS.md, Build order step 4: "LLM → spec → validate
// → render → measure").
//
// A `model` board command comes in one of two shapes:
//   • CURATED  — { action:'model', model:'slope_intercept_line', … }
//                a name from the hand-built catalog.
//   • GENERATED — { action:'model', spec:'<JSON string>', … }
//                a brand-new spec the LLM authored in the fixed
//                vocabulary, for a concept no curated model covers.
//
// This module is the keystone gate for the generated path: it parses
// the JSON, enforces conservative size bounds (a cheap DoS guard), and
// runs the pure structural validator (public/js/conceptModelSpec.js).
// A spec that doesn't parse, blows the bounds, or references an
// id/param/name that doesn't resolve is DROPPED before it ever reaches
// the renderer — so a generated model "can pick a weird layout but
// cannot display wrong math" (the decision-first guarantee at the
// visual layer). The renderer re-validates client-side too (defense in
// depth); this is the server-side half.
//
// Curated names are checked against the catalog so a typo'd /
// hallucinated name is dropped rather than rendering "Unknown concept
// model" on the board.
//
// Pure (no Mongo / HTTP / env) → unit-testable, identical every call.
// ============================================================

'use strict';

const ConceptModelSpec = require('../public/js/conceptModelSpec');

// Conservative ceilings for a GENERATED spec. Curated specs live in code and
// aren't subject to these; an LLM-authored spec is untrusted input, so we bound
// it. These are generous relative to the curated catalog (the busiest curated
// model, inscribed_angle, has 13 elements) but small enough that a runaway or
// adversarial spec can't balloon the payload or the render.
const LIMITS = {
  specChars: 8000, // raw JSON length — rejects a megabyte blob before JSON.parse
  elements: 40,
  controls: 12,
  params: 24,
  derived: 24,
  measures: 24,
  parents: 12,
};

function objSize(o) {
  return o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).length : 0;
}

// Size ceilings only — structural correctness is the validator's job. Defensive
// against non-object specs (the validator reports those with a clearer message).
function boundsErrors(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return errors;
  if (Array.isArray(spec.elements) && spec.elements.length > LIMITS.elements) {
    errors.push('too many elements (max ' + LIMITS.elements + ')');
  }
  if (Array.isArray(spec.controls) && spec.controls.length > LIMITS.controls) {
    errors.push('too many controls (max ' + LIMITS.controls + ')');
  }
  if (objSize(spec.params) > LIMITS.params) errors.push('too many params (max ' + LIMITS.params + ')');
  if (objSize(spec.derived) > LIMITS.derived) errors.push('too many derived (max ' + LIMITS.derived + ')');
  if (objSize(spec.measures) > LIMITS.measures) errors.push('too many measures (max ' + LIMITS.measures + ')');
  if (objSize(spec.parents) > LIMITS.parents) errors.push('too many parents (max ' + LIMITS.parents + ')');
  return errors;
}

/**
 * Resolve a single `model` command.
 * @param {object} cmd a board command with action === 'model'
 * @returns {{ command: object } | { dropped: string, errors?: string[] }}
 *   On success the returned command has `spec` replaced by the PARSED + validated
 *   object (generated path) or is passed through unchanged (curated path).
 */
// Strip a Markdown code fence (```json … ``` or ``` … ```) that an LLM sometimes
// wraps around the JSON spec. A common, harmless mistake that would otherwise
// fail JSON.parse and drop the whole model — peel it before parsing.
function stripCodeFences(s) {
  const t = String(s).trim();
  const m = t.match(/^```[a-zA-Z0-9]*\s*([\s\S]*?)\s*```$/);
  return m ? m[1].trim() : t;
}

// A curated catalog name on this command that we can fall back to. Returns the
// name or null.
function curatedNameOf(cmd) {
  return (typeof cmd.model === 'string' && ConceptModelSpec.MODELS.indexOf(cmd.model) !== -1)
    ? cmd.model
    : null;
}

// Validate a spec payload (a JSON string or an already-parsed object) and return
// either { spec } (the parsed, validated object) or { reason, errors }.
function validateSpecPayload(rawSpec) {
  let parsed;
  if (typeof rawSpec === 'string') {
    const text = stripCodeFences(rawSpec);
    if (text.length > LIMITS.specChars) return { reason: 'model_spec_too_large' };
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { reason: 'model_spec_unparseable', errors: [e.message] };
    }
  } else {
    parsed = rawSpec; // already an object (renderer-shaped input or a test)
  }
  const bounds = boundsErrors(parsed);
  if (bounds.length) return { reason: 'model_spec_exceeds_limits', errors: bounds };
  const check = ConceptModelSpec.validateModelSpec(parsed);
  if (!check.valid) return { reason: 'model_spec_invalid', errors: check.errors };
  return { spec: parsed };
}

function resolveOne(cmd) {
  const hasSpec = (typeof cmd.spec === 'string' && cmd.spec.trim()) ||
    (cmd.spec && typeof cmd.spec === 'object');

  // GENERATED — a spec the tutor authored. Parse + bound + validate.
  if (hasSpec) {
    const r = validateSpecPayload(cmd.spec);
    if (r.spec) {
      const out = Object.assign({}, cmd, { spec: r.spec });
      // Surface the spec's own name when the command didn't carry one — handy for
      // logging / downstream identity.
      if (!out.model && typeof r.spec.model === 'string') out.model = r.spec.model;
      return { command: out };
    }
    // The generated spec didn't hold up. If the command ALSO names a real curated
    // model, fall back to it rather than dropping the card entirely — the tutor's
    // chat may already reference "this model", so a curated stand-in beats a
    // dangling reference. Otherwise drop with the reason.
    const fallback = curatedNameOf(cmd);
    if (fallback) {
      const out = Object.assign({}, cmd);
      delete out.spec;
      out.model = fallback;
      return { command: out, fallback: r.reason };
    }
    return { dropped: r.reason, errors: r.errors };
  }

  // CURATED — a catalog name. Must resolve to a real model.
  if (typeof cmd.model === 'string' && cmd.model) {
    if (ConceptModelSpec.MODELS.indexOf(cmd.model) === -1) {
      return { dropped: 'model_unknown_name' };
    }
    return { command: cmd };
  }

  return { dropped: 'model_missing_spec_and_name' };
}

/**
 * Resolve every `model` command in a board-command list: validate generated
 * specs, check curated names, drop the ones that don't hold up. Non-model
 * commands pass through untouched and in order.
 *
 * @param {Array<object>} commands
 * @returns {{ commands: Array<object>, dropped: Array<{command,reason,errors?}>, fallbacks: Array<{command,reason}> }}
 *   `fallbacks` are commands whose generated spec failed but that fell back to a
 *   curated name (rendered, but worth logging that the spec was rejected).
 */
function resolveModelCommands(commands) {
  const out = [];
  const dropped = [];
  const fallbacks = [];
  if (!Array.isArray(commands)) return { commands: out, dropped, fallbacks };
  for (const cmd of commands) {
    if (!cmd || cmd.action !== 'model') { out.push(cmd); continue; }
    const r = resolveOne(cmd);
    if (r.command) {
      out.push(r.command);
      if (r.fallback) fallbacks.push({ command: r.command, reason: r.fallback });
    } else {
      dropped.push({ command: cmd, reason: r.dropped, errors: r.errors });
    }
  }
  return { commands: out, dropped, fallbacks };
}

module.exports = {
  resolveModelCommands,
  LIMITS,
};
