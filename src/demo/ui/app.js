// Record Inspector for the local synthetic demo. Plain browser JavaScript, no
// build step. Every value from the server is written with textContent, never
// as HTML.

const state = {
  fixture: { projects: {} },
  projects: null,
  listError: null,
  selectedId: null,
  record: null,
  recordError: null,
  recordLoading: false,
};

// Actions the product does not have yet. Decided is not implemented: several
// of these are decided by Cory and simply not built.
const UNAVAILABLE = [
  ['Add a party', 'Decided (D03): a person joins through the invitation link and signs in with Google or Apple. Not built: account storage exists (S06), sign-in and invitation do not.'],
  ['Create a pairwise agreement', 'Not built. One agreement per pair, per project is decided (D02); the current storage does not enforce it yet.'],
  ['Add or present terms', 'Not built. Who may drop a declined term is open (R2).'],
  ['Tick a term', 'Not built. Only the party itself ticks (D12), signed in to its own account (D03).'],
  ['Sign', 'Not built. Everyone signs only once every term is green for everyone (D04); what the signing act looks like is still open.'],
  ['Send or invite', 'Decided (D03): the link is the invitation. Not built.'],
  ['View as a party', 'Decided for photo shoots (D10). Not built: no party view exists yet.'],
];

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
  for (const child of children) if (child) node.append(child);
  return node;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function shortId(id) {
  return id.slice(0, 8);
}

function idCode(id) {
  return el('code', { className: 'id', text: shortId(id), attrs: { title: id } });
}

// A portable snapshot (`npm run demo:export`) embeds every response it
// needs and has no server: reads come from the embedded copy and writes are
// refused.
const SNAPSHOT = (() => {
  const node = document.getElementById('ms-snapshot');
  if (!node) return null;
  try {
    return JSON.parse(node.textContent);
  } catch {
    return null;
  }
})();

async function api(method, url, body) {
  if (SNAPSHOT) {
    if (method !== 'GET') throw new Error('read_only_snapshot');
    if (!(url in SNAPSHOT.responses)) throw new Error('not_in_snapshot');
    return structuredClone(SNAPSHOT.responses[url]);
  }
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error?.code ?? `http_${res.status}`;
    const requestId = data?.error?.requestId;
    throw new Error(requestId ? `${code} (request ${requestId})` : code);
  }
  return data;
}

function toast(message, kind = 'ok') {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.className = `toast ${kind}`;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (node.hidden = true), 3500);
}

function annotationFor(projectId) {
  return state.fixture.projects?.[projectId] ?? null;
}

// ---- Project list ----

function renderList() {
  const root = document.getElementById('project-list');
  root.replaceChildren();

  if (state.listError) {
    root.append(
      el('div', { className: 'state error' }, [
        el('p', { text: `Could not load projects: ${state.listError}` }),
        retryButton(loadProjects),
      ]),
    );
    return;
  }
  if (state.projects === null) {
    root.append(el('p', { className: 'state loading', text: 'Loading projects…' }));
    return;
  }
  if (state.projects.length === 0) {
    root.append(
      el('div', { className: 'state empty' }, [
        el('p', { text: 'No projects yet.' }),
        el('p', { className: 'muted', text: 'Run npm run demo:reset to load fixtures, or create one.' }),
      ]),
    );
    return;
  }

  const list = el('ul', { className: 'project-list' });
  for (const project of state.projects) {
    const annotation = annotationFor(project.id);
    const link = el('a', { attrs: { href: `#/projects/${project.id}` } }, [
      el('span', { className: 'title', text: annotation?.title ?? 'Project (created in this session)' }),
      el('span', { className: 'meta' }, [
        idCode(project.id),
        el('span', { text: ` · ${plural(project.partyCount, 'party').replace('partys', 'parties')} · ${plural(project.agreementCount, 'agreement')}` }),
      ]),
    ]);
    if (project.id === state.selectedId) link.setAttribute('aria-current', 'page');
    list.append(el('li', {}, [link]));
  }
  root.append(list);
}

function retryButton(fn) {
  const button = el('button', { className: 'secondary', text: 'Retry', attrs: { type: 'button' } });
  button.addEventListener('click', () => void fn());
  return button;
}

