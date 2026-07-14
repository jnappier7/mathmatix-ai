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
});
