const ImageElement = require('../../../public/js/living-workspace/dom/imageElement.js');

// Pure helpers only — the DOM render path (img / fallback / caption / stale
// guard) is verified in-browser with a stubbed search, matching how the other
// workspace elements split headless vs browser coverage (jsdom isn't installed).
describe('imageElement — pure helpers', () => {
  it('srcFor routes remote hosts through the same-origin proxy', () => {
    expect(ImageElement.srcFor('https://upload.wikimedia.org/x.png'))
      .toBe('/api/images/proxy?url=' + encodeURIComponent('https://upload.wikimedia.org/x.png'));
    expect(ImageElement.srcFor('http://example.com/y.jpg'))
      .toBe('/api/images/proxy?url=' + encodeURIComponent('http://example.com/y.jpg'));
  });

  it('srcFor leaves same-origin / static concept images untouched', () => {
    expect(ImageElement.srcFor('/images/concepts/triangle-types.png')).toBe('/images/concepts/triangle-types.png');
  });

  it('pickResult takes the first result carrying an image, skipping empty ones', () => {
    expect(ImageElement.pickResult([{}, { url: 'a' }])).toEqual({ url: 'a' });
    expect(ImageElement.pickResult([{ thumbnail: 't' }])).toEqual({ thumbnail: 't' });
    expect(ImageElement.pickResult([])).toBeNull();
    expect(ImageElement.pickResult(null)).toBeNull();
    expect(ImageElement.pickResult([{ title: 'no image' }])).toBeNull();
  });

  it('pickResult prefers a result whose title is about the query', () => {
    // Production 2026-09-07: for "trigonometric functions" the site-restricted
    // search led with a cosmology plot of the expanding universe, and the first
    // image won. A title match moves the right result up.
    const results = [
      { url: 'galaxies.png', title: 'Expansion of the universe — average distance between galaxies' },
      { url: 'unit-circle.png', title: 'Trigonometry: the unit circle' },
    ];
    expect(ImageElement.pickResult(results, 'trigonometric functions')).toEqual(results[1]);
    // Stems, not whole words: "trigonometric" finds "Trigonometry".
    expect(ImageElement.pickResult(results, 'trigonometry graph')).toEqual(results[1]);
  });

  it('pickResult falls back to the first image when no title matches', () => {
    const results = [
      { url: 'a.png', title: 'File:Untitled-1.png' },
      { url: 'b.png', title: 'File:Untitled-2.png' },
    ];
    expect(ImageElement.pickResult(results, 'unit circle')).toEqual(results[0]);
    // Presentation and function words are not evidence: "graph of the" matches
    // nothing on its own, so this is the plain first-image pick.
    expect(ImageElement.pickResult(results, 'graph of the')).toEqual(results[0]);
    // No query at all → exactly the old behaviour.
    expect(ImageElement.pickResult(results)).toEqual(results[0]);
  });
});
