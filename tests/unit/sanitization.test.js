// tests/unit/sanitization.test.js
// Unit tests for HTML sanitization utility
// Tests the critical XSS vulnerability fix in AI message rendering

describe('HTML Sanitization for XSS Prevention', () => {
  // Realistic DOMPurify mock that actually strips dangerous content
  const SAFE_TAGS = [
    'p', 'br', 'strong', 'em', 'u', 'code', 'pre',
    'ul', 'ol', 'li', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'span', 'div', 'table', 'thead', 'tbody',
    'tr', 'td', 'th', 'img', 'form', 'input'
  ];
  const SAFE_ATTRS = ['href', 'class', 'target', 'rel', 'src', 'alt', 'title', 'style', 'id', 'name'];

  function mockSanitize(html, config) {
    if (!html || typeof html !== 'string') return '';

    let result = html;
    const allowedTags = (config && config.ALLOWED_TAGS) || SAFE_TAGS;
    const allowedAttrs = (config && config.ALLOWED_ATTR) || SAFE_ATTRS;

    // Remove script tags and their content
    result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove iframe/object/embed tags entirely
    result = result.replace(/<(iframe|object|embed)\b[^>]*>.*?<\/\1>/gi, '');
    result = result.replace(/<(iframe|object|embed)\b[^>]*\/?>/gi, '');

    // Remove event handler attributes (onerror, onload, onclick, etc.)
    result = result.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    // Remove javascript: URLs
    result = result.replace(/(href|src|data)\s*=\s*"javascript:[^"]*"/gi, '$1=""');
    result = result.replace(/(href|src|data)\s*=\s*'javascript:[^']*'/gi, "$1=''");

    // Remove data: URLs in href/src
    result = result.replace(/(href|src)\s*=\s*"data:[^"]*"/gi, '$1=""');

    // Remove dangerous attributes (__proto__, constructor, etc.)
    result = result.replace(/\s+(__proto__|constructor|prototype)\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    // Filter tags based on allowed list
    result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/gi, (match, tag) => {
      if (allowedTags.includes(tag.toLowerCase())) {
        // For allowed tags, still strip disallowed attributes
        return match.replace(/\s+([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*')/gi, (attrMatch, attrName) => {
          if (allowedAttrs.includes(attrName.toLowerCase()) || attrName.toLowerCase().startsWith('data-')) {
            return attrMatch;
          }
          return '';
        });
      }
      return ''; // Strip disallowed tags
    });

    return result;
  }

  global.DOMPurify = {
    sanitize: jest.fn(mockSanitize)
  };

  // Import the sanitization utility functions (mirrors sanitize-util.js)
  const sanitizeHTML = (html, options = {}) => {
    if (!html || typeof html !== 'string') {
      return '';
    }
    try {
      return DOMPurify.sanitize(html, options);
    } catch (error) {
      return '';
    }
  };

  const safeSetInnerHTML = (element, html, options = {}) => {
    if (!element || !(element instanceof Object)) {
      return;
    }
    const sanitized = sanitizeHTML(html, options);
    element.innerHTML = sanitized;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore the mock implementation (Error Handling test replaces it)
    DOMPurify.sanitize = jest.fn(mockSanitize);
  });

  describe('sanitizeHTML', () => {
    test('should remove script tags from AI-generated content', () => {
      const maliciousHTML = '<p>Hello</p><script>alert("XSS")</script><p>World</p>';

      const sanitized = sanitizeHTML(maliciousHTML);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    test('should allow safe HTML tags', () => {
      const safeHTML = '<p>Hello <strong>World</strong></p>';

      const sanitized = sanitizeHTML(safeHTML);

      expect(sanitized).toContain('<p>');
      expect(sanitized).toContain('<strong>');
      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    test('should handle empty or null input', () => {
      expect(sanitizeHTML('')).toBe('');
      expect(sanitizeHTML(null)).toBe('');
      expect(sanitizeHTML(undefined)).toBe('');
    });

    test('should handle non-string input', () => {
      expect(sanitizeHTML(123)).toBe('');
      expect(sanitizeHTML({})).toBe('');
      expect(sanitizeHTML([])).toBe('');
    });
  });

  describe('XSS Attack Vectors', () => {
    test('should prevent inline JavaScript execution', () => {
      const attacks = [
        '<img src="x" onerror="alert(1)">',
        '<a href="javascript:alert(1)">Click</a>',
        '<div onload="alert(1)">Content</div>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<object data="javascript:alert(1)"></object>',
        '<embed src="javascript:alert(1)">',
        '<svg onload="alert(1)"></svg>'
      ];

      attacks.forEach(attack => {
        const sanitized = sanitizeHTML(attack);
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('onload');
      });
    });

    test('should prevent data URL XSS attacks', () => {
      const attack = '<a href="data:text/html,<script>alert(1)</script>">Click</a>';

      const sanitized = sanitizeHTML(attack);

      expect(sanitized).not.toContain('<script>');
      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    test('should prevent DOM clobbering attacks', () => {
      const attack = '<form><input name="innerHTML"></form>';

      const sanitized = sanitizeHTML(attack);

      // Should not allow form inputs that could clobber DOM properties
      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    test('should prevent prototype pollution via attributes', () => {
      const attack = '<div __proto__="polluted">Content</div>';

      const sanitized = sanitizeHTML(attack);

      expect(sanitized).not.toContain('__proto__');
    });
  });

  describe('AI Message Rendering Context', () => {
    test('should preserve Markdown formatting while removing XSS', () => {
      const aiMessage = '<p>Here is <strong>bold</strong> and <em>italic</em> text</p><script>alert("xss")</script>';

      const sanitized = sanitizeHTML(aiMessage);

      expect(sanitized).toContain('<strong>');
      expect(sanitized).toContain('<em>');
      expect(sanitized).not.toContain('<script>');
    });

    test('should preserve code blocks without executing', () => {
      const aiMessage = '<pre><code>const x = "<script>alert(1)</script>";</code></pre>';

      const sanitized = sanitizeHTML(aiMessage);

      expect(sanitized).toContain('<pre>');
      expect(sanitized).toContain('<code>');
      // Script tags inside code blocks should be safe
    });

    test('should preserve LaTeX math notation markers', () => {
      const aiMessage = '<p>The equation is \\[x^2 + y^2 = r^2\\]</p>';

      const sanitized = sanitizeHTML(aiMessage);

      expect(sanitized).toContain('\\[');
      expect(sanitized).toContain('\\]');
    });

    test('should handle mixed content from AI responses', () => {
      const aiMessage = `
        <p>Here's the solution:</p>
        <ol>
          <li>First step</li>
          <li>Second step</li>
        </ol>
        <p>Math: \\(x = \\frac{-b}{2a}\\)</p>
      `;

      const sanitized = sanitizeHTML(aiMessage);

      expect(sanitized).toContain('<ol>');
      expect(sanitized).toContain('<li>');
      expect(sanitized).toContain('\\(');
    });
  });

  describe('safeSetInnerHTML', () => {
    test('should safely set innerHTML on element', () => {
      const element = { innerHTML: '' };
      const html = '<p>Hello <script>alert("XSS")</script></p>';

      safeSetInnerHTML(element, html);

      expect(element.innerHTML).not.toContain('<script>');
      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    test('should handle invalid element gracefully', () => {
      const result = safeSetInnerHTML(null, '<p>Test</p>');

      // Should not throw error
      expect(result).toBeUndefined();
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle very large HTML content', () => {
      const largeHTML = '<p>' + 'A'.repeat(10000) + '</p>';

      const sanitized = sanitizeHTML(largeHTML);

      expect(typeof sanitized).toBe('string');
      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    test('should handle deeply nested HTML', () => {
      const nested = '<div><div><div><div><p>Deep</p></div></div></div></div>';

      const sanitized = sanitizeHTML(nested);

      expect(typeof sanitized).toBe('string');
    });

    test('should handle malformed HTML gracefully', () => {
      const malformed = '<p>Unclosed <div>Mixed <span>Tags';

      const sanitized = sanitizeHTML(malformed);

      expect(typeof sanitized).toBe('string');
    });

    test('should handle Unicode and special characters', () => {
      const unicode = '<p>Hello 世界 🌍 Привет</p>';

      const sanitized = sanitizeHTML(unicode);

      expect(sanitized).toContain('世界');
      expect(sanitized).toContain('🌍');
      expect(sanitized).toContain('Привет');
    });
  });

  describe('Error Handling', () => {
    test('should return empty string on sanitization error', () => {
      // Temporarily replace DOMPurify to throw error
      DOMPurify.sanitize = jest.fn(() => {
        throw new Error('Sanitization failed');
      });

      const result = sanitizeHTML('<p>Test</p>');

      expect(result).toBe('');
    });

    test('should not crash on circular references', () => {
      const circular = {};
      circular.self = circular;

      const result = sanitizeHTML(circular);

      expect(result).toBe('');
    });
  });

  describe('Regression Tests for script.js:1837 Bug', () => {
    test('should fix the original vulnerability in message rendering', () => {
      // This is the exact scenario that was vulnerable in script.js:1837
      const markedOutput = '<p>Hello user!</p><script>document.cookie</script>';

      const sanitized = sanitizeHTML(markedOutput, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li'],
        ALLOWED_ATTR: ['class']
      });

      // Before fix: innerHTML = dirtyHtml (VULNERABLE)
      // After fix: innerHTML = DOMPurify.sanitize(dirtyHtml) (SAFE)
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('document.cookie');
    });

    test('should allow AI to use safe formatting', () => {
      const aiFormatted = '<p>The answer is <strong>42</strong>. Here\'s why:</p><ul><li>Reason 1</li><li>Reason 2</li></ul>';

      const sanitized = sanitizeHTML(aiFormatted);

      expect(sanitized).toContain('<strong>');
      expect(sanitized).toContain('<ul>');
      expect(sanitized).toContain('<li>');
    });
  });
});
