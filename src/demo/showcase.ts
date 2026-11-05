import { createLogger } from '../app/logger.ts';
import type { Database } from '../infrastructure/database/client.ts';
import type { AnnotationStore } from './annotations.ts';
import { createDemoApplication } from './application.ts';

/**
 * The explicit showcase seed (`npm run demo:reset -- --showcase`): one invented
 * professional for a short synthetic walkthrough. Never part of the ordinary
 * reset, so automated tests and first-run empty states stay blank.
 *
 * Provenance: every word below was written for this demo and describes nobody.
 * "Maren Aldervale" is a made-up name; two web searches on 2026-11-05 found
 * nobody using it, which is a check, not a guarantee. The images are the
 * generated fixtures (`fixture-images.ts`), never photographs. The name reads
 * naturally, so the profession line, the card's tagline and the biography each
 * say it is fictional, and no screenshot of it can pass for a real member or an
 * endorser.
 *
 * Synthetic owner A holds it; B stays blank, so the walkthrough can show the
 * first-run screens and that one professional cannot see another's material.
 *
 * It is written through the real routes, as a browser would: the local harness
 * chooses the owner, the session names the account, and `/me/*` validates and
 * stores. The local demo is the only composition with those routes. Nothing
 * here changes what the data model or the routes accept.
 */

export const SHOWCASE_OWNER = 'a';

export const SHOWCASE_PROFILE = {
  displayName: 'Maren Aldervale',
  profession: 'Model · fictional sample',
  biography:
    'Maren Aldervale is a fictional model, invented for this synthetic demonstration: not a real person, member or endorser. ' +
    'The imagined portfolio is quiet and editorial, shaped by studio portraiture, natural light and unfussy styling. Its images are generated illustrations, not photographs.',
} as const;

export const SHOWCASE_COMP_CARD = {
  tagline: 'Fictional sample · quiet editorial, in the studio and in natural light',
  slots: {
    hero: 'studio-portrait-warm',
    fullBody: 'full-length-studio',
    profileView: 'profile-left',
    lifestyle: 'lifestyle-coast',
    beauty: 'beauty-natural-light',
  },
} as const;

export const SHOWCASE_PORTFOLIO: { readonly items: readonly string[]; readonly captions: Readonly<Record<string, string>> } = {
  items: ['studio-portrait-warm', 'full-length-street', 'beauty-natural-light', 'lifestyle-coast', 'profile-left', 'studio-portrait-slate'],
  captions: {
    'studio-portrait-warm': 'Warm studio portrait, soft window light',
    'full-length-street': 'Long coat, a city street at dusk',
    'beauty-natural-light': 'Beauty study in natural light',
    'lifestyle-coast': 'A slow morning on the coast',
    'profile-left': 'Profile study, hair pinned up',
    'studio-portrait-slate': 'Portrait against a cool backdrop',
  },
};

const SEED_ORIGIN = 'http://showcase-seed.invalid';

/** Writes the showcase through the local demo's real routes. Expects a freshly reset database. */
export async function seedShowcase(db: Database, annotations: AnnotationStore): Promise<void> {
  const demo = await createDemoApplication({ db, logger: createLogger('warn'), annotations });
  demo.origins.push(SEED_ORIGIN);
  try {
    const chosen = await demo.app.inject({ method: 'POST', url: '/demo/toolkit/owner', headers: { origin: SEED_ORIGIN }, payload: { owner: SHOWCASE_OWNER } });
    if (chosen.statusCode !== 200) throw new Error(`showcase: choosing the owner returned ${chosen.statusCode}`);
    const session = chosen.cookies.find((cookie) => cookie.name === 'ms_session');
    if (!session) throw new Error('showcase: no session');
    const headers = { origin: SEED_ORIGIN, cookie: `ms_session=${session.value}` };
    const writes = [
      ['/me/profile', SHOWCASE_PROFILE],
      ['/me/comp-card', SHOWCASE_COMP_CARD],
      ['/me/portfolio', { ...SHOWCASE_PORTFOLIO, expectedRevision: 0 }],
    ] as const;
    for (const [url, payload] of writes) {
      const res = await demo.app.inject({ method: 'POST', url, headers, payload });
      if (res.statusCode !== 200) throw new Error(`showcase: ${url} returned ${res.statusCode}`);
    }
    // No session is left behind by seeding.
    await demo.app.inject({ method: 'POST', url: '/sign-out', headers });
  } finally {
    await demo.app.close();
  }
}