// ---- Project detail ----

function section(title, hint, body) {
  return el('section', { className: 'card' }, [
    el('header', {}, [el('h3', { text: title }), hint ? el('p', { className: 'hint', text: hint }) : null]),
    body,
  ]);
}

function partyLabel(annotation, id) {
  return annotation?.parties?.[id] ?? state.positional?.[id] ?? 'Party';
}

/** Display order only: by fixture label, then id. Stored order carries no meaning. */
function byLabel(annotation) {
  return (a, b) => partyLabel(annotation, a).localeCompare(partyLabel(annotation, b)) || a.localeCompare(b);
}

function renderDetail() {
  const root = document.getElementById('detail');
  root.replaceChildren();

  if (!state.selectedId) {
    root.append(
      el('div', { className: 'state empty hero' }, [
        el('h2', { text: 'Select a project' }),
        el('p', {
          className: 'muted',
          text: 'Each project is the common container for one collaboration (D01). Pick one on the left.',
        }),
      ]),
    );
    return;
  }
  if (state.recordLoading) {
    root.append(el('p', { className: 'state loading', text: 'Loading record…' }));
    return;
  }
  if (state.recordError) {
    root.append(
      el('div', { className: 'state error' }, [
        el('p', { text: `Could not load this record: ${state.recordError}` }),
        retryButton(() => loadRecord(state.selectedId)),
      ]),
    );
    return;
  }
  const record = state.record;
  // Only ever render the selected project's record, so the inspector and its
  // simulator controls always act on what navigation shows.
  if (!record || record.project.id !== state.selectedId) return;
  const annotation = annotationFor(record.project.id);
  // Projects without fixture labels get positional labels by id order.
  state.positional = Object.fromEntries(
    [...record.parties].map((p) => p.id).sort().map((id, i) => [id, `Party ${i + 1}`]),
  );

  const head = el('header', { className: 'detail-head' }, [
    el('p', { className: 'eyebrow', text: 'Project' }),
    el('h2', { text: annotation?.title ?? 'Project created in this session' }),
    el('p', { className: 'meta' }, [el('span', { text: 'id ' }), el('code', { text: record.project.id })]),
    annotation
      ? el('div', { className: 'annotation' }, [
          el('p', { text: annotation.note }),
          el('p', { className: 'source', text: `Grounds: ${annotation.source}` }),
          el('p', {
            className: 'source',
            text: 'Fixture labels are demo annotations; the database stores no name, role or label for a party.',
          }),
        ])
      : el('div', { className: 'annotation' }, [
          el('p', { text: 'No fixture annotation. A project holds no description yet (S01).' }),
        ]),
  ]);

  // Parties
  let partiesBody;
  if (record.parties.length === 0) {
    partiesBody = el('div', { className: 'state empty' }, [el('p', { text: 'No parties in this project.' })]);
  } else {
    partiesBody = el('ul', { className: 'rows' });
    for (const party of [...record.parties].sort((x, y) => byLabel(annotation)(x.id, y.id))) {
      partiesBody.append(el('li', {}, [el('span', { text: partyLabel(annotation, party.id) }), idCode(party.id)]));
    }
  }

  // Agreements
  let agreementsBody;
  if (record.agreements.length === 0) {
    agreementsBody = el('div', { className: 'state empty' }, [el('p', { text: 'No pairwise agreements.' })]);
  } else {
    agreementsBody = el('div', { className: 'agreements' });
    for (const agreement of record.agreements) {
      const [one, two] = [...agreement.partyIds].sort(byLabel(annotation));
      agreementsBody.append(
        el('article', { className: 'agreement-block' }, [
          el('header', { className: 'agreement-head' }, [
            el('div', {}, [
              el('strong', { text: annotation?.agreements?.[agreement.id] ?? 'Pairwise agreement' }),
              el('p', { className: 'pair', text: `${partyLabel(annotation, one)}  ↔  ${partyLabel(annotation, two)}` }),
            ]),
            idCode(agreement.id),
          ]),
          renderLayer(agreement.terms, agreement.versions, [one, two], annotation, { layer: 'pairwise', base: `/demo/sim/agreements/${agreement.id}` }),
        ]),
      );
    }
  }

  const unavailable = el('ul', { className: 'unavailable' });
  for (const [label, reason] of UNAVAILABLE) {
    unavailable.append(
      el('li', {}, [
        el('button', { text: label, attrs: { type: 'button', disabled: '' } }),
        el('span', { text: reason }),
      ]),
    );
  }

  root.append(
    head,
    section('Parties', 'Project-local parties (S01). No role or identity. Binding a party to a sign-in account is stored by S06 but not shown here.', partiesBody),
    section(
      'Shared terms — universal layer',
      'Safety and consent terms held on the project. On site means physical proximity (D02, decided): everyone in the room ticks these. The current data model does not record who is present.',
      renderLayer(record.universal.terms, record.universal.versions, record.parties.map((p) => p.id).sort(byLabel(annotation)), annotation, { layer: 'universal', base: `/demo/sim/projects/${record.project.id}` }),
    ),
    section(
      'Pairwise agreements',
      'Current S03 storage: terms held on an agreement relating exactly two parties (S02). This is not the product’s privacy model. Cory has ruled three layers — universal safety, shared logistics including the call sheet (not built), and private money only — so craft terms here are a storage stand-in, known to be stale.',
      agreementsBody,
    ),
    legend(),
    SNAPSHOT ? null : simAssumptions(),
    section('Not available as product actions', SNAPSHOT ? 'Decided is not implemented: not built yet, or still open.' : 'Decided is not implemented: not built yet, or still open. The simulator stands in for some of them, labelled as simulation.', unavailable),
  );
}


