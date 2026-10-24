/**
 * The comp-card fixture catalogue (slice B1). Synthetic and provisional.
 *
 * B1 has no uploads and stores no image. A comp-card slot holds the key of
 * one entry here. Each entry is an abstract, generated composition: the
 * local demo draws it as an SVG from `composition` and `tone`
 * (`src/demo/fixture-images.ts`), deterministically and without any external
 * request. No entry depicts, derives from or was traced from a real person or
 * photograph.
 *
 * The five slot names are a reversible design choice for B1, not the
 * product's comp-card policy.
 */

export const COMP_CARD_SLOTS = ['hero', 'fullBody', 'profileView', 'lifestyle', 'beauty'] as const;
export type CompCardSlot = (typeof COMP_CARD_SLOTS)[number];

export type Composition = 'portrait' | 'full' | 'profile' | 'lifestyle' | 'beauty';

export interface FixtureMedia {
  readonly key: string;
  readonly label: string;
  /** The slot this fixture was drawn for; any slot may hold it. */
  readonly suggestedSlot: CompCardSlot;
  readonly composition: Composition;
  /** Background and figure colours, light to dark. */
  readonly tone: readonly [string, string, string];
}

export const FIXTURE_MEDIA: readonly FixtureMedia[] = Object.freeze([
  { key: 'studio-portrait-warm', label: 'Studio portrait, warm', suggestedSlot: 'hero', composition: 'portrait', tone: ['#efe2d0', '#c9a27e', '#5b4636'] },
  { key: 'studio-portrait-slate', label: 'Studio portrait, slate', suggestedSlot: 'hero', composition: 'portrait', tone: ['#e3e6e8', '#9aa6ad', '#3b4549'] },
  { key: 'full-length-studio', label: 'Full length, studio', suggestedSlot: 'fullBody', composition: 'full', tone: ['#f1ece4', '#b9ab98', '#4a4036'] },
  { key: 'full-length-street', label: 'Full length, street', suggestedSlot: 'fullBody', composition: 'full', tone: ['#e6e1d6', '#8f9a86', '#33392f'] },
  { key: 'profile-left', label: 'Profile, facing left', suggestedSlot: 'profileView', composition: 'profile', tone: ['#ece6dc', '#b49a86', '#4d3d33'] },
  { key: 'profile-right', label: 'Profile, facing right', suggestedSlot: 'profileView', composition: 'profile', tone: ['#e2e4df', '#a3a89a', '#3d4038'] },
  { key: 'lifestyle-cafe', label: 'Lifestyle, café table', suggestedSlot: 'lifestyle', composition: 'lifestyle', tone: ['#f0e6d8', '#c4a283', '#56402f'] },
  { key: 'lifestyle-coast', label: 'Lifestyle, coastline', suggestedSlot: 'lifestyle', composition: 'lifestyle', tone: ['#e1e8ea', '#93aab0', '#34474c'] },
  { key: 'beauty-close', label: 'Beauty, close crop', suggestedSlot: 'beauty', composition: 'beauty', tone: ['#f3e5dc', '#d0a58e', '#5e4134'] },
  { key: 'beauty-natural-light', label: 'Beauty, natural light', suggestedSlot: 'beauty', composition: 'beauty', tone: ['#eeeae2', '#bfb39e', '#4f473a'] },
]);

export const FIXTURE_KEYS = FIXTURE_MEDIA.map((f) => f.key) as [string, ...string[]];

export function findFixture(key: string): FixtureMedia | undefined {
  return FIXTURE_MEDIA.find((f) => f.key === key);
}

/** A new draft starts arranged, so the first preview already looks finished. */
export const DEFAULT_ARRANGEMENT: Readonly<Record<CompCardSlot, string>> = Object.freeze({
  hero: 'studio-portrait-warm',
  fullBody: 'full-length-studio',
  profileView: 'profile-left',
  lifestyle: 'lifestyle-cafe',
  beauty: 'beauty-close',
});
