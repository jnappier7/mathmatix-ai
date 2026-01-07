# Testing Guide

This directory contains automated tests for the Mathmatix AI application.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create test environment file:**
   ```bash
   cp .env.test.example .env.test
   ```

3. **Set up test database:**
   - Use a separate MongoDB database for testing (e.g., `mathmatix_test`)
   - Update `MONGO_URI` in `.env.test`

## Running Tests

### Run all tests:
```bash
npm test
```

### Run tests in watch mode (auto-rerun on file changes):
```bash
npm run test:watch
```

### Run only unit tests:
```bash
npm run test:unit
```

### Run only integration tests:
```bash
npm run test:integration
```

### Generate coverage report:
```bash
npm test
# Coverage report will be generated in ./coverage/
# Open ./coverage/index.html in your browser to view detailed coverage
```

## Test Structure

```
tests/
├── setup.js              # Global test setup and configuration
├── helpers/              # Shared test utilities and mocks
├── unit/                 # Unit tests (isolated function/module tests)
│   ├── auth.test.js      # Authentication middleware tests
│   ├── irt.test.js       # IRT calculation tests
│   └── ...
└── integration/          # Integration tests (API endpoint tests)
    ├── passwordReset.test.js
    └── ...
```

## Writing Tests

### Unit Tests
Unit tests test individual functions or modules in isolation:

```javascript
// tests/unit/example.test.js
const { myFunction } = require('../../utils/myModule');

describe('myFunction', () => {
  test('should return expected output', () => {
    const result = myFunction(input);
    expect(result).toBe(expectedOutput);
  });
});
```

### Integration Tests
Integration tests test API endpoints using Supertest:

```javascript
// tests/integration/example.test.js
const request = require('supertest');
const app = require('../../server');

describe('POST /api/example', () => {
  test('should create resource', async () => {
    const response = await request(app)
      .post('/api/example')
      .send({ data: 'test' })
      .expect(201);

    expect(response.body.success).toBe(true);
  });
});
```

## Best Practices

1. **Isolate tests**: Each test should be independent and not rely on other tests
2. **Mock external dependencies**: Use Jest mocks for email, APIs, etc.
3. **Clean up after tests**: Reset database state, clear mocks
4. **Test edge cases**: Not just happy paths, but error conditions too
5. **Use descriptive names**: Test names should clearly state what they test
6. **Keep tests fast**: Mock slow operations (database, network)

## Coverage Goals

We aim for:
- **40% overall coverage** (minimum)
- **60% coverage for critical paths** (auth, mastery, IRT)
- **80% coverage for new features**

## Continuous Integration

Tests run automatically on:
- Every commit (via pre-commit hook)
- Every pull request (via GitHub Actions)
- Before deployment

## Troubleshooting

### Tests timeout
- Increase timeout in `jest.config.js`
- Check for unresolved promises
- Ensure database connections close properly

### Database connection errors
- Verify MongoDB is running
- Check `.env.test` has correct `MONGO_URI`
- Ensure test database exists

### Module not found errors
- Run `npm install` to install dependencies
- Check import paths are correct
- Ensure test files are in `tests/` directory

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
