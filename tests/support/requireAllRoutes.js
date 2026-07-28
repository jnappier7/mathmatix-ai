// tests/support/requireAllRoutes.js
//
// Boot probe: require() every module under routes/ and services/, in a plain
// child process. Run by tests/unit/routeSmoke.test.js — NOT under jest itself,
// because heavy require graphs inside jest's module registry proved capable of
// hanging the whole run, and a child process both stays fast and can be given
// a hard timeout. Prints REQ/OK per file, so on a failure the last REQ line
// names the exact module that threw.
//
// This catches require-time breakage: bad paths, syntax errors that dodge
// lint, top-level throws, circular-dependency explosions. It does NOT catch
// a missing import used inside a handler (a ReferenceError at request time) —
// that class is caught by eslint's no-undef, restored the same day this probe
// landed. The two are a pair; neither alone would have caught both real bugs.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');

function jsFilesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return jsFilesUnder(p);
    return e.isFile() && e.name.endsWith('.js') ? [p] : [];
  });
}

const targets = [
  ...jsFilesUnder(path.join(root, 'routes')),
  ...jsFilesUnder(path.join(root, 'services')),
];

for (const file of targets) {
  const rel = path.relative(root, file);
  process.stdout.write(`REQ ${rel}\n`);
  require(file);
  process.stdout.write(`OK  ${rel}\n`);
}

process.stdout.write(`ALL DONE (${targets.length} modules)\n`);
process.exit(0); // don't wait on any timers/handles a module opened
