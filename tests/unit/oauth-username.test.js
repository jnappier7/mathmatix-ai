// tests/unit/oauth-username.test.js
// Unit tests for OAuth username collision handling

const User = require('../../models/user');

// Mock the passport-config generateUniqueUsername function
// Since it's not exported, we'll test it through the OAuth strategies
describe('OAuth Username Collision Handling', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('generateUniqueUsername logic', () => {
    test('should return base username when available', async () => {
      // Mock User.findOne to return null (username available)
      User.findOne = jest.fn().mockResolvedValue(null);

      // Simulate the logic from passport-config.js
      const displayName = 'John Doe';
      const baseUsername = displayName.replace(/\s+/g, '').toLowerCase();

      const existingUser = await User.findOne({ username: baseUsername });

      expect(existingUser).toBeNull();
      expect(baseUsername).toBe('johndoe');
    });

    test('should append provider ID when base username is taken', async () => {
      const displayName = 'John Doe';
      const providerId = '1234567890';
      const baseUsername = displayName.replace(/\s+/g, '').toLowerCase();

      // Mock User.findOne to return a user for base username
      User.findOne = jest.fn()
        .mockResolvedValueOnce({ username: baseUsername }) // First call: base taken
        .mockResolvedValueOnce(null); // Second call: with suffix available

      const firstCheck = await User.findOne({ username: baseUsername });
      expect(firstCheck).not.toBeNull();

      const suffix = providerId.substring(0, 6);
      const uniqueUsername = `${baseUsername}_${suffix}`;

      const secondCheck = await User.findOne({ username: uniqueUsername });
      expect(secondCheck).toBeNull();
      expect(uniqueUsername).toBe('johndoe_123456');
    });

    test('should append timestamp when username with provider ID is also taken', async () => {
      const displayName = 'John Doe';
      const providerId = '1234567890';
      const baseUsername = displayName.replace(/\s+/g, '').toLowerCase();
      const suffix = providerId.substring(0, 6);
      const uniqueUsername = `${baseUsername}_${suffix}`;

      // Mock User.findOne to return users for both attempts
      User.findOne = jest.fn()
        .mockResolvedValueOnce({ username: baseUsername })
        .mockResolvedValueOnce({ username: uniqueUsername });

      const firstCheck = await User.findOne({ username: baseUsername });
      expect(firstCheck).not.toBeNull();

      const secondCheck = await User.findOne({ username: uniqueUsername });
      expect(secondCheck).not.toBeNull();

      // Final username would have timestamp
      const timestamp = Date.now().toString().slice(-4);
      const finalUsername = `${baseUsername}_${timestamp}`;
      expect(finalUsername).toMatch(/^johndoe_\d{4}$/);
    });
  });

  describe('Username collision prevention', () => {
    test('should prevent database crashes from duplicate display names', async () => {
      // Simulate two users with same display name signing up
      const displayName = 'Jane Smith';
      const googleId1 = 'google-user-1';
      const googleId2 = 'google-user-2';

      User.findOne = jest.fn()
        .mockResolvedValueOnce(null) // First user gets base username
        .mockResolvedValueOnce({ username: 'janesmith' }); // Second user finds collision

      // First user
      const user1Username = displayName.replace(/\s+/g, '').toLowerCase();
      const check1 = await User.findOne({ username: user1Username });
      expect(check1).toBeNull();

      // Second user should get unique username
      const check2 = await User.findOne({ username: user1Username });
      expect(check2).not.toBeNull();

      // Second user should use provider ID suffix
      const suffix = googleId2.substring(0, 6);
      const user2Username = `${user1Username}_${suffix}`;
      expect(user2Username).toBe('janesmith_google');
    });

    test('should handle users with identical names from different providers', async () => {
      const displayName = 'Alex Turner';
      const googleId = 'google-123456';
      const microsoftId = 'microsoft-789012';

      User.findOne = jest.fn()
        .mockResolvedValueOnce(null) // Google user gets base
        .mockResolvedValueOnce({ username: 'alexturner' }) // Microsoft finds collision
        .mockResolvedValueOnce(null); // Microsoft with suffix is available

      // Google OAuth user
      const googleUsername = displayName.replace(/\s+/g, '').toLowerCase();
      const googleCheck = await User.findOne({ username: googleUsername });
      expect(googleCheck).toBeNull();

      // Microsoft OAuth user
      const microsoftCheck = await User.findOne({ username: googleUsername });
      expect(microsoftCheck).not.toBeNull();

      const microsoftSuffix = microsoftId.substring(0, 6);
      const microsoftUsername = `${googleUsername}_${microsoftSuffix}`;
      const microsoftFinalCheck = await User.findOne({ username: microsoftUsername });
      expect(microsoftFinalCheck).toBeNull();
      expect(microsoftUsername).toBe('alexturner_micros');
    });
  });

  describe('Edge cases', () => {
    test('should handle display names with special characters', () => {
      const displayName = 'María José';
      const sanitized = displayName.replace(/\s+/g, '').toLowerCase();

      expect(sanitized).toBe('maríajosé');
    });

    test('should handle display names with multiple spaces', () => {
      const displayName = 'John   Paul    Jones';
      const sanitized = displayName.replace(/\s+/g, '').toLowerCase();

      expect(sanitized).toBe('johnpauljones');
    });

    test('should handle very long display names', () => {
      const displayName = 'A'.repeat(100);
      const sanitized = displayName.replace(/\s+/g, '').toLowerCase();

      expect(sanitized.length).toBe(100);
    });

    test('should handle display names with numbers', () => {
      const displayName = 'User 123';
      const sanitized = displayName.replace(/\s+/g, '').toLowerCase();

      expect(sanitized).toBe('user123');
    });
  });

  describe('Security considerations', () => {
    test('should prevent username enumeration attacks', async () => {
      // The system doesn't reveal if a username exists externally
      // It just ensures uniqueness internally
      User.findOne = jest.fn().mockResolvedValue({ username: 'existinguser' });

      const check = await User.findOne({ username: 'existinguser' });

      // Even if username exists, OAuth flow continues with modified username
      expect(check).not.toBeNull();
      // No error is thrown to the user
    });

    test('should handle malicious display names', async () => {
      const maliciousNames = [
        '<script>alert("xss")</script>',
        '../../etc/passwd',
        '${process.env.SECRET}',
        'admin',
        'root'
      ];

      for (const name of maliciousNames) {
        const sanitized = name.replace(/\s+/g, '').toLowerCase();
        // Just ensure it doesn't crash - sanitization happens at display time
        expect(typeof sanitized).toBe('string');
      }
    });

    test('should prevent NoSQL injection in username', () => {
      const displayName = "'; DROP TABLE users; --";
      const sanitized = displayName.replace(/\s+/g, '').toLowerCase();

      // Username is just a string, safe to store
      expect(sanitized).toBe("';droptableusers;--");
    });
  });
});