// ---- Terms, presented versions and affirmation rows (S03–S05) ----

function formatTime(iso) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

function legend() {
  return el('aside', { className: 'legend' }, [
    el('p', {}, [
      el('strong', { text: 'Reading the grids. ' }),
      el('span', {
        text:
          'A ✓ cell is a stored tick row (S05 term affirmation evidence): that party, that exact frozen wording, a database time. ' +
          'A tick is not a signature. Everyone ticks until every term is green for everyone; only then does anyone sign (D04). ' +
          'Signing is not built, and what the signing act looks like is still open. ' +
          'An empty cell means no row is stored — nothing more. It is not "pending" or "declined", and nothing is shown as final.',
      }),
    ]),
  ]);
}

// What a later version may do, per Cory's 2026-10-14/15 rulings. A resend may
// only shrink: nothing is ever added (no escalation, D02). A shared safety
// term can never be left out (D02, D04). The simulator enforces both for the
// demo; production S04 does not yet.
const LATER_ROWS =
  'No rows can be recorded against a later version in the current storage: S05’s single-version guard predates Cory’s ruling that already-ticked terms stay ticked across a resend. That carry-forward is not built.';
const LAYER_COPY = {
  pairwise: {
    presentHint:
      'Choose the terms to present. A later version may keep or leave out terms of the version before it — leaving one out is how a declined term is dropped and resent (D02) — but may not add one: escalation cannot happen. Who may drop a term is open (R2); the demo operator stands in.',
    newTermNote: 'Not in the previous version, so it cannot be added to a resend (no escalation).',
    notInLater: (sequence, content) => `Dropped since version ${sequence}: “${content}”`,
    notInLaterNote: null,
    laterVersion: LATER_ROWS,
  },
  universal: {
    presentHint:
      'A shared safety term can never be dropped (D02, D04, decided). Once version 1 is presented, a later version must keep every term, and nothing may be added.',
    newTermNote: 'Not in the presented version, so it cannot be added to a later one.',
    notInLater: (sequence, content) => `Not in this version, though in version ${sequence}: “${content}”`,
    notInLaterNote: 'Stored before Cory ruled that a shared safety term can never be left out (2026-10-14/15). The demo no longer allows this.',
    laterVersion: LATER_ROWS,
  },
};

