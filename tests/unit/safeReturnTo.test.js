const { safeReturnTo } = require('../../utils/safeReturnTo');

describe('safeReturnTo', () => {
  it('keeps a same-origin path, with its query and hash', () => {
    expect(safeReturnTo('/drill')).toBe('/drill');
    expect(safeReturnTo('/drill/algebra')).toBe('/drill/algebra');
    expect(safeReturnTo('/drill/geometry?book=ch3')).toBe('/drill/geometry?book=ch3');
    expect(safeReturnTo('/courses/algebra/index.html#week')).toBe('/courses/algebra/index.html#week');
  });

  it('refuses anything that could reach another origin', () => {
    // each of these is a working open redirect if the guard is missing
    for (const bad of [
      'https://evil.test/x',
      'http://evil.test/x',
      '//evil.test/x',
      '/\\evil.test/x',
      '/\\/evil.test',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '\\\\evil.test\\x',
    ]) {
      expect(safeReturnTo(bad)).toBeNull();
    }
  });

  it('refuses a relative path, which would resolve against whatever page is open', () => {
    expect(safeReturnTo('drill')).toBeNull();
    expect(safeReturnTo('../admin')).toBeNull();
  });

  it('refuses control characters, which can forge a response header', () => {
    expect(safeReturnTo('/drill\nLocation: https://evil.test')).toBeNull();
    expect(safeReturnTo('/drill\r\nSet-Cookie: a=b')).toBeNull();
  });

  it('will not bounce a just-authenticated user back into the auth pages', () => {
    expect(safeReturnTo('/login.html')).toBeNull();
    expect(safeReturnTo('/login')).toBeNull();
    expect(safeReturnTo('/login.html?next=/drill')).toBeNull();
    expect(safeReturnTo('/signup.html')).toBeNull();
    expect(safeReturnTo('/auth/google')).toBeNull();
    expect(safeReturnTo('/logout')).toBeNull();
  });

  it('normalises traversal rather than trusting the raw string', () => {
    expect(safeReturnTo('/a/../drill')).toBe('/drill');
    // climbing past the root cannot escape the origin
    expect(safeReturnTo('/../../drill')).toBe('/drill');
  });

  it('is null-safe and bounded', () => {
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(42)).toBeNull();
    expect(safeReturnTo('')).toBeNull();
    expect(safeReturnTo('   ')).toBeNull();
    expect(safeReturnTo('/' + 'a'.repeat(600))).toBeNull();
  });
});
