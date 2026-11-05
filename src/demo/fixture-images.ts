import { FIXTURE_MEDIA, findFixture, type Composition, type FixtureMedia } from '../toolkit/fixture-media.ts';

/**
 * Draws the B1 comp-card fixtures (`src/toolkit/fixture-media.ts`) as SVG.
 *
 * Provenance: every image is generated here from hand-written vector paths and
 * the catalogue's colours. Nothing is fetched, traced or derived from a
 * photograph or a real person. The output is deterministic: the same key
 * always gives the same bytes. Each image carries a small "Synthetic
 * fixture" mark so it is never mistaken for someone's work.
 *
 * Served by the local demo at `/media/fixtures/<key>.svg`.
 */

const W = 400;
const H = 500;

/**
 * Faceless paper-cut figures: flat layers of the catalogue's tones, drawn by
 * hand as paths for this demo. They suggest a pose and a crop, not a person.
 * `ink` is hair and clothing, `mid` is skin.
 */
const FIGURES: Record<Composition, (ink: string, mid: string, light: string, id: string) => string> = {
  portrait: (ink, mid, light, id) =>
    `<circle cx="200" cy="196" r="158" fill="${light}" opacity="0.55"/>` +
    `<path d="M200 66 C128 66 100 128 104 200 C106 262 92 312 72 362 L328 362 C308 312 294 262 296 200 C300 128 272 66 200 66 Z" fill="${ink}"/>` +
    `<path d="M172 262 L172 352 Q200 376 228 352 L228 262 Z" fill="${mid}"/>` +
    `<path d="M172 300 Q200 330 228 300 L228 322 Q200 346 172 322 Z" fill="${ink}" opacity="0.22"/>` +
    `<path d="M40 500 C50 424 104 376 168 352 Q200 392 232 352 C296 376 350 424 360 500 Z" fill="${ink}" opacity="0.94"/>` +
    `<path d="M168 352 Q200 392 232 352 L240 356 Q200 410 160 356 Z" fill="${light}" opacity="0.28"/>` +
    `<clipPath id="${id}-f"><ellipse cx="200" cy="204" rx="64" ry="84"/></clipPath>` +
    `<ellipse cx="200" cy="204" rx="64" ry="84" fill="${mid}"/>` +
    `<ellipse cx="184" cy="190" rx="34" ry="52" fill="${light}" opacity="0.28" clip-path="url(#${id}-f)"/>` +
    `<path d="M214 110 C236 170 244 240 214 300 L290 300 L290 110 Z" fill="${ink}" opacity="0.24" clip-path="url(#${id}-f)"/>` +
    `<path d="M132 214 C126 142 170 104 216 110 C256 116 276 158 268 214 C258 170 232 146 204 138 C186 164 156 178 132 214 Z" fill="${ink}"/>`,
  // Set down a little, so the synthetic mark at the top stays clear of the hair.
  full: (ink, mid, light) =>
    `<g transform="translate(0 18)">` +
    `<ellipse cx="208" cy="466" rx="118" ry="13" fill="${ink}" opacity="0.2"/>` +
    `<path d="M186 442 L178 462 L204 462 L206 442 Z M226 442 L226 462 L254 462 L244 442 Z" fill="${ink}"/>` +
    `<path d="M176 300 L184 446 L208 446 L214 318 Z M206 318 L224 446 L248 446 L240 300 Z" fill="${mid}"/>` +
    `<path d="M192 96 L192 136 Q208 148 224 136 L224 96 Z" fill="${mid}"/>` +
    `<path d="M168 138 Q208 118 248 138 L270 214 L256 372 Q208 392 158 372 L150 214 Z" fill="${ink}"/>` +
    `<path d="M168 138 L142 256 L150 318 L164 316 L172 248 L186 180 Z" fill="${ink}" opacity="0.82"/>` +
    `<path d="M248 138 L276 248 L270 312 L256 310 L250 240 L232 180 Z" fill="${ink}" opacity="0.82"/>` +
    `<path d="M150 318 L164 316 L162 340 L152 340 Z M270 312 L256 310 L258 334 L268 334 Z" fill="${mid}"/>` +
    `<path d="M208 132 L208 386 M192 176 L184 376 M226 176 L234 376" stroke="${light}" stroke-width="1.5" opacity="0.28" fill="none"/>` +
    `<ellipse cx="208" cy="78" rx="27" ry="33" fill="${mid}"/>` +
    `<path d="M178 84 C170 40 208 28 226 36 C250 40 248 80 238 92 C234 70 224 60 206 58 C196 70 186 74 178 84 Z" fill="${ink}"/>` +
    `<circle cx="236" cy="42" r="15" fill="${ink}"/>` +
    `</g>`,
  profile: (ink, mid, light) =>
    `<circle cx="222" cy="214" r="168" fill="${light}" opacity="0.5"/>` +
    `<path d="M60 500 C72 430 124 384 196 372 L300 372 C346 398 366 446 372 500 Z" fill="${ink}" opacity="0.94"/>` +
    `<path d="M196 296 L196 392 Q244 416 296 382 L290 262 Z" fill="${mid}"/>` +
    `<path d="M196 318 L276 276 L290 300 L196 362 Z" fill="${ink}" opacity="0.2"/>` +
    `<path d="M238 110 C192 104 158 136 152 182 C150 196 144 206 134 222 C130 230 134 234 146 236 C144 244 144 250 150 254 C144 260 146 270 154 272 C152 294 166 312 194 310 C226 308 262 300 296 262 L300 140 Z" fill="${mid}"/>` +
    `<path d="M150 254 C158 256 166 254 172 250 C166 248 158 248 150 254 Z" fill="${ink}" opacity="0.4"/>` +
    `<path d="M242 96 C192 88 154 118 150 176 C184 150 214 168 226 206 C234 234 230 262 246 288 C278 312 320 284 332 234 C346 168 310 104 242 96 Z" fill="${ink}"/>` +
    `<circle cx="326" cy="146" r="36" fill="${ink}"/>`,
  lifestyle: (ink, mid, light) =>
    `<circle cx="300" cy="116" r="52" fill="${light}" opacity="0.85"/>` +
    `<rect x="0" y="300" width="400" height="200" fill="${mid}" opacity="0.5"/>` +
    `<path d="M0 300 C90 286 170 310 260 296 C320 288 370 296 400 290 L400 300 L0 300 Z" fill="${ink}" opacity="0.16"/>` +
    `<path d="M104 268 L112 216 L150 216 L152 268 Z" fill="${mid}"/>` +
    `<path d="M68 412 C66 318 90 256 132 250 C176 252 198 300 204 352 L290 346 L292 368 L196 386 L190 412 Z" fill="${ink}"/>` +
    `<path d="M280 344 L296 342 L298 368 L284 370 Z" fill="${mid}"/>` +
    `<ellipse cx="134" cy="186" rx="38" ry="46" fill="${mid}"/>` +
    `<path d="M90 214 C74 130 136 112 166 138 C186 156 178 196 172 206 C166 178 150 168 128 168 C118 186 106 196 104 256 L78 262 C84 244 88 230 90 214 Z" fill="${ink}"/>` +
    `<path d="M40 412 L362 412 L362 424 L40 424 Z" fill="${ink}" opacity="0.85"/>` +
    `<path d="M96 424 L82 500 L96 500 L112 424 Z M304 424 L320 500 L334 500 L320 424 Z" fill="${ink}" opacity="0.72"/>` +
    `<path d="M304 378 L340 378 L336 412 L308 412 Z" fill="${light}"/>`,
  beauty: (ink, mid, light, id) =>
    `<path d="M36 500 C20 250 62 44 206 44 C350 44 382 250 364 500 Z" fill="${ink}"/>` +
    `<path d="M148 400 L148 500 L262 500 L262 400 Z" fill="${mid}"/>` +
    `<path d="M148 420 Q204 472 262 420 L262 448 Q204 500 148 448 Z" fill="${ink}" opacity="0.2"/>` +
    `<clipPath id="${id}-f"><path d="M92 214 C92 116 150 86 206 86 C262 86 318 116 318 214 C318 322 262 420 206 420 C150 420 92 322 92 214 Z"/></clipPath>` +
    `<path d="M92 214 C92 116 150 86 206 86 C262 86 318 116 318 214 C318 322 262 420 206 420 C150 420 92 322 92 214 Z" fill="${mid}"/>` +
    `<ellipse cx="166" cy="220" rx="62" ry="110" fill="${light}" opacity="0.26" clip-path="url(#${id}-f)"/>` +
    `<path d="M252 86 C270 190 266 320 216 424 L330 424 L330 86 Z" fill="${ink}" opacity="0.2" clip-path="url(#${id}-f)"/>` +
    `<path d="M128 232 Q154 250 180 232 M230 232 Q256 250 282 232" stroke="${ink}" stroke-width="4.5" stroke-linecap="round" fill="none"/>` +
    `<path d="M128 204 Q154 188 182 202 M230 202 Q258 188 284 204" stroke="${ink}" stroke-width="3.5" stroke-linecap="round" fill="none" opacity="0.65"/>` +
    `<path d="M178 348 Q192 338 204 344 Q216 338 232 348 Q206 372 178 348 Z" fill="${ink}" opacity="0.62"/>` +
    `<path d="M208 244 L198 304 Q208 312 220 304" stroke="${ink}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.32"/>` +
    `<path d="M80 250 C72 140 130 58 214 66 C290 72 334 136 330 242 C312 170 276 116 214 106 C190 156 128 176 80 250 Z" fill="${ink}"/>`,
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
    `<g${mirror}>${FIGURES[fixture.composition](ink, mid, light, id)}</g>` +
    `<rect width="${W}" height="${H}" fill="url(#${id}-v)"/>` +
    `<rect x="128" y="14" width="144" height="22" rx="11" fill="#000000" fill-opacity="0.38"/>` +
    // Centred at the top so a cover crop of the sides never clips it.
    `<text x="${W / 2}" y="29" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10.5" font-weight="600" letter-spacing="1.2" fill="#ffffff">SYNTHETIC FIXTURE</text>` +
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