function renderLayer(terms, versions, partyIds, annotation, ctx) {
  const wrap = el('div', { className: 'layer' });
  if (terms.length === 0 && versions.length === 0) {
    wrap.append(el('div', { className: 'state empty' }, [el('p', { text: 'No terms stored.' })]));
    if (!SNAPSHOT && ctx) wrap.append(simPanel(terms, versions, ctx));
    return wrap;
  }

  const presentedSources = new Set(versions.flatMap((v) => v.terms.map((t) => t.sourceTermId)));
  const neverPresented = terms.filter((t) => !presentedSources.has(t.id));

  if (versions.length === 0) {
    wrap.append(el('p', { className: 'hint', text: 'Terms are stored but no version has been presented.' }));
  }

  versions.forEach((version, index) => {
    const previous = index > 0 ? versions[index - 1] : null;
    wrap.append(renderVersion(version, previous, versions.length, partyIds, annotation, ctx));
  });

  if (neverPresented.length > 0) {
    const list = el('ol', { className: 'draft-terms' });
    for (const term of neverPresented) list.append(el('li', { text: term.content }));
    wrap.append(
      el('div', { className: 'drafts' }, [
        el('p', { className: 'hint', text: 'Stored, never presented (S03). Not part of any version.' }),
        list,
      ]),
    );
  }
  if (!SNAPSHOT && ctx) wrap.append(simPanel(terms, versions, ctx));
  return wrap;
}

function renderVersion(version, previous, versionCount, partyIds, annotation, ctx) {
  const rows = new Map(version.affirmations.map((a) => [`${a.presentedTermId}|${a.partyId}`, a]));

  const head = el('header', { className: 'version-head' }, [
    el('span', { className: 'badge', text: `Version ${version.sequence}` }),
    el('span', { className: 'sealed', text: 'sealed' }),
    el('span', { className: 'meta', text: `presented ${formatTime(version.presentedAt)}` }),
  ]);

  const copy = LAYER_COPY[ctx.layer];
  const notes = [];
  if (previous) {
    const kept = new Set(version.terms.map((t) => t.sourceTermId));
    const dropped = previous.terms.filter((t) => !kept.has(t.sourceTermId));
    for (const term of dropped) {
      notes.push(el('p', { className: 'dropped', text: copy.notInLater(previous.sequence, term.content) }));
    }
    if (dropped.length > 0 && copy.notInLaterNote) notes.push(el('p', { className: 'hint', text: copy.notInLaterNote }));
  }
  if (versionCount > 1) {
    notes.push(
      el('p', {
        className: 'hint',
        text:
          version.sequence === 1
            ? 'Unchanged by the later version, and kept here because that is how storage retains versions. Whether a dropped term persists in retained history is an open question for Cory (R1). Once a later version exists, no new rows can be recorded here (S05 guard).'
            : copy.laterVersion,
      }),
    );
  }

  const table = el('table', { className: 'grid-table' });
  const headRow = el('tr', {}, [el('th', { text: '#', attrs: { scope: 'col' } }), el('th', { text: 'Frozen wording', attrs: { scope: 'col' } })]);
  for (const partyId of partyIds) headRow.append(el('th', { text: partyLabel(annotation, partyId), attrs: { scope: 'col' } }));
  table.append(el('thead', {}, [headRow]));

  const body = el('tbody');
  for (const term of version.terms) {
    const tr = el('tr', {}, [el('td', { className: 'pos', text: String(term.position) }), el('td', { text: term.content })]);
    for (const partyId of partyIds) {
      const row = rows.get(`${term.id}|${partyId}`);
      tr.append(
        row
          ? el('td', { className: 'cell yes', attrs: { title: `Row stored ${formatTime(row.affirmedAt)}` } }, [
              el('span', { text: '✓ ' }),
              el('span', { className: 'meta', text: new Date(row.affirmedAt).toLocaleTimeString() }),
            ])
          : emptyCell(version, versionCount, term, partyId, annotation, ctx),
      );
    }
    body.append(tr);
  }
  table.append(body);

  return el('section', { className: 'version' }, [head, ...notes, el('div', { className: 'table-scroll' }, [table])]);
}


// ---- Remaining Cory seams, and what is decided but not built ----
// Wording follows decisions/*.md and the 2026-10-09–15 reconciliation note.
// Each open seam is posed, never answered.

