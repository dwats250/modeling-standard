import { z } from 'zod';
import { AppError } from '../app/errors.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import type { Policy, Principal } from '../authorization/access.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { COMP_CARD_SLOTS, FIXTURE_KEYS, FIXTURE_MEDIA } from './fixture-media.ts';
import {
  ProfileRequiredError,
  defaultDraft,
  findDraftForAccount,
  findProfileForAccount,
  saveDraftForAccount,
  saveProfileForAccount,
  type DraftFields,
  type ProfileRecord,
} from './profile.ts';
import { StaleRevisionError, UNSAVED_REVISION, findPortfolioForAccount, savePortfolioForAccount } from './portfolio.ts';
import { PORTFOLIO_CAPTION_MAX, PORTFOLIO_MAX_ITEMS } from './tables.ts';

/**
 * The signed-in professional's own profile and comp-card draft (slice B1,
 * Track B) and portfolio draft (B2) with optional captions (B3) and
 * stale-save protection (B4). Synthetic and provisional.
 *
 * Owner-only by construction. The owner is the signed-in account the
 * session names, resolved on the server; no address or body names an
 * account, profile or draft, and a strict body refuses any field that tries.
 * A synthetic principal (the demo operator, a test header) is not a person
 * and gets the generic 404, as on the participant routes. Nothing here lists,
 * shares or shows anyone else's material (I6).
 */

interface OwnAccount {
  readonly accountId: string;
}

async function loadOwnAccount(_input: unknown, _db: Executor, principal: Principal): Promise<OwnAccount | undefined> {
  return principal.kind === 'account' ? { accountId: principal.id } : undefined;
}

/** Defence in depth: the target is this account's own. */
const ownAccountOnly: Policy<OwnAccount> = (principal, target) => principal.kind === 'account' && target.accountId === principal.id;

const access = { kind: 'protected' as const, load: loadOwnAccount, policy: ownAccountOnly };

// ---- Input: strict, trimmed, bounded, no control characters ----

/** One line: no control characters at all. */
const ONE_LINE = /^[^\p{Cc}]*$/u;
/** Several lines: line breaks only (after CRLF is normalised), no other control characters. */
const MULTI_LINE = /^[^\p{Cc}]*(?:\n[^\p{Cc}]*)*$/u;

const oneLine = (max: number) => z.string().trim().max(max).regex(ONE_LINE, 'Use a single line of plain text.');

const profileBody = z.strictObject({
  displayName: oneLine(80).min(1, 'Enter a display name.'),
  profession: oneLine(60),
  biography: z
    .string()
    .max(2000)
    .transform((text) => text.replace(/\r\n?/g, '\n').trim())
    .pipe(z.string().max(600).regex(MULTI_LINE, 'Use plain text.')),
});

const fixtureKey = z.enum(FIXTURE_KEYS);

const slotsSchema = z
  .strictObject({ hero: fixtureKey, fullBody: fixtureKey, profileView: fixtureKey, lifestyle: fixtureKey, beauty: fixtureKey })
  .refine((slots) => new Set(COMP_CARD_SLOTS.map((s) => slots[s])).size === COMP_CARD_SLOTS.length, {
    message: 'Each image can fill one slot only.',
  });

const compCardBody = z.strictObject({ tagline: oneLine(80), slots: slotsSchema });

/**
 * B3: at most one caption per selected image, keyed by its fixture key. A
 * caption is one trimmed line of plain text within the limit; a blank one is
 * the same as none. A key that is not among `items` is refused, so a caption
 * can never outlive or precede its image.
 */
const captionsBody = z.partialRecord(fixtureKey, oneLine(PORTFOLIO_CAPTION_MAX)).default({});

/**
 * B4: the revision the edit was based on, as `GET /me/portfolio` issued it;
 * 0 when there was no saved draft. Required, so a client cannot save blind.
 * Bounded to a PostgreSQL integer so an absurd value is refused as input,
 * not as a database error.
 */
const expectedRevisionBody = z.number().int().min(UNSAVED_REVISION).max(2_147_483_647);

const portfolioBody = z
  .strictObject({
    items: z
      .array(fixtureKey)
      .max(PORTFOLIO_MAX_ITEMS, `A portfolio holds up to ${PORTFOLIO_MAX_ITEMS} images.`)
      .refine((items) => new Set(items).size === items.length, { message: 'Each image can appear once only.' }),
    captions: captionsBody,
    expectedRevision: expectedRevisionBody,
  })
  .refine((body) => Object.keys(body.captions).every((key) => body.items.includes(key)), {
    message: 'A caption belongs to a selected image.',
    path: ['captions'],
  });

// ---- Output: no ids, no owner ----

const profileDto = z.strictObject({
  displayName: z.string(),
  profession: z.string(),
  biography: z.string(),
  updatedAt: z.iso.datetime(),
});

const toProfileDto = (p: ProfileRecord) => ({ displayName: p.displayName, profession: p.profession, biography: p.biography, updatedAt: p.updatedAt.toISOString() });

const slotsDto = z.strictObject({ hero: z.string(), fullBody: z.string(), profileView: z.string(), lifestyle: z.string(), beauty: z.string() });

const compCardDto = z.strictObject({
  profile: profileDto.nullable(),
  draft: z.strictObject({
    tagline: z.string(),
    slots: slotsDto,
    /** Null until the draft is first saved: the arrangement shown is the default. */
    updatedAt: z.iso.datetime().nullable(),
  }),
  fixtures: z.array(z.strictObject({ key: z.string(), label: z.string(), suggestedSlot: z.enum(COMP_CARD_SLOTS) })),
});

const FIXTURES_DTO = FIXTURE_MEDIA.map((f) => ({ key: f.key, label: f.label, suggestedSlot: f.suggestedSlot }));

