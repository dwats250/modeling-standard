// Record Inspector for the local synthetic demo. Plain browser JavaScript, no
// build step. Every value from the server is written with textContent, never
// as HTML. The one exception is the S11 proposal rendering, a whole document
// the server renders with every stored value escaped, shown only inside a
// sandboxed iframe (no scripts, no same origin).

const state = {
  fixture: { projects: {} },
  projects: null,
  listError: null,
  selectedId: null,
  record: null,
  recordError: null,
  recordLoading: false,
  // The synthetic party being simulated, per project. Display state only.
  actors: {},
  // The last stage this browser rendered per project, and the stage change the
  // latest reload produced. Display state only: a transient cue, never kept.
  lastStage: {},
  transition: null,
};

// ---- Engineering notes: decision references, ids and schema labels ----
// Collapsed by default so the product story reads first. A per-browser
// display preference only.

function loadEngineeringNotes() {
  try {
    return localStorage.getItem('ms-demo-engineering-notes') === 'on';
  } catch {
    return false;
  }
}

function setEngineeringNotes(on) {
  document.body.classList.toggle('show-eng', on);
  const toggle = document.getElementById('eng-toggle');
  toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  toggle.textContent = on ? 'Hide engineering notes' : 'Engineering notes';
  try {
    localStorage.setItem('ms-demo-engineering-notes', on ? 'on' : 'off');
  } catch {
    // A convenience only.
  }
}

// Actions the product does not have yet. Decided is not implemented: several
// of these are decided by Cory and simply not built.
const UNAVAILABLE = [
  ['Add a party', 'Decided (D03): a person joins through the invitation link and signs in with Google or Apple. Not built: account binding (S06) and invitation links (S07) are stored; sign-in and delivery are not.'],
  ['Compose the brief for real', 'Not a product action. The demo composer (Shoots → New shoot) composes as the demo operator; who composes in the product, and how, is not ruled.'],
  ['Share, resolve and tick for real', 'Not a product action. These are data functions (S09); this page only simulates them for synthetic parties.'],
  ['Sign', 'Not built: what the signing act looks like is still open (D04). Everyone signs only once every term is green for everyone. The operator can store a final contract synthetically (S11).'],
  ['View as a party for real', 'Decided for photo shoots (D10). The demo shows party-filtered screens (Shoots → look at it as each person) by simulation; there is no sign-in, so no real party view exists.'],
];

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
  for (const child of children) if (child) node.append(child);
  return node;
}