const DECISIONS = [
  {
    id: 'D04 wording',
    title: 'No-means-no wording',
    file: 'decisions/D04-terms-and-affirmation.md',
    built: [
      'Decided: a safety term every person ticks individually, with a signed acknowledgment on every brief.',
      'Decided: one term, two faces — for the person protected, the tools she has; for the people bound by it, the obligation.',
      'Not built: no term content or presentation exists for it.',
    ],
    open: ['The exact wording. Cory writes it.'],
    blocks: ['Presenting the no-means-no term to anyone'],
    question: 'What does the no-means-no term say, for the person it protects and for the people it binds?',
  },
  {
    id: 'D04 signing',
    title: 'What signing looks like',
    file: 'decisions/D04-terms-and-affirmation.md',
    built: [
      'Decided: ticking and signing are separate acts. Everyone ticks until every term is green for everyone; only then does anyone sign.',
      'Built: per-term tick rows (S05). They are not signatures.',
      'Not built: any signing step.',
    ],
    open: ['The visible signing act once everything is green.'],
    blocks: ['Building the signing step'],
    question: 'Once every term is green for everyone, what does each person do to sign?',
  },
  {
    id: 'R1',
    title: 'A declined term versus retained versions',
    file: 'decisions/2026-10-09-15-cory-reconciliation.md',
    built: [
      'Decided: a “no” is not recorded; the final contract is the record (Q10).',
      'Decided: every version is retained invisibly as evidence (Q17).',
      'Built: storage keeps every presented version, including one holding a term later dropped (this inspector shows them).',
    ],
    open: ['Whether a dropped term stays in the evidentiary version history.'],
    blocks: ['Designing evidence retention for resends'],
    question: 'When a declined term is dropped and the rest resent, should the earlier version that held it stay in the evidence record?',
  },
  {
    id: 'R2',
    title: 'Who may drop a declined term',
    file: 'decisions/2026-10-09-15-cory-reconciliation.md',
    built: [
      'Decided: authorship of a term is not recorded (Q9).',
      'Decided: only whoever proposed a declined term may drop it (Q9).',
      'Not built: no presenter or proposer is stored; the demo operator stands in.',
    ],
    open: ['How “only the proposer may drop” is enforced without recording who proposed.'],
    blocks: ['Authorizing drop-and-resend for real people'],
    question: 'Should who proposed a term be not stored at all, stored only as invisible evidence, or stored but never shown?',
  },
  {
    id: 'D05',
    title: 'Remaining vocabulary',
    file: 'decisions/D05-vocabulary.md',
    built: [
      'Decided: “brief” before signing, “contract” after; each person walks away with the contract.',
      'Every demo screen still uses internal code names, not product words.',
    ],
    open: ['The words for a presented version, a response, and the archived states — to be drafted in context, on real screens, for Cory to react to.'],
    blocks: ['Any screen, email or document a person outside the team reads'],
    question: 'Seeing a draft screen and email, what should a presented version, a response and an archived state be called?',
  },
];

const CAPABILITIES = [
  ['Present the no-means-no term', ['D04 wording']],
  ['Sign once every term is green', ['D04 signing']],
  ['Keep evidence across a resend', ['R1']],
  ['Let a real person drop a declined term', ['R2']],
  ['Show any product words to a person', ['D05']],
];

// Decided by Cory but not built. DECIDED is not IMPLEMENTED.
const DECIDED_NOT_BUILT = [
  'D03 participation credential: account by Google or Apple sign-in, the link is the invitation. Account storage exists (S06); sign-in and invitation do not.',
  'D10 what each party sees (photo shoots): decided in full. No party view is built.',
  'D02 lifecycle: answered except R2 — one agreement per pair, shrink-only resends, no organizer confirmation. Mostly not built.',
  'Three layers: universal safety, shared logistics including the call sheet, private money only. The current storage still has the older two layers.',
  'On site means physical proximity. Presence is not recorded.',
  'D11 verification at first participation. Not built.',
  'D06 pre-launch real use in sequence. Gate 2 is not open.',
];

// Counsel items: not Cory homework.
const COUNSEL_ITEMS = [
  'Which document templates need legal review (D08).',
  'Retention periods and statutory erasure (D09).',
];

function bulletList(items, className) {
  const ul = el('ul', { className });
  for (const item of items) ul.append(el('li', { text: item }));
  return ul;
}

