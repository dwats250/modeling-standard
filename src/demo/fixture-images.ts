import { FIXTURE_MEDIA, findFixture, type Composition, type FixtureMedia } from '../toolkit/fixture-media.ts';

/**
 * Draws the B1 comp-card fixtures (`src/toolkit/fixture-media.ts`) as SVG.
 *
 * Provenance: every image is generated here from simple geometric shapes and
 * the catalogue's colours. Nothing is fetched, traced or derived from a
 * photograph or a real person. The output is deterministic: the same key
 * always gives the same bytes. Each image carries a small "Synthetic
 * fixture" mark so it is never mistaken for someone's work.
 *
 * Served by the local demo at `/media/fixtures/<key>.svg`.
 */

const W = 400;
const H = 500;

const FIGURES: Record<Composition, (ink: string, mid: string) => string> = {
  portrait: (ink) =>
    `<ellipse cx="200" cy="196" rx="62" ry="76" fill="${ink}" opacity="0.88"/>` +
    `<rect x="178" y="258" width="44" height="54" rx="14" fill="${ink}" opacity="0.88"/>` +
    `<path d="M64 500 C74 380 132 316 200 316 C268 316 326 380 336 500 Z" fill="${ink}" opacity="0.92"/>`,
  full: (ink, mid) =>
    `<ellipse cx="200" cy="478" rx="96" ry="12" fill="${mid}" opacity="0.55"/>` +
    `<circle cx="200" cy="108" r="30" fill="${ink}" opacity="0.9"/>` +
    `<path d="M168 150 Q200 138 232 150 L250 300 L234 470 L212 470 L200 332 L188 470 L166 470 L150 300 Z" fill="${ink}" opacity="0.9"/>`,
  profile: (ink) =>
    `<path d="M236 112 C298 112 322 176 312 238 C306 278 290 302 270 320 L272 360 C322 380 352 424 362 500 L118 500 C128 432 168 392 210 372 ` +
    `L206 332 C182 326 168 304 162 292 L142 284 L152 264 L144 252 L154 242 C150 222 150 206 160 190 C172 148 200 112 236 112 Z" fill="${ink}" opacity="0.9"/>`,
  lifestyle: (ink, mid) =>
    `<rect x="0" y="330" width="${W}" height="${H - 330}" fill="${mid}" opacity="0.45"/>` +
    `<circle cx="300" cy="120" r="38" fill="${mid}" opacity="0.6"/>` +
    `<circle cx="148" cy="214" r="34" fill="${ink}" opacity="0.9"/>` +
    `<path d="M98 360 C100 286 122 256 148 256 C176 256 198 286 204 330 L250 330 L250 346 L204 346 L206 360 Z" fill="${ink}" opacity="0.9"/>` +
    `<rect x="232" y="300" width="22" height="30" rx="4" fill="${ink}" opacity="0.75"/>` +
    `<rect x="60" y="360" width="280" height="10" rx="5" fill="${ink}" opacity="0.7"/>`,
  beauty: (ink, mid) =>
    `<path d="M70 500 C60 260 96 92 200 92 C304 92 340 260 330 500 Z" fill="${ink}" opacity="0.85"/>` +
    `<ellipse cx="200" cy="270" rx="112" ry="150" fill="${mid}" opacity="0.95"/>` +
    `<ellipse cx="168" cy="226" rx="34" ry="44" fill="#ffffff" opacity="0.12"/>`,
};

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function fixtureSvg(fixture: FixtureMedia): string {
  const [light, mid, ink] = fixture.tone;
  // Facing right is the profile drawing mirrored.
  const mirror = fixture.key.endsWith('-right') ? ` transform="translate(${W} 0) scale(-1 1)"` : '';
  const id = `g-${fixture.key}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escape(`Synthetic fixture: ${fixture.label}`)}">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${mid}" stop-opacity="0.55"/></linearGradient>` +
    `<radialGradient id="${id}-v" cx="0.5" cy="0.4" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.16"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="${light}"/><rect width="${W}" height="${H}" fill="url(#${id})"/>` +
    `<g${mirror}>${FIGURES[fixture.composition](ink, mid)}</g>` +
    `<rect width="${W}" height="${H}" fill="url(#${id}-v)"/>` +
    `<text x="${W - 16}" y="28" text-anchor="end" font-family="system-ui, sans-serif" font-size="12" font-weight="600" letter-spacing="1.4" fill="#ffffff" fill-opacity="0.8">SYNTHETIC FIXTURE</text>` +
    `</svg>`
  );
}

const PATH = /^\/media\/fixtures\/([a-z0-9-]{1,40})\.svg$/;

/** The SVG for a fixture image path, or null if the path names no fixture. */
export function fixtureImageForPath(pathname: string): string | null {
  const match = PATH.exec(pathname);
  const fixture = match ? findFixture(match[1]!) : undefined;
  return fixture ? fixtureSvg(fixture) : null;
}

export const FIXTURE_IMAGE_PATHS = FIXTURE_MEDIA.map((f) => `/media/fixtures/${f.key}.svg`);