async function compCardView(db: Executor, accountId: string) {
  const profile = await findProfileForAccount(db, accountId);
  const draft = profile ? await findDraftForAccount(db, accountId) : undefined;
  const shown: DraftFields = draft ?? defaultDraft();
  return {
    profile: profile ? toProfileDto(profile) : null,
    draft: { tagline: shown.tagline, slots: { ...shown.slots }, updatedAt: draft ? draft.updatedAt.toISOString() : null },
    fixtures: FIXTURES_DTO.map((f) => ({ ...f })),
  };
}

const portfolioDto = z.strictObject({
  profile: profileDto.nullable(),
  draft: z.strictObject({
    /** Fixture keys, first shown first. Empty until the owner adds some. */
    items: z.array(z.string()),
    /** B3: the non-blank captions, by fixture key; every key is in `items`. */
    captions: z.record(z.string(), z.string()),
    /** B4: the saved draft's revision, to send back as `expectedRevision`; 0 until first saved. */
    revision: z.number().int().nonnegative(),
    /** Null until the draft is first saved. */
    updatedAt: z.iso.datetime().nullable(),
  }),
  maxItems: z.number().int().positive(),
  maxCaptionLength: z.number().int().positive(),
  fixtures: z.array(z.strictObject({ key: z.string(), label: z.string() })),
});

async function portfolioView(db: Executor, accountId: string) {
  const profile = await findProfileForAccount(db, accountId);
  const draft = profile ? await findPortfolioForAccount(db, accountId) : undefined;
  return {
    profile: profile ? toProfileDto(profile) : null,
    draft: {
      items: draft ? [...draft.items] : [],
      captions: draft ? Object.fromEntries(draft.items.flatMap((key, i) => (draft.captions[i] ? [[key, draft.captions[i]]] : []))) : {},
      revision: draft ? draft.revision : UNSAVED_REVISION,
      updatedAt: draft ? draft.updatedAt.toISOString() : null,
    },
    maxItems: PORTFOLIO_MAX_ITEMS,
    maxCaptionLength: PORTFOLIO_CAPTION_MAX,
    fixtures: FIXTURE_MEDIA.map((f) => ({ key: f.key, label: f.label })),
  };
}

// ---- Operations ----

export const readOwnProfileOperation = defineOperation({
  name: 'toolkit.profile.read',
  method: 'GET',
  path: '/me/profile',
  output: z.strictObject({ profile: profileDto.nullable() }),
  access,
  run: async (_input, { db, target }) => {
    const profile = await findProfileForAccount(db, target.accountId);
    return { profile: profile ? toProfileDto(profile) : null };
  },
});

export const saveOwnProfileOperation = defineOperation({
  name: 'toolkit.profile.save',
  method: 'POST',
  path: '/me/profile',
  input: { body: profileBody },
  output: z.strictObject({ profile: profileDto }),
  access,
  run: async (input, { db, target }) => ({ profile: toProfileDto(await saveProfileForAccount(db, target.accountId, input.body)) }),
});

export const readOwnCompCardOperation = defineOperation({
  name: 'toolkit.comp-card.read',
  method: 'GET',
  path: '/me/comp-card',
  output: compCardDto,
  access,
  run: async (_input, { db, target }) => compCardView(db, target.accountId),
});

export const saveOwnCompCardOperation = defineOperation({
  name: 'toolkit.comp-card.save',
  method: 'POST',
  path: '/me/comp-card',
  input: { body: compCardBody },
  output: compCardDto,
  access,
  run: async (input, { db, target }) => {
    try {
      await db.transaction(
        (tx) => saveDraftForAccount(tx, target.accountId, { tagline: input.body.tagline, slots: input.body.slots }),
        { isolationLevel: 'read committed' },
      );
    } catch (error) {
      if (error instanceof ProfileRequiredError) throw new AppError(409, 'profile_required');
      throw error;
    }
    return compCardView(db, target.accountId);
  },
});

export const readOwnPortfolioOperation = defineOperation({
  name: 'toolkit.portfolio.read',
  method: 'GET',
  path: '/me/portfolio',
  output: portfolioDto,
  access,
  run: async (_input, { db, target }) => portfolioView(db, target.accountId),
});

/**
 * B4: a save names the revision it was based on. A draft that has moved on
 * since (another tab, another window) is answered with a distinct, generic
 * 409 `stale_revision`: nothing is written and the response carries no draft
 * data and no revision, so the client keeps its own edits and asks for the
 * saved version deliberately.
 */
export const saveOwnPortfolioOperation = defineOperation({
  name: 'toolkit.portfolio.save',
  method: 'POST',
  path: '/me/portfolio',
  input: { body: portfolioBody },
  output: portfolioDto,
  access,
  run: async (input, { db, target }) => {
    try {
      const { items, captions, expectedRevision } = input.body;
      await db.transaction(
        (tx) => savePortfolioForAccount(tx, target.accountId, { items, captions: items.map((key) => captions[key] ?? ''), expectedRevision }),
        { isolationLevel: 'read committed' },
      );
    } catch (error) {
      if (error instanceof ProfileRequiredError) throw new AppError(409, 'profile_required');
      if (error instanceof StaleRevisionError) throw new AppError(409, 'stale_revision');
      throw error;
    }
    return portfolioView(db, target.accountId);
  },
});

/** Registered only by the local synthetic demo (`src/demo/application.ts`), never production or staging. */
export const toolkitOperations: readonly AnyOperation[] = [
  readOwnProfileOperation,
  saveOwnProfileOperation,
  readOwnCompCardOperation,
  saveOwnCompCardOperation,
  readOwnPortfolioOperation,
  saveOwnPortfolioOperation,
];
