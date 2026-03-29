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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      'no-inner-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'no-misleading-character-class': 'warn',
      'no-control-regex': 'warn',
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
];