function renderDecisions() {
  const root = document.getElementById('detail');
  root.replaceChildren();

  const strip = el('table', { className: 'capability-table' });
  const head = el('tr', {}, [el('th', { text: 'Capability', attrs: { scope: 'col' } })]);
  for (const d of DECISIONS) head.append(el('th', { text: d.id, attrs: { scope: 'col' } }));
  strip.append(el('thead', {}, [head]));
  const body = el('tbody');
  for (const [capability, needs] of CAPABILITIES) {
    const tr = el('tr', {}, [el('th', { text: capability, attrs: { scope: 'row' } })]);
    for (const d of DECISIONS) {
      tr.append(
        needs.includes(d.id)
          ? el('td', { className: 'needs', text: 'waits', attrs: { title: `${capability} waits on ${d.id}` } })
          : el('td', { className: 'free', text: '' }),
      );
    }
    body.append(tr);
  }
  strip.append(body);

  const cards = el('div', { className: 'decision-cards' });
  for (const d of DECISIONS) {
    cards.append(
      el('article', { className: 'decision', attrs: { id: `decision-${d.id.replace(/\s+/g, '-')}` } }, [
        el('header', {}, [
          el('span', { className: 'badge', text: d.id }),
          el('h3', { text: d.title }),
          el('p', { className: 'source', text: d.file }),
        ]),
        el('div', { className: 'decision-cols' }, [
          el('div', {}, [el('h4', { text: 'Decided and built so far' }), bulletList(d.built, 'built')]),
          el('div', {}, [el('h4', { text: 'Still open' }), bulletList(d.open, 'open')]),
          el('div', {}, [el('h4', { text: 'Waiting on it' }), bulletList(d.blocks, 'blocks')]),
        ]),
        el('div', { className: 'question' }, [el('h4', { text: 'Smallest question' }), el('p', { text: d.question })]),
      ]),
    );
  }

  root.append(
    el('header', { className: 'detail-head' }, [
      el('p', { className: 'eyebrow', text: 'For Cory' }),
      el('h2', { text: 'Remaining open seams' }),
      el('p', {
        className: 'meta',
        text:
          'The few product questions still Cory’s to answer, what is already decided around each, and the smallest question that would close it. ' +
          'Questions only: nothing here suggests an answer.',
      }),
      el('p', {
        className: 'meta scope-note',
        text:
          'A walkthrough of the current seams, not the full list; decisions/README.md lists every decision and its status. ' +
          'Decided is not implemented: much of what Cory has decided is not built yet (below).',
      }),
    ]),
    section('What waits on what', 'Each row is something the product cannot do until the seam is answered.', el('div', { className: 'table-scroll' }, [strip])),
    cards,
    section('Decided, not built', 'Cory has answered these. Building them is engineering work, not a question for him.', bulletList(DECIDED_NOT_BUILT, 'decided-not-built')),
    section('Counsel items', 'For counsel, not Cory homework.', bulletList(COUNSEL_ITEMS, 'counsel-items')),
  );
}


// ---- Simulator (live demo only; never in the snapshot) ----

const SIM_ERRORS = {
  version_not_affirmable: 'Only a sole version 1 can take rows in current storage (S05 guard). Carrying ticks forward across a resend is decided but not built.',
  term_added_after_presentation: 'A later version cannot add a term the previous version did not hold: escalation cannot happen (D02).',
  universal_term_omitted: 'A shared safety term can never be left out of a later version (D02, D04).',
  already_affirmed: 'That party already has a row for this term.',
  party_not_in_agreement: 'That party is not one of this agreement’s two parties.',
  term_not_in_container: 'A chosen term is not stored in this container.',
  presented_term_not_found: 'That presented term is not in this container.',
  affirmed_too_soon: 'The version was presented in the same transaction; try again.',
  invalid_input: 'Check the input: a term needs some text, and a version needs at least one term.',
};

function simError(error) {
  const code = String(error.message).split(' ')[0];
  return SIM_ERRORS[code] ?? `Rejected: ${error.message}`;
}

