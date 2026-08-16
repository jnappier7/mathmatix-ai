// eslint.config.js — ESLint v10 flat config (migrated from .eslintrc.json)
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Global ignores (replaces ignorePatterns)
  {
    ignores: [
      'node_modules/',
      'coverage/',
      'public/vendor/',
      'public/pdfjs-viewer/',
      'public/dist/',   // generated bundles — lint the sources, not the build
      '**/*.min.js',
    ],
  },

  // Base config for all JS files: Node.js + ES2022
  {
    files: ['**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // MERGE the recommended rules — a bare `rules: {...}` after spreading
      // js.configs.recommended REPLACES its rules object entirely, which is
      // how this config silently ran with no-undef (and every other
      // recommended rule) OFF for all server code. That gap let PR #1343
      // ship a route calling resolveTheta() with no require — lint green,
      // every growth-check endpoint 500ing in production (hotfixed in #1347).
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      'no-inner-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'no-misleading-character-class': 'warn',
      'no-control-regex': 'warn',
      // New-in-v10 recommended rules, downgraded to warn while the existing
      // ~40 hits get triaged — they flag smells, not crashes. no-undef and
      // the rest of recommended stay at error: those find real bugs (they
      // caught two live ReferenceErrors the day this merge was fixed).
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-irregular-whitespace': 'warn',
    },
  },

  // Browser-side JS (public/)
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-undef': 'warn',
      'no-func-assign': 'warn',
      'no-redeclare': 'warn',
      'no-cond-assign': 'warn',
      'no-constant-condition': 'warn',
      'no-dupe-class-members': 'warn',
    },
  },

  // k6 load tests (ES modules with __ENV global)
  {
    files: ['tests/load/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        __ENV: 'readonly',
      },
    },
  },

  // Jest test files
  {
    files: ['tests/**/*.js', 'test/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        DOMPurify: 'readonly',
      },
    },
  },

  // Vite config (ES module)
  {
    files: ['vite.config.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },

  // Scripts directory (relaxed rules for one-off utilities)
  {
    files: ['scripts/**/*.js'],
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'warn',
      'no-dupe-keys': 'warn',
      'no-redeclare': 'warn',
      'no-func-assign': 'warn',
      'no-constant-condition': 'warn',
    },
  },

  // Desmos graph route (needs browser globals)
  {
    files: ['routes/graph.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        Desmos: 'readonly',
      },
    },
  },

  // Tutor config (references window for browser detection)
  {
    files: ['utils/tutorConfig.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
      },
    },
  },

  // Mobile verification harness — a Node script that also contains callbacks
  // serialized into the browser by page.evaluate(), so it legitimately needs
  // both sets of globals in one file.
  {
    files: ['tests/mobile/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
];
