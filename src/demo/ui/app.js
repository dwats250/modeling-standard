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

// Actions the product does not have yet, and the Cory decision each waits on.
const UNAVAILABLE = [
  ['Add a party', 'How a person becomes a party of a project is undecided (D03).'],
  ['Create a pairwise agreement', 'Who may create an agreement is undecided (D02, D12).'],
  ['Add or present terms', 'Who may author and present terms is undecided (D02, D04).'],
  ['Record an affirmation', 'Only the party itself may affirm (D12); how a person acts as a party is undecided (D03).'],
  ['Send or invite', 'Participation credential and invitation are undecided (D03).'],
  ['View as a party', 'What each party sees is mostly undecided (D10).'],
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
  if (!record) return;
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
    section('Parties', 'Project-local parties (S01). No role, identity or account binding.', partiesBody),
    section(
      'Shared terms — universal layer',
      'Safety and consent terms held on the project, for everyone on site (D02). Who counts as on site is undecided.',
      renderLayer(record.universal.terms, record.universal.versions, record.parties.map((p) => p.id).sort(byLabel(annotation)), annotation, { layer: 'universal', base: `/demo/sim/projects/${record.project.id}` }),
    ),
    section(
      'Pairwise agreements',
      'Private commercial and craft terms, each agreement relating exactly two parties (S02, D02).',
      agreementsBody,
    ),
    legend(),
    SNAPSHOT ? null : simAssumptions(),
    section('Not available as product actions', SNAPSHOT ? 'Left out on purpose until Cory decides.' : 'Left out on purpose until Cory decides. The simulator stands in for some of them, labelled as simulation.', unavailable),
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
          'A ✓ cell is a stored affirmation row: that party, that exact frozen wording, a database time. ' +
          'An empty cell means no row is stored — nothing more. It is not "pending" or "declined", and no ' +
          'agreement is shown as final: which terms are required is undecided (D04), so finality is not computed.',
      }),
    ]),
  ]);
}

// What a later version means differs by layer. Pairwise drop-and-resend is
// decided (D02). For the shared universal layer the storage can freeze a later
// version with a different set of terms, but whether a safety or consent term
// may be left out is undecided and Cory's call. Neither layer's wording claims
// withdrawal, replacement or finality.
const LAYER_COPY = {
  pairwise: {
    presentHint:
      'Choose the terms to present. Leaving a term out of the next version is how a term is dropped and resent (D02). Earlier versions stay exactly as they were.',
    notInLater: (sequence, content) => `Dropped since version ${sequence}: “${content}”`,
    notInLaterNote: null,
    laterVersion: 'No rows can be recorded against a later version yet: how a resent version is affirmed is undecided (D02).',
  },
  universal: {
    presentHint:
      'Choose the terms to present. Storage can freeze a later version with a different set of terms, but whether a shared safety or consent term may be left out is undecided — that is for Cory. This shows the storage mechanics only.',
    notInLater: (sequence, content) => `Not in this version, though in version ${sequence}: “${content}”`,
    notInLaterNote: 'Whether a shared safety or consent term may be left out of a later version is undecided (Cory).',
    laterVersion: 'No rows can be recorded against a later version yet. What a later shared version means is undecided.',
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
            ? 'Unchanged by the later version. Once a later version exists, no new rows can be recorded here (S05).'
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


// ---- Open decisions for Cory (D03, D10, D04 requiredness, D05) ----
// Wording follows decisions/*.md. Each question is posed, never answered.

const DECISIONS = [
  {
    id: 'D03',
    title: 'Participation credential',
    file: 'decisions/D03-participation-credential.md',
    built: [
      'A party is a bare identifier inside one project (S01). It is bound to no account, person or address.',
      'Affirmation rows name a party (S05). They cannot yet record the credential used (DOCTRINE:52).',
      'Production has no way to know who is calling: every protected request is refused.',
    ],
    open: [
      'Whether an account is needed to read terms, to affirm them, or at all.',
      'Whether a link or one-time code sent to the invited address is enough.',
      'Forwarded invitations, wrong addresses, lost access, and getting back to a record later.',
    ],
    blocks: ['Inviting anyone', 'A party affirming a term (D12: only the party itself may)', 'Credential evidence on each affirmation', 'Real participation'],
    question:
      'For the D01 scenario, what must a person have in order to affirm a term, and to come back to their record later?',
  },
  {
    id: 'D10',
    title: 'What each party sees',
    file: 'decisions/D10-what-each-party-sees.md',
    built: [
      'Pairwise agreements are stored separately; one agreement never relates a third party (S02).',
      'Shared safety terms live on the project; private terms live on their pairwise agreement (S03).',
      'Settled rulings: one model does not see another model’s private agreement; safety terms are common to everyone on site.',
      'This demo shows only an internal record view, labelled as not a party view.',
    ],
    open: [
      'The rest of the grid: roster, counterparties, contact details, exact location, notes, concerns, who has affirmed, what changed between versions, the final record.',
      'What the person who organized it sees that others do not.',
      'Whether the final artifact is one record with per-party views, one per party, or one everyone sees in full.',
    ],
    blocks: ['Any screen a party sees', 'Notifications', 'Exports and the final artifact', 'Evidence of what each party was shown'],
    question:
      'In the two-person D01 case, who sees who has affirmed which term, and what changed between versions — before the agreement is final, and after?',
  },
  {
    id: 'D04',
    title: 'Requiredness (within terms and affirmation)',
    file: 'decisions/D04-terms-and-affirmation.md',
    built: [
      'Every term is its own row and its own unit of evidence (S03).',
      'Presented versions are frozen, and a later version never changes an earlier one (S04). Pairwise drop-and-resend is a later version without the term (D02).',
      'Each party’s affirmation of each presented term is a separate, timestamped row (S05).',
      'Settled rule (D02): an agreement is final only when every named party has affirmed every required term.',
    ],
    open: [
      'Which terms are required for the D01 scenario.',
      'Who decides that a term is required.',
      'How body and money terms are identified, so they stay out of the group-check convenience.',
    ],
    blocks: ['Computing whether an agreement is final', 'Showing anything as “final”', 'The group-check convenience', 'The final record'],
    question: 'For the D01 scenario, which presented terms must every named party affirm before the agreement is final, and who marks them?',
  },
  {
    id: 'D05',
    title: 'Vocabulary',
    file: 'decisions/D05-vocabulary.md',
    built: [
      'Internal code names only: project, party, term, version, affirmation.',
      'Every demo screen says these are internal names, not product words.',
    ],
    open: [
      'The words for the collaboration container, the terms as presented, a response, the finalized agreement, the artifact each party holds, and archived or completed statuses.',
    ],
    blocks: ['Any screen, email or document a person outside the team reads'],
    question:
      'What should a person see instead of: project, terms (as presented), affirm, final agreement, and the record they keep?',
  },
];

const CAPABILITIES = [
  ['Invite a person', ['D03']],
  ['A party affirms a term', ['D03']],
  ['A party sees their own view', ['D10', 'D05']],
  ['Show an agreement as final', ['D04']],
  ['Group-check for ordinary terms', ['D04']],
  ['Deliver the final record', ['D10', 'D04', 'D05']],
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
      el('article', { className: 'decision', attrs: { id: `decision-${d.id}` } }, [
        el('header', {}, [
          el('span', { className: 'badge', text: d.id }),
          el('h3', { text: d.title }),
          el('p', { className: 'source', text: d.file }),
        ]),
        el('div', { className: 'decision-cols' }, [
          el('div', {}, [el('h4', { text: 'Already built' }), bulletList(d.built, 'built')]),
          el('div', {}, [el('h4', { text: 'Still undecided' }), bulletList(d.open, 'open')]),
          el('div', {}, [el('h4', { text: 'Waiting on it' }), bulletList(d.blocks, 'blocks')]),
        ]),
        el('div', { className: 'question' }, [el('h4', { text: 'Smallest question' }), el('p', { text: d.question })]),
      ]),
    );
  }

  root.append(
    el('header', { className: 'detail-head' }, [
      el('p', { className: 'eyebrow', text: 'For Cory' }),
      el('h2', { text: 'Four open decisions' }),
      el('p', {
        className: 'meta',
        text:
          'What is built, what is still undecided, what waits on it, and the smallest question that would unblock it. ' +
          'Questions only: nothing here suggests an answer.',
      }),
    ]),
    section('What waits on what', 'Each row is something the product cannot do yet.', el('div', { className: 'table-scroll' }, [strip])),
    cards,
  );
}


