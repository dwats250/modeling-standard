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
  ['Add a party', 'Decided (D03): a person joins through the invitation link and signs in with Google or Apple. Not built: account binding (S06) and invitation links (S07) are stored; sign-in and delivery are not.'],
  ['Compose the brief', 'Not built as a product action. Draft composition has data functions (S08) but no route, and no participant surface exists.'],
  ['Share the brief', 'Not built (S09).'],
  ['Green state', 'Not built (S10). Each party acts only for itself (D12), signed in to its own account (D03).'],
  ['Sign', 'Not built (S11). Everyone signs only once every term is green for everyone (D04); what the signing act looks like is still open.'],
  ['View as a party', 'Decided for photo shoots (D10). Not built: a visibility filter exists as a data function (S08), but no party view does.'],
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
        el('span', { text: ` · ${plural(project.partyCount, 'party').replace('partys', 'parties')} · ${plural(project.agreementCount, 'pair')}` }),
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
  // Only ever render the selected project's record, so the inspector always
  // shows what navigation selected.
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

  // Pair-scope records
  let pairsBody;
  if (record.agreements.length === 0) {
    pairsBody = el('div', { className: 'state empty' }, [el('p', { text: 'No pairs.' })]);
  } else {
    pairsBody = el('ul', { className: 'rows' });
    for (const agreement of record.agreements) {
      pairsBody.append(
        el('li', {}, [el('span', { text: pairLabel(annotation, record, agreement.id) }), idCode(agreement.id)]),
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
    el('p', { className: 'draft-banner', attrs: { role: 'note' }, text: DRAFT_BANNER }),
    section('Parties', 'Project-local parties (S01). No role or identity. Binding a party to a sign-in account is stored by S06 but not shown here.', partiesBody),
    section(
      'Pairs',
      'Internal pair-scope records: one per pair of parties, per project (S02, S08). Not a product noun and not a contract. A money item or a pair-scoped shared item names the pair it is between.',
      pairsBody,
    ),
    renderBrief(record, annotation),
    section('Not available as product actions', 'Decided is not implemented: not built yet, or still open.', unavailable),
  );
}

// ---- The draft live brief (S08) ----

const DRAFT_BANNER = 'Draft composition only. Sharing, green state and signing arrive in S09–S11.';

const LAYERS = [
  ['universal', 'Universal layer', 'Safety terms for everyone on site (D02: physical proximity). Seen by every party. An item may have a subject (Q7). Presence is not recorded.'],
  ['shared', 'Shared layer', 'Logistics and craft terms seen by every party (D10). A pair scope says who an item is between, not who sees it.'],
  ['money', 'Money layer', 'One field: the fee (Q6), at most one per pair. Each fee is private to its pair (D10).'],
];

const SHAPE_LABELS = { declaration: 'declaration', request: 'request', open_parameter: 'open parameter' };
const PENDING_LABELS = { decide_together: 'pending: decide together', subject: 'pending: awaiting its subject' };

function pairLabel(annotation, record, agreementId) {
  const labelled = annotation?.agreements?.[agreementId];
  if (labelled) return labelled;
  const agreement = record.agreements.find((a) => a.id === agreementId);
  if (!agreement) return 'Pair';
  const [one, two] = [...agreement.partyIds].sort(byLabel(annotation));
  return `Pair: ${partyLabel(annotation, one)} ↔ ${partyLabel(annotation, two)}`;
}

function tag(text, className = '') {
  return el('span', { className: `tag ${className}`.trim(), text });
}

function renderItem(item, record, annotation) {
  const tags = el('div', { className: 'tags' });
  if (item.layer === 'money') tags.append(tag(`private to this pair · ${pairLabel(annotation, record, item.pairwiseAgreementId)}`, 'private'));
  else if (item.pairwiseAgreementId) tags.append(tag(`between · ${pairLabel(annotation, record, item.pairwiseAgreementId)}`));
  else tags.append(tag('project-wide'));
  if (item.subjectPartyId) tags.append(tag(`subject · ${partyLabel(annotation, item.subjectPartyId)}`));
  if (item.shape) tags.append(tag(`shape · ${SHAPE_LABELS[item.shape]}`));
  if (item.pending) tags.append(tag(PENDING_LABELS[item.pending], 'pending'));
  if (item.itemKey) tags.append(tag(`item key ${item.itemKey}`, 'key'));

  // Wording is shown only when it is stored. A keyed item without wording is
  // instrumentation, never text that looks like part of a document.
  const wording =
    item.content === null
      ? el('p', { className: 'instrumentation', text: `item key ${item.itemKey} — wording not materialized (draft)` })
      : el('p', { className: 'wording', text: item.content });

  const value =
    item.value === null ? null : el('p', { className: 'value' }, [el('span', { className: 'muted', text: 'value ' }), el('span', { text: item.value })]);

  return el('li', { className: 'brief-item', attrs: { 'data-layer': item.layer } }, [
    el('span', { className: 'pos', text: String(item.position) }),
    el('div', { className: 'item-body' }, [wording, value, tags]),
  ]);
}

function renderBrief(record, annotation) {
  if (!record.brief) {
    return section(
      'Live brief',
      'Draft composition only.',
      el('div', { className: 'state empty' }, [el('p', { text: 'No live brief has been opened for this project.' })]),
    );
  }
  const body = el('div', { className: 'brief' }, [
    el('p', { className: 'meta' }, [el('span', { text: 'brief ' }), idCode(record.brief.id)]),
  ]);
  if (record.brief.items.length === 0) {
    body.append(el('div', { className: 'state empty' }, [el('p', { text: 'The draft brief has no items.' })]));
  }
  for (const [layer, title, hint] of LAYERS) {
    const items = record.brief.items.filter((item) => item.layer === layer);
    if (items.length === 0) continue;
    const list = el('ol', { className: 'brief-items' });
    for (const item of items) list.append(renderItem(item, record, annotation));
    body.append(
      el('section', { className: 'layer', attrs: { 'data-layer': layer } }, [
        el('h4', { text: title }),
        el('p', { className: 'hint', text: hint }),
        list,
      ]),
    );
  }
  return section(
    'Live brief — draft',
    'One mutable workspace per project (S08). Items are shown in display order within each layer. Nothing here records when anything happened or who did it: live state is not evidence (HC1), and there is no proposer (HC2).',
    body,
  );
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
      'Not built: the brief can hold an item keyed no_means_no (S08), but no wording exists for it.',
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
      'Not built: ticking (S10) and signing (S11).',
    ],
    open: ['The visible signing act once everything is green.'],
    blocks: ['Building the signing step'],
    question: 'Once every term is green for everyone, what does each person do to sign?',
  },
  {
    id: 'D05',
    title: 'Remaining vocabulary',
    file: 'decisions/D05-vocabulary.md',
    built: [
      'Decided: “brief” before signing, “contract” after; each person walks away with the contract.',
      'Every demo screen still uses internal code names, not product words.',
    ],
    open: ['The remaining words D05 lists as open — to be drafted in context, on real screens, for Cory to react to.'],
    blocks: ['Any screen, email or document a person outside the team reads'],
    question: 'Seeing a draft screen and email, what should the remaining open terms in D05 be called?',
  },
];