/** A developer note: decision references, ids, schema labels. Hidden unless engineering notes are on. */
function eng(text, tag = 'p') {
  return el(tag, { className: 'eng eng-note', text });
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

// Demo annotations (labels, titles, fixture notes) come from the server's
// annotation store, the same for every browser; the database stores none.
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
    const title = annotation?.title ?? 'Project (created in this session)';
    const link = el('a', { attrs: { href: `#/projects/${project.id}` } }, [
      el('span', { className: 'title', text: title }),
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

function section(title, hint, body, { engNote = null, className = 'card' } = {}) {
  return el('section', { className }, [
    el('header', {}, [el('h3', { text: title }), hint ? el('p', { className: 'hint', text: hint }) : null, engNote ? eng(engNote) : null]),
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

/** On a narrow screen the project list sits below the brief; this jumps to it. */
function jumpToProjects() {
  const node = el('button', { className: 'jump-projects', text: 'All projects ↓', attrs: { type: 'button' } });
  node.addEventListener('click', () => document.getElementById('sidebar').scrollIntoView({ behavior: 'smooth' }));
  return node;
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
          text: 'Start the walkthrough to see a photographer and a model take one shared brief to ready to sign, or pick a project.',
        }),
        eng('Each project is the common container for one collaboration (D01).'),
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

  let intro = null;
  if (annotation?.note) {
    intro = el('div', { className: 'annotation' }, [
      el('p', { text: annotation.note }),
      annotation.source ? eng(`Grounds: ${annotation.source}`) : null,
      eng('Fixture labels are demo annotations; the database stores no name, role or label for a party.'),
    ]);
  } else if (!annotation) {
    intro = el('div', { className: 'annotation' }, [
      el('p', { text: `A project created in this session.${record.parties.length === 0 ? ' No parties yet.' : ''}` }),
      eng('No fixture annotation. A project holds no description yet (S01).'),
    ]);
  }

  const head = el('header', { className: 'detail-head' }, [
    el('div', { className: 'head-row' }, [
      el('p', { className: 'eyebrow', text: EYEBROWS[annotation?.kind] ?? 'Project' }),
      jumpToProjects(),
    ]),
    el('h2', { text: annotation?.title ?? 'Project created in this session' }),
    el('p', { className: 'meta eng' }, [el('span', { text: 'id ' }), el('code', { text: record.project.id })]),
    record.brief ? renderStory(record, annotation) : null,
    intro,
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
    record.brief ? renderBand(record, annotation) : null,
    renderBrief(record, annotation),
    ...(record.contract ? [renderContract(record, annotation)] : []),
    el('details', { className: 'card not-built' }, [
      el('summary', { text: 'Not built yet: signing, sign-in and more' }),
      el('p', { className: 'hint', text: 'Decided is not implemented: not built yet, or still open.' }),
      unavailable,
    ]),
    section(
      'Parties',
      'Project-local parties (S01). No role or identity. Binding a party to a sign-in account is stored by S06 but not shown here.',
      partiesBody,
      { className: 'card eng' },
    ),
    section(
      'Pairs',
      'Internal pair-scope records: one per pair of parties, per project (S02, S08). Not a product noun and not a contract. A money item or a pair-scoped shared item names the pair it is between.',
      pairsBody,
      { className: 'card eng' },
    ),
  );
}

// ---- The live brief (S08 topology, S09 share and green state) ----

const LAYERS = [
  [
    'universal',
    'Universal',
    'Everyone on site sees these',
    'Safety for everyone physically on site. Everyone on site ticks each item, and nothing here can be removed once shared.',
    'Q8: on site is physical proximity. Universal material is kept once shared (S09).',
  ],
  [
    'shared',
    'Shared',
    'Everyone in the collaboration sees these',
    'Logistics and craft terms. Most need everyone’s tick; an item between two people needs only those two — but everyone can still see it.',
    'D10: pair scope does not restrict who sees a shared item.',
  ],
  [
    'money',
    'Private money',
    'Only the pair it belongs to sees this',
    'The fee — the one private thing. Only the two people it is between can see it, and only they tick it.',
    'Q6: money is one field, the fee. D10: private to its pair.',
  ],
];

const SHAPE_LABELS = { declaration: 'declaration', request: 'request', open_parameter: 'open parameter' };
const PENDING_LABELS = { decide_together: 'to decide together', subject: 'awaiting its subject' };
// Mirrors src/briefs/live.ts: these always need their own tick (Q6).
const DELIBERATE_TICK_KEYS = ['fee', 'coverage_level', 'physical_contact', 'stop_rule'];

const SIM_ERRORS = {
  presence_missing: 'Every party needs an explicit on-site answer before the brief can be shared.',
  wording_not_materialized: 'An item has no stored wording yet, so the brief cannot be shared.',
  not_draft: 'The brief is already shared; that can only change in a draft.',
  not_live: 'Only a shared brief can be resolved or ticked.',
  not_decide_together: 'That item is not waiting to be decided together.',
  not_open_parameter: 'That value is already set.',
  not_request: 'Only a request can be declined.',
  not_subject: 'Only the person the item is about can do that.',
  universal_kept: 'Universal safety material cannot be removed from a shared brief.',
  blank_value: 'Enter a value first.',
  deliberate_tick: 'Fee, coverage level, physical contact and the stop rule each need their own deliberate tick: group-check refuses them.',
  item_not_in_brief: 'An item is not in this brief.',
  not_an_approver: 'This party does not green-light that item.',
  still_pending: 'Settle the item before ticking it.',
  fixed_once_shared: 'A shared brief is fixed: nothing is added, reworded or reordered.',
  invalid_input: 'Check the input.',
  // S11: the operator's synthetic finalization.
  not_bound_account: 'Each person must claim their invitation (a bound account) before the operator can finalize.',
  not_ready: 'Not everything is green yet.',
  not_signing: 'The brief is not ready to finalize.',
  already_final: 'This brief is already final.',
  fingerprint_mismatch: 'The brief changed since it was frozen.',
  unsupported_topology: 'Only a brief between exactly two people can be finalized.',
};

function simError(error) {
  const code = String(error.message).split(' ')[0];
  return SIM_ERRORS[code] ?? `Refused: ${error.message}`;
}

/** Posts a simulated act, then reloads the selected record if navigation has not moved on. */
async function simulate(url, body, success) {
  const projectId = state.record?.project.id ?? null;
  try {
    await api('POST', url, body);
    toast(success);
  } catch (error) {
    toast(simError(error), 'error');
  }
  if (projectId !== null && state.selectedId === projectId) await loadRecord(projectId, { quiet: true });
}

function pairLabel(annotation, record, agreementId) {
  const labelled = annotation?.agreements?.[agreementId];
  if (labelled) return labelled;
  const agreement = record.agreements.find((a) => a.id === agreementId);
  if (!agreement) return 'Pair';
  const [one, two] = [...agreement.partyIds].sort(byLabel(annotation));
  return `Pair: ${partyLabel(annotation, one)} ↔ ${partyLabel(annotation, two)}`;
}

/** The two people a pair-scoped item is between, in plain words. */
function pairNames(annotation, record, agreementId) {
  const agreement = record.agreements.find((a) => a.id === agreementId);
  if (!agreement) return 'this pair';
  return [...agreement.partyIds].sort(byLabel(annotation)).map((id) => partyLabel(annotation, id)).join(' & ');
}

function tag(text, className = '') {
  return el('span', { className: `tag ${className}`.trim(), text });
}

function chip(text, className = '') {
  return el('span', { className: `chip ${className}`.trim(), text });
}

function button(text, onClick, className = 'secondary') {
  const node = el('button', { className, text, attrs: { type: 'button' } });
  node.addEventListener('click', () => {
    node.disabled = true;
    void onClick();
  });
  return node;
}

/** The synthetic party the demo operator is simulating, for this project. */
function actorFor(record, annotation) {
  const ids = record.parties.map((p) => p.id);
  const chosen = state.actors[record.project.id];
  if (chosen && ids.includes(chosen)) return chosen;
  return [...ids].sort(byLabel(annotation))[0] ?? null;
}

function valueForm(label, placeholder, onSubmit) {
  const input = el('input', { attrs: { type: 'text', maxlength: '500', placeholder, 'aria-label': label } });
  const submit = el('button', { className: 'secondary set', text: label, attrs: { type: 'button' } });
  submit.addEventListener('click', () => {
    if (!/\S/.test(input.value)) return toast(SIM_ERRORS.blank_value, 'error');
    submit.disabled = true;
    void onSubmit(input.value);
  });
  return el('div', { className: 'value-form' }, [input, submit]);
}

function isDeliberate(item) {
  return item.itemKey !== null && DELIBERATE_TICK_KEYS.includes(item.itemKey);
}

/** Plain-language presentation of an item's stored fields. Labels only; nothing stored changes. */
function plainChips(item, record, annotation) {
  const chips = [];
  const subject = item.subjectPartyId ? partyLabel(annotation, item.subjectPartyId) : null;
  if (item.pending === 'subject') chips.push(chip(`Waiting for ${subject}`, 'waiting'));
  if (item.pending === 'decide_together') chips.push(chip('Decide together · still open', 'waiting'));
  if (item.layer === 'money') chips.push(chip(`Private · only ${pairNames(annotation, record, item.pairwiseAgreementId)} see this`, 'private'));
  else if (item.pairwiseAgreementId) chips.push(chip(`Between ${pairNames(annotation, record, item.pairwiseAgreementId)} · everyone can see it`, 'between'));
  if (item.shape === 'declaration') chips.push(chip(`Declaration by ${subject}`, 'subject'));
  if (item.shape === 'open_parameter') chips.push(chip(`${subject} sets this`, 'subject'));
  if (item.shape === 'request') chips.push(chip(`Request · only ${subject} can decline it`, 'subject'));
  if (isDeliberate(item)) chips.push(chip('Needs its own tick', 'deliberate'));
  return chips;
}

function renderItem(item, record, annotation, actor, displayNumber) {
  const brief = record.brief;
  const live = brief.phase === 'live';

  // Schema-oriented labels, kept as instrumentation behind engineering notes.
  const tags = el('div', { className: 'tags eng' });
  if (item.layer === 'money') tags.append(tag(`private to this pair · ${pairLabel(annotation, record, item.pairwiseAgreementId)}`, 'private'));
  else if (item.pairwiseAgreementId) tags.append(tag(`between · ${pairLabel(annotation, record, item.pairwiseAgreementId)}`));
  else tags.append(tag('project-wide'));
  if (item.subjectPartyId) tags.append(tag(`subject · ${partyLabel(annotation, item.subjectPartyId)}`));
  if (item.shape) tags.append(tag(`shape · ${SHAPE_LABELS[item.shape]}`));
  if (item.pending) tags.append(tag(`pending: ${PENDING_LABELS[item.pending]}`, 'pending'));
  if (isDeliberate(item)) tags.append(tag('deliberate tick', 'deliberate'));
  if (item.itemKey) tags.append(tag(`item key ${item.itemKey}`, 'key'));

  const chips = plainChips(item, record, annotation);
  const plain = chips.length ? el('div', { className: 'chips' }, chips) : null;

  // Wording is shown only when it is stored. A keyed item without wording is
  // instrumentation, never text that looks like part of a document.
  const wording =
    item.content === null
      ? el('p', { className: 'instrumentation', text: `item key ${item.itemKey} — wording not materialized (draft)` })
      : el('p', { className: 'wording', text: item.content });
  const value =
    item.value === null ? null : el('p', { className: 'value' }, [el('span', { className: 'muted', text: 'Set to ' }), el('span', { text: item.value })]);

  // Who must green-light it, and who does now. Current state only.
  let approvals = null;
  if (live) {
    approvals = el('ul', { className: 'approvals', attrs: { 'aria-label': 'Green-light' } });
    if (item.approverIds.length === 0) approvals.append(el('li', { className: 'muted', text: 'nobody must green-light this' }));
    else approvals.append(el('li', { className: 'approvals-label', text: item.green ? 'Green-lit by' : 'Ticks' }));
    for (const id of [...item.approverIds].sort(byLabel(annotation))) {
      const yes = item.tickedBy.includes(id);
      approvals.append(el('li', { className: yes ? 'approval yes' : 'approval no', text: `${yes ? '✓' : '○'} ${partyLabel(annotation, id)}` }));
    }
  }

  // The acting party's moves on this item.
  const actions = el('div', { className: 'item-actions' });
  if (live && !SNAPSHOT && actor) {
    const name = partyLabel(annotation, actor);
    if (item.pending === 'decide_together') {
      actions.append(
        valueForm('Settle together', '[synthetic] agreed value', (v) => simulate(`/demo/sim/items/${item.id}/settle`, { value: v }, 'Settled. It can now be ticked.')),
      );
    } else if (item.pending === 'subject') {
      if (item.subjectPartyId === actor) {
        actions.append(
          valueForm(`Set as ${name}`, '[synthetic] your value', (v) =>
            simulate(`/demo/sim/items/${item.id}/parameter`, { partyId: actor, value: v }, 'Value set. It can now be ticked.'),
          ),
        );
      } else {
        actions.append(el('p', { className: 'hint', text: `Waiting for ${partyLabel(annotation, item.subjectPartyId)} to set this.` }));
      }
    } else if (item.approverIds.includes(actor)) {
      const ticked = item.tickedBy.includes(actor);
      if (ticked) {
        if (item.green) actions.append(el('span', { className: 'green-note', text: 'Green — everyone has ticked' }));
        actions.append(button(`Untick as ${name}`, () => simulate(`/demo/sim/items/${item.id}/untick`, { partyId: actor }, 'Tick withdrawn.'), 'untick'));
      } else {
        actions.append(button(`Tick as ${name}`, () => simulate(`/demo/sim/items/${item.id}/tick`, { partyId: actor }, 'Ticked.'), 'tick'));
      }
    }
    if (item.shape === 'request' && item.subjectPartyId === actor && item.layer !== 'universal') {
      actions.append(button(`Decline as ${name}`, () => simulate(`/demo/sim/items/${item.id}/decline`, { partyId: actor }, 'Request removed.'), 'decline'));
    }
  }

  const classes = ['brief-item'];
  if (live && item.green) classes.push('green');
  if (item.pending) classes.push('open');
  return el('li', { className: classes.join(' '), attrs: { 'data-layer': item.layer, 'data-item': item.id } }, [
    // Numbered by display order, not stored position: a gap would hint that
    // something was declined, and a declined request simply disappears.
    el('span', { className: 'pos', text: live && item.green ? '✓' : String(displayNumber) }),
    el('div', { className: 'item-body' }, [wording, value, plain, tags, approvals, actions.childElementCount ? actions : null]),
  ]);
}

function stageOf(brief) {
  return brief.ready ? 'ready' : brief.phase;
}

const STAGE_HEADLINES = { draft: 'DRAFT', live: 'LIVE', ready: 'READY TO SIGN', signing: 'FROZEN (INTERNAL)', final: 'FINAL — SYNTHETIC' };
const EYEBROWS = { fixture: 'Fixture', scenario: 'Synthetic walkthrough', composed: 'Composed shoot' };

/** One line of story: who, one shared brief, resolve, green-light, ready to sign. */
function renderStory(record, annotation) {
  const cast = record.parties.map((p) => p.id).sort(byLabel(annotation)).map((id) => partyLabel(annotation, id));
  const steps = [
    cast.length ? cast.join(' + ') : 'The parties',
    'one shared brief',
    'resolve what is still open',
    `${cast.length === 2 ? 'both' : 'everyone'} green-light what matters`,
    'ready to sign',
  ];
  const story = el('p', { className: 'story' });
  steps.forEach((step, i) => {
    if (i) story.append(el('span', { className: 'arrow', text: ' → ', attrs: { 'aria-hidden': 'true' } }));
    story.append(el('span', { text: step }));
  });
  return story;
}

/**
 * The persistent orientation band: who the people are, who is being simulated,
 * and the stage. Sticky, so the stage and actor stay in view while acting.
 */
function renderBand(record, annotation) {
  const brief = record.brief;
  const stage = stageOf(brief);
  const live = brief.phase === 'live';
  const ids = record.parties.map((p) => p.id).sort(byLabel(annotation));
  const actor = live && !SNAPSHOT ? actorFor(record, annotation) : null;
  const greens = brief.items.filter((i) => i.green).length;
  const open = brief.items.filter((i) => i.pending !== null).length;
  const change = state.transition?.projectId === record.project.id ? state.transition : null;

  let who;
  if (actor) {
    who = renderActorBar(record, annotation, actor, ids);
  } else {
    who = el('div', { className: 'cast' }, [el('span', { className: 'band-label', text: 'Cast' })]);
    if (ids.length === 0) who.append(el('span', { className: 'muted', text: 'No parties yet' }));
    for (const id of ids) who.append(el('span', { className: 'cast-chip', text: partyLabel(annotation, id) }));
  }

  let progress;
  if (stage === 'ready') progress = `All ${brief.items.length} green`;
  else if (stage === 'final') progress = `Contract stored · ${record.contract?.clauses.length ?? 0} clauses`;
  else if (stage === 'signing') progress = 'Frozen for finalization';
  else if (live) progress = `${greens} of ${brief.items.length} green${open ? ` · ${open} still open` : ''}`;
  else progress = 'Not shared yet';

  const steps = el('ol', { className: 'band-steps', attrs: { 'aria-label': 'Stages' } });
  const past = stage === 'signing' || stage === 'final';
  const current = past ? 3 : ['draft', 'live', 'ready'].indexOf(stage);
  ['Draft', 'Live', 'Ready to sign', ...(past ? ['Final (synthetic)'] : [])].forEach((label, i) => {
    steps.append(el('li', { className: i === current ? 'current' : i < current ? 'done' : '', text: label }));
  });

  const band = el('div', { className: `band ${stage}${change ? ' changed' : ''}`, attrs: { 'data-stage': stage } }, [
    who,
    el('div', { className: 'band-stage', attrs: { role: 'status' } }, [
      steps,
      el('p', { className: 'stage-headline', text: STAGE_HEADLINES[stage] }),
      el('p', { className: 'band-progress', text: progress }),
    ]),
  ]);
  if (change) {
    let note;
    if (change.to === 'final') note = 'Finalized by the operator (synthetic). The contract is stored.';
    else if (change.to === 'ready') note = 'Everything is green. The brief is ready to sign.';
    else if (change.from === 'ready') note = 'No longer ready to sign: an item needs its tick again.';
    else if (change.to === 'live') note = 'Shared. The brief is now live: resolve what is open, then tick.';
    if (note) band.append(el('p', { className: 'band-note', text: note }));
  }
  return band;
}

function renderActorBar(record, annotation, actor, ids) {
  const switcher = el('div', { className: 'actor-switch' });
  for (const id of ids) {
    const chipButton = el('button', {
      className: id === actor ? 'actor current' : 'actor',
      text: partyLabel(annotation, id),
      attrs: { type: 'button', 'aria-pressed': id === actor ? 'true' : 'false' },
    });
    chipButton.addEventListener('click', () => {
      state.actors[record.project.id] = id;
      state.transition = null;
      renderDetail();
    });
    switcher.append(chipButton);
  }
  return el('div', { className: 'actor-bar', attrs: { role: 'group', 'aria-label': 'Simulating as' } }, [
    el('span', { className: 'band-label', text: 'Acting as' }),
    switcher,
    el('span', { className: 'actor-caption', text: 'Tap a name to act as that person.' }),
    eng('Simulation only: in the product each person acts for themselves (D12).', 'span'),
  ]);
}

/** The stage, in words, at the top of the brief. READY TO SIGN is the milestone. */
function renderMilestone(brief) {
  const stage = stageOf(brief);
  const greens = brief.items.filter((i) => i.green).length;
  const open = brief.items.filter((i) => i.pending !== null).length;
  const total = brief.items.length;
  const node = el('div', { className: `milestone ${stage}` });
  if (stage === 'ready') {
    node.append(
      el('p', { className: 'milestone-title', text: 'READY TO SIGN' }),
      el('p', { className: 'stage-detail', text: 'Everything currently in this brief is resolved and green-lit. Signing is the next step.' }),
      el('div', { className: 'next-step' }, [
        el('span', { className: 'next-label', text: 'Next step: signing' }),
        el('span', { text: 'Signing is not built in this demo yet.' }),
      ]),
      eng(
        'The signing act is not built: what it looks like, and whether one person may go first, are open (D04). This is the structural all-green rule only: the required-item catalogue does not exist yet, so real use stays gated (Gate 2).',
      ),
    );
    if (!SNAPSHOT) node.append(renderOperatorFinalize(brief));
  } else if (stage === 'signing') {
    node.append(
      el('p', { className: 'milestone-title', text: 'Frozen (internal)' }),
      el('p', { className: 'stage-detail', text: 'Fixed and fingerprinted (S10). An untick withdraws it to live.' }),
    );
    if (!SNAPSHOT) node.append(renderOperatorFinalize(brief));
  } else if (stage === 'final') {
    node.append(
      el('p', { className: 'milestone-title', text: 'Final — synthetic' }),
      el('p', { className: 'stage-detail', text: 'The operator finalized this brief. Its terms now exist only in the stored contract below; nothing in it can change.' }),
      eng('S11: append-only contract, copied verbatim; the live items and ticks are gone (HC1). No participant sees a final brief.'),
    );
  } else if (stage === 'live') {
    const bar = el('span');
    bar.style.width = `${total ? Math.round((greens / total) * 100) : 0}%`;
    node.append(
      el('p', { className: 'milestone-title', text: 'Live — resolve what is open, then green-light' }),
      el('div', { className: 'progress', attrs: { role: 'img', 'aria-label': `${greens} of ${total} items green` } }, [bar]),
      el('p', {
        className: 'stage-detail',
        text: `${greens} of ${total} items green.${open ? ` ${plural(open, 'item')} still open.` : ''} An item turns green when everyone who must tick it has. Ticking is not signing.`,
      }),
      eng('Shared: nothing can be added and the wording is fixed (S09).'),
    );
  } else {
    node.append(
      el('p', { className: 'milestone-title', text: 'Draft — not shared yet' }),
      el('p', { className: 'stage-detail', text: 'Say who will be on site, then share the brief. Once shared, it is live: nothing can be added and the wording is fixed.' }),
    );
  }
  return node;
}

/** SYNTHETIC, OPERATOR-ONLY: one act carrying both parties' bound-account evidence (S11). Not the signing act. */
function renderOperatorFinalize(brief) {
  return el('div', { className: 'share-row operator-finalize' }, [
    button('Finalize as the operator (synthetic)', () => simulate(`/demo/sim/briefs/${brief.id}/finalize`, {}, 'Finalized (synthetic). The contract is stored.'), 'secondary'),
    el('span', {
      className: 'hint',
      text: 'Operator simulation only: stores the final contract with both people’s bound-account evidence at once. Each person must have claimed their invitation. This is not the signing act, which is still open (D04).',
    }),
  ]);
}

function renderPresence(record, annotation) {
  const brief = record.brief;
  const facts = new Map(brief.presence.map((p) => [p.partyId, p.onSite]));
  const rows = el('ul', { className: 'presence' });
  for (const id of record.parties.map((p) => p.id).sort(byLabel(annotation))) {
    const fact = facts.get(id);
    const status = fact === undefined ? 'not answered' : fact ? 'on site' : 'not on site';
    const controls = [];
    if (brief.phase === 'draft' && !SNAPSHOT) {
      controls.push(
        button('On site', () => simulate(`/demo/sim/briefs/${brief.id}/presence`, { partyId: id, onSite: true }, 'Presence set.'), fact === true ? 'secondary chosen' : 'secondary'),
        button('Not on site', () => simulate(`/demo/sim/briefs/${brief.id}/presence`, { partyId: id, onSite: false }, 'Presence set.'), fact === false ? 'secondary chosen' : 'secondary'),
      );
    }
    rows.append(
      el('li', { attrs: { 'data-party': id } }, [
        el('span', { className: 'who', text: partyLabel(annotation, id) }),
        el('span', { className: `presence-status ${fact === undefined ? 'unset' : ''}`.trim(), text: status }),
        controls.length ? el('span', { className: 'presence-controls' }, controls) : null,
      ]),
    );
  }
  const draft = brief.phase === 'draft';
  return el('div', { className: `presence-block ${draft ? 'draft' : 'fixed'}` }, [
    el('h4', { text: draft ? 'Who will be on site?' : 'On site' }),
    el('p', { className: 'hint', text: draft ? 'Everyone on site ticks the universal safety items. Fixed once shared.' : 'Fixed when the brief was shared.' }),
    eng('Q8: on site is physical proximity, one explicit fact per party.'),
    record.parties.length ? rows : el('p', { className: 'muted', text: 'No parties.' }),
  ]);
}

function renderGroupCheck(record, annotation, actor) {
  const brief = record.brief;
  const name = partyLabel(annotation, actor);
  const candidates = brief.items.filter((i) => i.pending === null && i.approverIds.includes(actor) && !i.tickedBy.includes(actor));
  const list = el('ul', { className: 'group-items' });
  for (const item of candidates) {
    const deliberate = isDeliberate(item);
    const box = el('input', { attrs: { type: 'checkbox', value: item.id, id: `gc-${item.id}` } });
    box.checked = !deliberate;
    if (deliberate) box.disabled = true;
    list.append(
      el('li', { className: deliberate ? 'deliberate' : '' }, [
        box,
        el('label', { text: item.content ?? `item key ${item.itemKey}`, attrs: { for: `gc-${item.id}` } }),
        deliberate ? el('span', { className: 'hint', text: 'Needs its own tick' }) : null,
      ]),
    );
  }
  const run = el('button', { className: 'secondary', text: `Group-check as ${name}`, attrs: { type: 'button' } });
  run.addEventListener('click', () => {
    const itemIds = [...list.querySelectorAll('input:checked')].map((b) => b.value);
    if (itemIds.length === 0) return toast('Choose at least one item.', 'error');
    run.disabled = true;
    void simulate(`/demo/sim/briefs/${brief.id}/group-check`, { partyId: actor, itemIds }, `Ticked ${plural(itemIds.length, 'item')}.`);
  });
  return el('details', { className: 'group-check' }, [
    el('summary', { text: `Group-check: tick several ordinary items at once (${name})` }),
    el('p', {
      className: 'hint',
      text: 'A shortcut only: it is exactly the same as ticking each chosen item one by one. The fee, coverage level, physical contact and the stop rule always need their own tick.',
    }),
    eng('Ticks are individual rows; nothing records that group-check was used. The server refuses a deliberate-tick key (deliberate_tick).'),
    candidates.length ? list : el('p', { className: 'muted', text: 'Nothing left for this party to tick.' }),
    candidates.length ? run : null,
  ]);
}

function renderBrief(record, annotation) {
  const brief = record.brief;
  if (!brief) {
    return section('Live brief', null, el('div', { className: 'state empty' }, [el('p', { text: 'No live brief has been opened for this project.' })]));
  }
  const actor = brief.phase === 'live' && !SNAPSHOT ? actorFor(record, annotation) : null;
  const body = el('div', { className: 'brief' }, [renderMilestone(brief)]);
  body.append(renderPresence(record, annotation));
  if (brief.phase === 'draft' && !SNAPSHOT && record.parties.length > 0) {
    body.append(
      el('div', { className: 'share-row' }, [
        button('Share the brief', () => simulate(`/demo/sim/briefs/${brief.id}/share`, {}, 'Shared. The brief is live.'), 'share'),
        el('span', { className: 'hint', text: 'Open items can stay open until it is live; everyone needs an on-site answer first.' }),
      ]),
    );
  }
  if (actor) body.append(renderGroupCheck(record, annotation, actor));
  if (brief.items.length === 0) {
    const text = brief.phase === 'final' ? 'No live items: they were copied into the contract and deleted (HC1).' : 'The draft brief has no items.';
    body.append(el('div', { className: 'state empty' }, [el('p', { text })]));
  }
  const numberOf = new Map(brief.items.map((item, i) => [item.id, i + 1]));
  for (const [layer, title, audience, hint, engNote] of LAYERS) {
    const items = brief.items.filter((item) => item.layer === layer);
    if (items.length === 0) continue;
    const list = el('ol', { className: 'brief-items' });
    for (const item of items) list.append(renderItem(item, record, annotation, actor, numberOf.get(item.id)));
    body.append(
      el('section', { className: 'layer', attrs: { 'data-layer': layer } }, [
        el('div', { className: 'layer-head' }, [el('h4', { text: title }), el('span', { className: 'layer-audience', text: audience })]),
        el('p', { className: 'hint', text: hint }),
        eng(engNote),
        list,
      ]),
    );
  }
  return section('The brief', 'One brief, as it stands right now.', body, {
    engNote: 'Current state only: no history, no record of a decline, nobody recorded as having proposed anything, and no times (HC1, HC2).',
  });
}

// ---- The final contract (S11, synthetic) ----

function renderContract(record, annotation) {
  const contract = record.contract;
  const label = (id) => partyLabel(annotation, id);
  const body = el('div', { className: 'contract' }, [
    el('p', {}, [chip(contract.chain.valid ? 'chain verifies' : 'chain does NOT verify', contract.chain.valid ? 'green' : 'open'), el('span', { className: 'hint', text: ` fingerprint ${shortId(contract.fingerprint)}` })]),
    ...contract.chain.problems.map((problem) => el('p', { className: 'hint', text: problem })),
  ]);
  const parties = el('ul', { className: 'presence' });
  for (const p of contract.parties) {
    parties.append(el('li', {}, [el('span', { className: 'who', text: label(p.partyId) }), el('span', { text: p.onSite ? ' on site · account ' : ' not on site · account ' }), idCode(p.accountId)]));
  }
  const clauses = el('ol', { className: 'brief-items' });
  for (const c of contract.clauses) {
    clauses.append(
      el('li', { className: 'item', attrs: { 'data-layer': c.layer } }, [
        el('div', { className: 'item-body' }, [
          el('p', { className: 'wording', text: c.content }),
          c.value === null ? null : el('p', { className: 'value', text: c.value }),
          el('p', { className: 'hint', text: `${c.layer} · approvers recorded: ${c.approverPartyIds.map(label).join(', ') || 'none'}` }),
        ]),
      ]),
    );
  }
  const signatures = el('ul', { className: 'signatures' });
  for (const s of contract.signatures) {
    signatures.append(
      el('li', {}, [
        el('span', { text: `sequence ${s.sequence} · ${label(s.partyId)} · ${s.signedAt} · ip ${s.ip ?? 'none'} · device ${s.userAgent ?? 'none'} · ` }),
        el('span', { className: 'hint', text: `prev ${shortId(s.prevHash)} → record ${shortId(s.recordHash)}` }),
      ]),
    );
  }
  const renderings = contract.renderings.map((r) =>
    el('details', { className: 'rendering' }, [
      el('summary', { text: `Proposal rendering — ${label(r.partyId)}’s view` }),
      el('iframe', { attrs: { sandbox: '', srcdoc: r.html, title: `Proposal rendering, ${label(r.partyId)}’s view` } }),
    ]),
  );
  body.append(
    el('h4', { text: 'Parties and bound accounts' }),
    parties,
    el('h4', { text: 'Clauses, verbatim' }),
    clauses,
    el('h4', { text: 'Signature records, chained' }),
    eng('Both written in one operator act, at one database time; chain order is by party id, not who went first.'),
    signatures,
    el('h4', { text: 'Each person’s view' }),
    el('p', { className: 'hint', text: 'A proposal for Cory’s reaction: what each clause shows is still open (D04). Shown to no participant.' }),
    ...renderings,
  );
  return section('Final contract — synthetic', 'The stored record, whole, as the operator inspects it. Append-only: nothing here can change.', body, {
    engNote: 'S11. Operator/test-only finalization; the signing act, signing order and every participant-facing word are open.',
  });
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
      'Built as data functions: ticks, green state and ready to sign (S09), the freeze (S10) and the final contract, reached here only by an operator-only synthetic finalization (S11). Not built: the signing act.',
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
  'D10 what each party sees (photo shoots): decided in full. The demo simulates party-filtered screens; no real party view (signed in) is built.',
  'D02 lifecycle: share, resolve, decline and green state are data functions (S09), simulated here; the final contract is stored only by an operator-only synthetic finalization (S11); the signing act is not built.',
  'Three layers: universal safety, shared logistics including the call sheet, private money only. Built as draft topology (S08); the call sheet is not built.',
  'On site means physical proximity: an explicit fact per party, fixed once the brief is shared (S09). The roster-addition workflow is not built.',
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
    state.fixture = await api('GET', '/annotations.json');
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

async function loadRecord(id, { quiet = false } = {}) {
  recordGeneration += 1;
  const generation = recordGeneration;
  // A quiet reload (after a simulated act) keeps the current view until the
  // new record arrives, so the page does not jump.
  if (!quiet) {
    state.recordLoading = true;
    state.recordError = null;
    state.record = null;
    renderDetail();
  }
  let record = null;
  let error = null;
  try {
    record = await api('GET', `/demo/projects/${encodeURIComponent(id)}/record`);
  } catch (e) {
    error = e.message;
  }
  if (generation !== recordGeneration) return;
  // A stage change seen by this browser after a simulated act gets a
  // transient cue in the band; it is gone on the next render.
  const stage = record?.brief ? stageOf(record.brief) : null;
  const before = state.lastStage[id];
  state.transition = quiet && stage && before && before !== stage ? { projectId: id, from: before, to: stage } : null;
  if (stage) state.lastStage[id] = stage;
  state.record = record;
  state.recordError = error;
  state.recordLoading = false;
  renderDetail();
}

function route() {
  const decisionsLink = document.getElementById('decisions-link');
  if (location.hash === '#/decisions') {
    state.selectedId = null;
    document.body.classList.remove('has-selection');
    invalidateRecordLoads();
    renderList();
    decisionsLink?.setAttribute('aria-current', 'page');
    renderDecisions();
    return;
  }
  decisionsLink?.removeAttribute('aria-current');
  const match = /^#\/projects\/([0-9a-f-]{36})$/i.exec(location.hash);
  state.selectedId = match ? match[1].toLowerCase() : null;
  // On a narrow screen a selected project's brief comes first; the list follows it.
  document.body.classList.toggle('has-selection', state.selectedId !== null);
  renderList();
  if (state.selectedId) {
    window.scrollTo(0, 0);
    void loadRecord(state.selectedId);
  } else {
    invalidateRecordLoads();
    renderDetail();
  }
}

async function startScenario(button) {
  button.disabled = true;
  try {
    const project = await api('POST', '/demo/sim/scenarios', {});
    await loadFixture();
    await loadProjects();
    location.hash = `#/projects/${project.id}`;
    toast('New walkthrough: a photographer, a model and a draft brief.');
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

setEngineeringNotes(loadEngineeringNotes());
document.getElementById('eng-toggle').addEventListener('click', () => setEngineeringNotes(!document.body.classList.contains('show-eng')));

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
  // Back to the participant journey (not in a snapshot, which has no server).
  const shoots = el('a', { className: 'shoots-link', text: '← Shoots', attrs: { href: '/' } });
  document.querySelector('.sidebar-head').prepend(shoots);
  createButton.addEventListener('click', (event) => void createProject(event.currentTarget));
  document.getElementById('start-simulation').addEventListener('click', (event) => void startScenario(event.currentTarget));
}
window.addEventListener('hashchange', route);

await loadFixture();
await loadProjects();
route();