// ---- Simulator (live demo only; never in the snapshot) ----

const SIM_ERRORS = {
  version_not_affirmable: 'Only a sole version 1 can take rows (S05). How a later version is affirmed is undecided.',
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
  try {
    await api('POST', url, body);
    toast(success);
  } catch (error) {
    toast(simError(error), 'error');
  }
  await loadProjects();
  await loadRecord(state.selectedId);
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
      title: `Simulation: record a row as if ${partyLabel(annotation, partyId)} had affirmed this term. Only the party itself may affirm in the product (D12); how is D03.`,
    },
  });
  button.addEventListener('click', () => {
    button.disabled = true;
    void simulate(`${ctx.base}/affirmations`, { presentedTermId: term.id, partyId }, `Simulated row recorded for ${partyLabel(annotation, partyId)}.`);
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

  const boxes = el('ul', { className: 'sim-terms' });
  for (const term of terms) {
    const box = el('input', { attrs: { type: 'checkbox', value: term.id, id: `sim-${term.id}` } });
    box.checked = inLatest.has(term.id);
    boxes.append(el('li', {}, [box, el('label', { text: term.content, attrs: { for: `sim-${term.id}` } })]));
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
    el('p', { className: 'hint', text: 'Who may add or present terms is undecided (D02, D04). Here the demo operator does it.' }),
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
        'The demo operator adds and presents terms and records affirmation rows naming a party. None of that is a product act: ' +
        'who may author or present terms is undecided (D02, D04), and only a party may affirm for itself (D12), by means not yet decided (D03). ' +
        'A version needing at least one term is a simulator input rule. Everything else — frozen versions, numbering, which version can take rows — is the database’s own S03–S05 rules.',
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

async function loadRecord(id) {
  state.recordLoading = true;
  state.recordError = null;
  state.record = null;
  renderDetail();
  try {
    state.record = await api('GET', `/demo/projects/${encodeURIComponent(id)}/record`);
  } catch (error) {
    state.recordError = error.message;
  }
  state.recordLoading = false;
  renderDetail();
}

function route() {
  const decisionsLink = document.getElementById('decisions-link');
  if (location.hash === '#/decisions') {
    state.selectedId = null;
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
  else renderDetail();
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
