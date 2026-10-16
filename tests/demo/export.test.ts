import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { collectSnapshot, renderSnapshotHtml } from '../../src/demo/export.ts';
import { loadDemoFixtures } from '../../src/demo/fixtures.ts';
import { demoOperations } from '../../src/demo/operations.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { LogCapture } from '../support/app.ts';

/** The portable snapshot is self-contained, read-only, and carries nothing but synthetic records. */

let database: DatabaseHandle;
let app: FastifyInstance;
let html: string;
let fixtureIds: string[];

beforeAll(async () => {
  const logger = createLogger('info', new LogCapture());
  database = openDatabase(inject('runtimeUrl'), logger);
  app = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: demoOperations });
  await app.ready();
  const annotations = await loadDemoFixtures(app, database.db);
  fixtureIds = Object.keys(annotations.projects);
  // A hostile label proves embedded data cannot close the script element.
  const first = fixtureIds[0]!;
  const hostile = { projects: { ...annotations.projects, [first]: { ...annotations.projects[first]!, title: '</script><script>alert(1)</script>' } } };
  html = await renderSnapshotHtml(await collectSnapshot(app, hostile, new Date('2026-10-13T12:00:00Z')));
});
afterAll(async () => {
  await app.close();
  await database.close();
});

describe('portable snapshot', () => {
  it('inlines everything and forbids any network request', () => {
    expect(html).toContain('<meta http-equiv="Content-Security-Policy" content="default-src \'none\';');
    expect(html).not.toMatch(/src="\/|href="\/(?!#)/);
    expect(html).toContain('<style>');
    expect(html).toContain('id="ms-snapshot"');
  });

  it('embeds the list and every record the inspector reads', () => {
    const match = /<script type="application\/json" id="ms-snapshot">(.*?)<\/script>/s.exec(html);
    const data = JSON.parse(match![1]!) as { exportedAt: string; responses: Record<string, unknown> };
    expect(data.exportedAt).toBe('2026-10-13T12:00:00.000Z');
    for (const id of fixtureIds) expect(Object.keys(data.responses)).toContain(`/demo/projects/${id}/record`);
    expect(data.responses['/demo/projects']).toBeDefined();
    expect(data.responses['/fixture.json']).toBeDefined();
  });

  it('cannot be broken out of by embedded text', () => {
    // Exactly two script elements: the JSON data and the inspector.
    expect(html.match(/<script\b/g)).toHaveLength(2);
    expect(html).not.toContain('<script>alert(1)');
  });

  it('carries no credential, database location or internal principal', () => {
    for (const secret of ['postgres://', 'ms_runtime', 'ms_migrator', 'local_only', '127.0.0.1:', 'createdBy', 'principal_id']) {
      expect({ secret, present: html.includes(secret) }).toEqual({ secret, present: false });
    }
  });

  it('carries Cory’s rulings and the S08 draft framing, not the superseded wording', () => {
    expect(html).toContain('Draft composition only. Sharing, green state and signing arrive in S09–S11.');
    expect(html).toContain('private money only');
    expect(html).toContain('private to this pair');
    expect(html).toContain('On site means physical proximity');
    expect(html).toContain('wording not materialized (draft)');
    // Decided is not implemented, for D03 and D10.
    expect(html).toContain('D10 is decided for photo shoots, but no party view is built');
    for (const stale of [
      'may be left out is undecided',
      'Who counts as on site is undecided',
      'Private commercial and craft terms',
      '(D10 open)',
      'is undecided (D03)',
      'mostly undecided (D10)',
      'Leaving one out is how a term is dropped and resent (D02)',
      // Retired with S03–S05 (S08).
      'Present version',
      'sealed',
      'tick row',
      'A tick is not a signature',
      'escalation cannot happen',
      'Simulate — demo only',
      "id: 'R1'",
      "id: 'R2'",
    ]) {
      expect({ stale, present: html.includes(stale) }).toEqual({ stale, present: false });
    }
  });

  it('presents only the current Cory seams, with counsel items labelled as counsel', () => {
    expect(html).toContain('A walkthrough of the current seams, not the full list');
    expect(html).toContain('Counsel items');
    expect(html).toContain('For counsel, not Cory homework.');
    expect(html).not.toContain('four decisions');
    expect(html).not.toContain('positive term count');
  });

  it('says it is a read-only synthetic snapshot', () => {
    expect(html).toContain('read-only synthetic snapshot');
    expect(html).toContain('Synthetic demo');
  });
});