async function simulate(url, body, success) {
  // The project this action was taken on. If navigation has moved on by the
  // time it completes, the new view is left alone.
  const projectId = state.record?.project.id ?? null;
  try {
    await api('POST', url, body);
    toast(success);
  } catch (error) {
    toast(simError(error), 'error');
  }
  await loadProjects();
  if (projectId !== null && state.selectedId === projectId) await loadRecord(projectId);
}

function emptyCell(version, versionCount, term, partyId, annotation, ctx) {
  const cell = el('td', { className: 'cell none', attrs: { 'aria-label': 'no row stored' } });
  // Offer the simulated act only where S05 would accept a row: a sole version 1.
  if (SNAPSHOT || !ctx || versionCount !== 1 || version.sequence !== 1) return cell;
  const button = el('button', {
    className: 'sim-affirm',
    text: 'simulate',
    attrs: {
      type: 'button',
      title: `Simulation: record a tick row as if ${partyLabel(annotation, partyId)} had ticked this term. Not a signature. In the product only the party itself ticks (D12), signed in to its own account (D03).`,
    },
  });
  button.addEventListener('click', () => {
    button.disabled = true;
    void simulate(`${ctx.base}/affirmations`, { presentedTermId: term.id, partyId }, `Simulated tick row recorded for ${partyLabel(annotation, partyId)}.`);
  });
  cell.append(button);
  return cell;
}

function simPanel(terms, versions, ctx) {
  const latest = versions.at(-1);
  const inLatest = new Set(latest ? latest.terms.map((t) => t.sourceTermId) : terms.map((t) => t.id));

  const input = el('input', { attrs: { type: 'text', maxlength: '2000', placeholder: '[synthetic] term text', 'aria-label': 'New term text' } });
  const add = el('button', { className: 'secondary', text: 'Add term', attrs: { type: 'button' } });
  add.addEventListener('click', () => {
    if (!/\S/.test(input.value)) return toast('A term needs some text.', 'error');
    add.disabled = true;
    void simulate(`${ctx.base}/terms`, { content: input.value }, 'Term stored (not yet presented).');
  });

  // Once a version exists: no term outside it may be added (both layers), and
  // no shared term may be left out (universal). The server enforces the same.
  const copy = LAYER_COPY[ctx.layer];
  const boxes = el('ul', { className: 'sim-terms' });
  for (const term of terms) {
    const box = el('input', { attrs: { type: 'checkbox', value: term.id, id: `sim-${term.id}` } });
    box.checked = inLatest.has(term.id);
    const addable = !latest || inLatest.has(term.id);
    const droppable = ctx.layer !== 'universal' || !latest;
    if (!addable || !droppable) box.disabled = true;
    const label = el('label', { text: term.content, attrs: { for: `sim-${term.id}` } });
    boxes.append(el('li', {}, [box, label, addable ? null : el('span', { className: 'hint sim-locked', text: copy.newTermNote })]));
  }
  const next = (latest?.sequence ?? 0) + 1;
  const present = el('button', { className: 'secondary', text: `Present version ${next}`, attrs: { type: 'button' } });
  present.addEventListener('click', () => {
    const chosen = [...boxes.querySelectorAll('input:checked')].map((b) => b.value);
    if (chosen.length === 0) return toast('Choose at least one term to present.', 'error');
    present.disabled = true;
    void simulate(`${ctx.base}/versions`, { termIds: chosen }, `Version ${next} presented and sealed.`);
  });

  return el('details', { className: 'sim-panel' }, [
    el('summary', { text: 'Simulate — demo only' }),
    el('p', { className: 'hint', text: 'The demo operator adds and presents terms. In the product this is not built, and who may drop a declined term is open (R2).' }),
    el('div', { className: 'sim-row' }, [input, add]),
    terms.length > 0
      ? el('div', {}, [
          el('p', { className: 'hint sim-present-hint', text: LAYER_COPY[ctx.layer].presentHint }),
          boxes,
          present,
        ])
      : null,
  ]);
}