const CAPABILITIES = [
  ['Present the no-means-no term', ['D04 wording']],
  ['Sign once every term is green', ['D04 signing']],
  ['Show any product words to a person', ['D05']],
];

// Decided by Cory but not built. DECIDED is not IMPLEMENTED.
const DECIDED_NOT_BUILT = [
  'D03 participation credential: account by Google or Apple sign-in, the link is the invitation. Account storage exists (S06); sign-in and invitation do not.',
  'D10 what each party sees (photo shoots): decided in full. No party view is built.',
  'D02 lifecycle: sharing, ticking and signing. Not built (S09–S11).',
  'Three layers: universal safety, shared logistics including the call sheet, private money only. Built as draft topology (S08); the call sheet is not built.',
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

async function startScenario(button) {
  button.disabled = true;
  try {
    const project = await api('POST', '/demo/sim/scenarios', {});
    await loadProjects();
    location.hash = `#/projects/${project.id}`;
    toast('New scenario: one project, two parties, one pair. No live brief is opened.');
  } catch (error) {
    toast(`Could not start a scenario: ${error.message}`, 'error');
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
  document.getElementById('start-simulation').addEventListener('click', (event) => void startScenario(event.currentTarget));
}
window.addEventListener('hashchange', route);

await loadFixture();
await loadProjects();
route();
