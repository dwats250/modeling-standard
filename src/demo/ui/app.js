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

async function api(method, url, body) {
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
  return annotation?.parties?.[id] ?? 'Party (no fixture label)';
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
          renderLayer(agreement.terms, agreement.versions, [one, two], annotation),
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
      renderLayer(record.universal.terms, record.universal.versions, record.parties.map((p) => p.id).sort(byLabel(annotation)), annotation),
    ),
    section(
      'Pairwise agreements',
      'Private commercial and craft terms, each agreement relating exactly two parties (S02, D02).',
      agreementsBody,
    ),
    legend(),
    section('Not available yet', 'Left out on purpose until Cory decides.', unavailable),
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

function renderLayer(terms, versions, partyIds, annotation) {
  const wrap = el('div', { className: 'layer' });
  if (terms.length === 0 && versions.length === 0) {
    wrap.append(el('div', { className: 'state empty' }, [el('p', { text: 'No terms stored.' })]));
    return wrap;
  }

  const presentedSources = new Set(versions.flatMap((v) => v.terms.map((t) => t.sourceTermId)));
  const neverPresented = terms.filter((t) => !presentedSources.has(t.id));

  if (versions.length === 0) {
    wrap.append(el('p', { className: 'hint', text: 'Terms are stored but no version has been presented.' }));
  }

  versions.forEach((version, index) => {
    const previous = index > 0 ? versions[index - 1] : null;
    wrap.append(renderVersion(version, previous, versions.length, partyIds, annotation));
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
  return wrap;
}

function renderVersion(version, previous, versionCount, partyIds, annotation) {
  const rows = new Map(version.affirmations.map((a) => [`${a.presentedTermId}|${a.partyId}`, a]));

  const head = el('header', { className: 'version-head' }, [
    el('span', { className: 'badge', text: `Version ${version.sequence}` }),
    el('span', { className: 'sealed', text: 'sealed' }),
    el('span', { className: 'meta', text: `presented ${formatTime(version.presentedAt)}` }),
  ]);

  const notes = [];
  if (previous) {
    const kept = new Set(version.terms.map((t) => t.sourceTermId));
    const dropped = previous.terms.filter((t) => !kept.has(t.sourceTermId));
    for (const term of dropped) {
      notes.push(el('p', { className: 'dropped', text: `Dropped since version ${previous.sequence}: “${term.content}”` }));
    }
  }
  if (versionCount > 1) {
    notes.push(
      el('p', {
        className: 'hint',
        text:
          version.sequence === 1
            ? 'Unchanged by the later version. Once a later version exists, no new rows can be recorded here (S05).'
            : 'No rows can be recorded against a later version yet: whether and how a resend is affirmed is undecided (D02).',
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
          : el('td', { className: 'cell none', text: '', attrs: { 'aria-label': 'no row stored' } }),
      );
    }
    body.append(tr);
  }
  table.append(body);

  return el('section', { className: 'version' }, [head, ...notes, el('div', { className: 'table-scroll' }, [table])]);
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
  const match = /^#\/projects\/([0-9a-f-]{36})$/i.exec(location.hash);
  state.selectedId = match ? match[1].toLowerCase() : null;
  renderList();
  if (state.selectedId) void loadRecord(state.selectedId);
  else renderDetail();
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

document.getElementById('create-project').addEventListener('click', (event) => void createProject(event.currentTarget));
window.addEventListener('hashchange', route);

await loadFixture();
await loadProjects();
route();
