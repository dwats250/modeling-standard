import { addBriefItem, openLiveBrief } from '../briefs/brief.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../projects/agreement.ts';
import { addProjectParty } from '../projects/party.ts';

/**
 * The synthetic two-person walkthrough draft (D01-like): a photographer and a
 * model, one pair, and a draft brief with something in every layer and one
 * of each thing S09 resolves. Fixture construction with the S01, S02 and S08
 * data functions, used by the scenario starter and the fixtures alike.
 *
 * Every text is `[synthetic]`. There is no no-means-no item: its wording is
 * Cory's to write (D04), and a placeholder would read as document text. The
 * keyed items (`fee`, `coverage_level`) carry synthetic wording only so the
 * demo can show that deliberate-tick items refuse group-check; nothing here is
 * a catalogue, and their layers are not decided by it.
 */

export interface WalkthroughParties {
  readonly photographerPartyId: string;
  readonly modelPartyId: string;
}

export interface WalkthroughDraft extends WalkthroughParties {
  readonly briefId: string;
  readonly pairId: string;
  /** The items S09 acts on, by role in the walkthrough. */
  readonly items: {
    readonly decideTogether: string;
    readonly openParameter: string;
    readonly request: string;
  };
}

export async function buildWalkthroughDraft(db: Executor, projectId: string): Promise<WalkthroughDraft> {
  const photographer = await addProjectParty(db, projectId);
  const model = await addProjectParty(db, projectId);
  const pair = await createPairwiseAgreement(db, projectId, [photographer.id, model.id]);
  const brief = await openLiveBrief(db, projectId);
  const add = (spec: Parameters<typeof addBriefItem>[2]) => addBriefItem(db, brief.id, spec);

  // Universal: everyone on site affirms these.
  await add({ layer: 'universal', content: '[synthetic] The set stays closed to visitors during the shoot.' });
  await add({
    layer: 'universal',
    subjectPartyId: model.id,
    shape: 'declaration',
    content: '[synthetic] Declaration: nobody touches the model’s hair.',
  });
  // Shared: seen by everyone.
  await add({ layer: 'shared', content: '[synthetic] Call time 9:00 at the studio.' });
  const decideTogether = await add({
    layer: 'shared',
    content: '[synthetic] Delivery date for the edited files.',
    pending: 'decide_together',
  });
  const openParameter = await add({
    layer: 'shared',
    subjectPartyId: model.id,
    shape: 'open_parameter',
    itemKey: 'coverage_level',
    content: '[synthetic] Coverage level for the theme — the model sets it.',
    pending: 'subject',
  });
  await add({
    layer: 'shared',
    pairwiseAgreementId: pair.id,
    content: '[synthetic] Edited files are delivered as high-resolution images.',
  });
  const request = await add({
    layer: 'shared',
    pairwiseAgreementId: pair.id,
    subjectPartyId: model.id,
    shape: 'request',
    content: '[synthetic] Request: selected images may be used as an album cover.',
  });
  // Money: one field, the fee, private to the pair.
  await add({
    layer: 'money',
    pairwiseAgreementId: pair.id,
    itemKey: 'fee',
    content: '[synthetic] Fee for the shoot.',
    value: '[synthetic] 400 CAD',
  });

  return {
    photographerPartyId: photographer.id,
    modelPartyId: model.id,
    briefId: brief.id,
    pairId: pair.id,
    items: { decideTogether: decideTogether.id, openParameter: openParameter.id, request: request.id },
  };
}
