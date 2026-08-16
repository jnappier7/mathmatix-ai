# Font Awesome Free 6.5.1 (vendored)

Self-hosted copy of `@fortawesome/fontawesome-free@6.5.1`, serving every `<i class="fas …">`
icon in the app.

## Why this is vendored

Icons used to load from `cdnjs.cloudflare.com`. That made **every icon in the product a
third-party single point of failure**: when the CDN fetch failed, the stylesheet's glyphs
never arrived and every icon button rendered as an empty tofu box (□) — buttons with no
discernible purpose. It was observed happening on a real device.

That is a bad bet for a K-12 product specifically: school networks routinely block or
throttle public CDNs, which is exactly where our students are.

`/vendor` was already the house pattern (KaTeX, MathLive, DOMPurify, JSXGraph), so this
follows it. cdnjs is still used for `fabric.js`, which is lazy-loaded with the board
tools — a failure there degrades one optional feature instead of every button on screen.

## Which families ship, and why all three

| File | Used by | Notes |
|---|---|---|
| `fa-solid-900` | `fas` | ~1500 usages — the overwhelming majority |
| `fa-regular-400` | `far` | 3 usages (`fa-circle`, `fa-smile`) — outline look is deliberate |
| `fa-brands-400` | `fab` | 4 usages in `affiliate.html` (PayPal, Facebook, X, WhatsApp) |
| `fa-v4compatibility` | — | referenced by upstream's v4 shim `@font-face` rules |

Brands cannot be dropped: brand logos have no solid equivalent. Both `.woff2` and `.ttf`
are kept, matching how KaTeX is vendored here (it ships ttf/woff/woff2).

## Local modification — re-apply on upgrade

`css/all.min.css` is upstream **except** that its font `url(…)`s were rewritten from
relative to absolute:

```
url(../webfonts/…)  ->  url(/vendor/fontawesome/webfonts/…)
```

This is load-bearing. `scripts/buildPageBundles.js` concatenates consecutive local
stylesheets into `/dist/css/`, and its own contract is that bundled CSS must use absolute
urls — from `/dist/css/`, a relative `../webfonts/` would resolve to `/dist/webfonts/` and
every glyph would 404. The rewrite makes the file correct whether it is served directly
(as it is today) or inlined into a bundle later.

## Upgrading

```bash
npm pack @fortawesome/fontawesome-free@<version>
tar xzf fortawesome-fontawesome-free-<version>.tgz
cp package/css/all.min.css   public/vendor/fontawesome/css/
cp package/webfonts/*        public/vendor/fontawesome/webfonts/
cp package/LICENSE.txt       public/vendor/fontawesome/
# then re-apply the absolute-url rewrite described above
sed -i 's#url(../webfonts/#url(/vendor/fontawesome/webfonts/#g' \
  public/vendor/fontawesome/css/all.min.css
```

Verify afterwards by loading a page with the CDN blocked and confirming icons still
render — a tofu box means the fonts are not resolving.

Upstream license: `LICENSE.txt` (Font Awesome Free — CC BY 4.0 / SIL OFL 1.1 / MIT).