function simAssumptions() {
  return el('aside', { className: 'sim-assumptions' }, [
    el('strong', { text: 'Simulation assumptions. ' }),
    el('span', {
      text:
        'The demo operator adds and presents terms and records tick rows naming a party. None of that is a product act: ' +
        'who may drop a declined term is open (R2), and only a party may tick for itself (D12), signed in to its own account (D03 decided, not built). ' +
        'Tick rows are not signatures; signing is not built. ' +
        'Demo-only rules matching Cory’s rulings: a later version may not add a term (no escalation), and a shared safety term may not be left out. Production storage does not enforce these yet. ' +
        'A version needing at least one term is a current storage restriction: the database requires a positive term count (S04). That is how it is built today, not a product rule. Not repeating a term is a simulator input rule. Everything else — frozen versions, numbering, which version can take rows — is the database’s own S03–S05 rules.',
    }),
  ]);
}

// ---- Data loading ----

async function loadFixture() {
  try {
    state.fixture = await api('GET', '/fixture.json');
  } catch {
    state.fixture = { projects: {} };
  }
}

async function loadProjects() {
  state.listError = null;
  state.projects = null;
  renderList();
  try {
    const data = await api('GET', '/demo/projects');
    state.projects = data.projects;
  } catch (error) {
    state.listError = error.message;
  }
  renderList();
}

// Each project load gets a generation number. Navigating elsewhere (another
// project, the Decisions view, or nothing selected) starts a new generation,
// so a response that arrives late, success or failure, is dropped instead of
// overwriting what is on screen.
let recordGeneration = 0;

function invalidateRecordLoads() {
  recordGeneration += 1;
  state.record = null;
  state.recordError = null;
  state.recordLoading = false;
}

async function loadRecord(id) {
  recordGeneration += 1;
  const generation = recordGeneration;
  state.recordLoading = true;
  state.recordError = null;
  state.record = null;
  renderDetail();
  let record = null;
  let error = null;
  try {
    record = await api('GET', `/demo/projects/${encodeURIComponent(id)}/record`);
  } catch (e) {
    error = e.message;
  }
  if (generation !== recordGeneration) return;
  state.record = record;
  state.recordError = error;
  state.recordLoading = false;
  renderDetail();
}

function route() {
  const decisionsLink = document.getElementById('decisions-link');
  if (location.hash === '#/decisions') {
    state.selectedId = null;
    invalidateRecordLoads();
    renderList();
    decisionsLink?.setAttribute('aria-current', 'page');
    renderDecisions();
    return;
  }
  decisionsLink?.removeAttribute('aria-current');
  const match = /^#\/projects\/([0-9a-f-]{36})$/i.exec(location.hash);
  state.selectedId = match ? match[1].toLowerCase() : null;
  renderList();
  if (state.selectedId) void loadRecord(state.selectedId);
  else {
    invalidateRecordLoads();
    renderDetail();
  }
}

async function startSimulation(button) {
  button.disabled = true;
  try {
    const project = await api('POST', '/demo/sim/scenarios', {});
    await loadProjects();
    location.hash = `#/projects/${project.id}`;
    toast('New simulation: one project, two parties, one pairwise agreement. Open “Simulate” in each layer.');
  } catch (error) {
    toast(`Could not start a simulation: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function createProject(button) {
  button.disabled = true;
  button.textContent = 'Creating…';
  try {
    const project = await api('POST', '/projects', {});
    await loadProjects();
    location.hash = `#/projects/${project.id}`;
    toast('Project created.');
  } catch (error) {
    toast(`Could not create a project: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Create project';
  }
}

const createButton = document.getElementById('create-project');
if (SNAPSHOT) {
  createButton.disabled = true;
  createButton.textContent = 'Create project (live demo only)';
  document.getElementById('create-hint').textContent = 'This is a read-only snapshot. Nothing can be created or changed.';
  document.getElementById('snapshot-note').hidden = false;
  document.getElementById('snapshot-note').textContent =
    `Read-only snapshot of synthetic fixtures, exported ${new Date(SNAPSHOT.exportedAt).toLocaleString()} from the local demo. Not a product build.`;
  document.getElementById('start-simulation').hidden = true;
} else {
  createButton.addEventListener('click', (event) => void createProject(event.currentTarget));
  document.getElementById('start-simulation').addEventListener('click', (event) => void startSimulation(event.currentTarget));
}
window.addEventListener('hashchange', route);

await loadFixture();
await loadProjects();
route();
