// The participant journey for the local synthetic demo: shoots, the
// composer, the draft, and each person's live screen. Plain browser
// JavaScript, no build step. Every value from the server is written with
// textContent, never as HTML.
//
// Every screen is a simulation by the demo operator. The person being
// simulated is part of the address (#/shoots/<shoot>/as/<person>), never a
// credential; the server filters what that person may see and do.

const state = {
  annotations: { projects: {} },
  // The last readiness this browser saw per shoot, for the one-off
  // "now ready" / "no longer ready" note. Display state only.
  lastReady: {},
  note: null,
};

// ---- Helpers ----

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
  for (const child of children) if (child) node.append(child);
  return node;
}

/** A developer note: decision references, ids, engineering names. Hidden unless engineering notes are on. */
function eng(text, tag = 'p') {
  return el(tag, { className: 'eng eng-note', text });
}

function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

class ApiError extends Error {
  constructor(status, code, issues) {
    super(code);
    this.status = status;
    this.code = code;
    this.issues = issues ?? [];
  }
}

// While a request or a render is in flight the body carries data-busy, so
// a test (or a curious reader) can tell when the screen has caught up.
let inflight = 0;
function busy(delta) {
  inflight += delta;
  document.body.toggleAttribute('data-busy', inflight > 0);
}

async function api(method, url, body) {
  busy(1);
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? `http_${res.status}`, data?.error?.issues);
    return data;
  } finally {
    busy(-1);
  }
}

function toast(message, kind = 'ok') {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.className = `toast ${kind}`;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (node.hidden = true), 3500);
}

function button(text, onClick, className = 'secondary', attrs = {}) {
  const node = el('button', { className, text, attrs: { type: 'button', ...attrs } });
  node.addEventListener('click', async () => {
    node.disabled = true;
    try {
      await onClick();
    } finally {
      node.disabled = false;
    }
  });
  return node;
}

function link(text, href, className = '') {
  return el('a', { className, text, attrs: { href } });
}

// Refusals the server can give, in plain words.
const REFUSALS = {
  presence_missing: 'Every person needs an on-site answer before the brief can be shared.',
  wording_not_materialized: 'An item has no stored wording yet, so the brief cannot be shared.',
  not_draft: 'The brief is already shared; that can only change in a draft.',
  not_live: 'Only a shared brief can be resolved or ticked.',
  not_decide_together: 'That value is already settled.',
  not_open_parameter: 'That value is already set.',
  not_request: 'Only a request can be declined.',
  not_subject: 'Only the person the item is about can do that.',
  universal_kept: 'Universal safety material stays once the brief is shared.',
  blank_value: 'Enter a value first.',
  deliberate_tick: 'Fee and coverage level each need their own tick: group-check leaves them out.',
  not_an_approver: 'This person does not green-light that item.',
  still_pending: 'That item is still open; it can be ticked once it is settled.',
  fixed_once_shared: 'A shared brief is fixed: nothing is added, reworded or reordered.',
  not_found: 'Not found. It may have changed — the screen has been refreshed.',
  invalid_input: 'Check what was entered.',
};

function refusal(error) {
  return REFUSALS[error?.code] ?? `Refused (${error?.code ?? 'unknown'}).`;
}

// ---- Engineering notes toggle (a per-browser display preference) ----

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

function engineeringNotesOn() {
  try {
    return localStorage.getItem('ms-demo-engineering-notes') === 'on';
  } catch {
    return false;
  }
}

// ---- Demo annotations (labels; never stored in the product database) ----

async function loadAnnotations() {
  try {
    state.annotations = await api('GET', '/annotations.json');
  } catch {
    state.annotations = { projects: {} };
  }
}

function annotationFor(projectId) {
  return state.annotations.projects?.[projectId] ?? null;
}

/** A person's demo label; unlabelled parties get "Person 1", "Person 2"… by id order. */
function labeller(projectId, partyIds) {
  const labels = annotationFor(projectId)?.parties ?? {};
  const positional = new Map([...partyIds].sort().map((id, i) => [id, `Person ${i + 1}`]));
  return (id) => labels[id] ?? positional.get(id) ?? 'Person';
}

/** Display order: by label, then id. Stored order carries no meaning. */
function byLabel(label) {
  return (a, b) => label(a).localeCompare(label(b)) || a.localeCompare(b);
}

function shootTitle(projectId) {
  return annotationFor(projectId)?.title ?? 'A shoot created in this session';
}

// ---- Shared pieces ----

const STAGES = [
  ['draft', 'Draft'],
  ['live', 'Live'],
  ['ready', 'Ready to sign'],
];

/** Draft → Live → Ready to sign. "Live" is a proposed word (D05). */
function stageStrip(stage) {
  const current = STAGES.findIndex(([key]) => key === stage);
  const list = el('ol', { className: 'stage-strip', attrs: { 'aria-label': 'Stages' } });
  STAGES.forEach(([key, label], i) => {
    const item = el('li', { className: i === current ? 'current' : i < current ? 'done' : '', text: label });
    if (key === 'live') {
      item.title = '“Live” is a candidate word for Cory (D05); not chosen.';
      item.append(el('span', { className: 'proposed-mark', text: ' (proposed word)' }));
    }
    if (i === current) item.setAttribute('aria-current', 'step');
    list.append(item);
  });
  return list;
}

const LAYERS = [
  ['universal', 'Universal', 'everyone on site'],
  ['shared', 'Shared', 'everyone in the collaboration'],
  ['money', 'Private money', 'only this pair'],
];

const LAYER_CHOICE_NOTE = 'Which layer each item sits in is a demo choice, not the term catalogue (not yet drafted).';

function layerHead(layer, title, audience) {
  return el('div', { className: 'layer-head' }, [
    el('h3', { text: title }),
    el('span', { className: 'layer-audience', text: audience }),
  ]);
}

// ---- Screen: Shoots (entry) ----

const NOT_SHOWN = [
  'The no-means-no term — its wording is Cory’s to write (D04).',
  'Whether a brief holds every required term — the required-term catalogue is not drafted yet.',
  'Real sign-in — decided (D03), not built. Here one demo operator simulates each person.',
  'What signing looks like — still open (D04). The demo stops at READY TO SIGN.',
  'Walking away from a collaboration — not built.',
];

const CARDS = [
  {
    card: 'straightforward',
    title: 'Two-person straightforward shoot',
    text: 'A Photographer and a Model, one draft brief. Say who is on site, share it, then resolve and tick as each person until it is ready to sign.',
  },
  {
    card: 'unresolved',
    title: 'Unresolved two-person shoot',
    text: 'Already shared, with values still open: the Model has a coverage level to set and a delivery date is to be decided together.',
  },
  {
    card: 'declined',
    title: 'Declined request',
    text: 'Shared; the album-cover request is no longer in the brief. Carry on to ready to sign without it.',
  },
];

async function startCard(card) {
  try {
    const shoot = await api('POST', '/demo/shoots/scenarios', { card });
    await loadAnnotations();
    location.hash = `#/shoots/${shoot.projectId}`;
  } catch (error) {
    toast(`Could not start it: ${refusal(error)}`, 'error');
  }
}

function fixtureId(prefix) {
  const entry = Object.entries(state.annotations.projects ?? {}).find(([, a]) => a.kind === 'fixture' && a.title.startsWith(prefix));
  return entry ? entry[0] : null;
}

async function renderEntry(root) {
  let projects = [];
  let listError = null;
  try {
    projects = (await api('GET', '/demo/projects')).projects;
  } catch (error) {
    listError = error;
  }

  const cards = el('div', { className: 'entry-cards' });
  cards.append(
    el('article', { className: 'entry-card primary-card' }, [
      el('h2', { text: 'New shoot' }),
      el('p', { text: 'Compose an invented photo shoot: one photographer, one model, sent directly. You choose what is filled in and what is left open.' }),
      link('Compose a shoot', '#/shoots/new', 'button-link primary'),
    ]),
  );
  for (const c of CARDS) {
    cards.append(
      el('article', { className: 'entry-card' }, [
        el('h2', { text: c.title }),
        el('p', { text: c.text }),
        button('Open this shoot', () => startCard(c.card), 'primary-outline', { 'data-card': c.card }),
      ]),
    );
  }
  const threePerson = fixtureId('Fixture 2');
  if (threePerson) {
    cards.append(
      el('article', { className: 'entry-card' }, [
        el('h2', { text: 'Three-person fee case' }),
        el('p', { text: 'People A, B and C. A and B each have a fee with C, and each fee is private to its pair. Share it, then look as A and as B.' }),
        link('Open this shoot', `#/shoots/${threePerson}`, 'button-link primary-outline'),
      ]),
    );
  }
  const empty = fixtureId('Fixture 3');
  if (empty) {
    cards.append(
      el('article', { className: 'entry-card' }, [
        el('h2', { text: 'Empty shoot' }),
        el('p', { text: 'No people and an empty draft — what the screens say when there is nothing yet.' }),
        link('Open this shoot', `#/shoots/${empty}`, 'button-link primary-outline'),
      ]),
    );
  }
  cards.append(
    el('article', { className: 'entry-card inspector-card' }, [
      el('h2', { text: 'Inspector' }),
      el('p', { text: 'Engineering aid: the whole stored record of every shoot at once — not what any one person sees.' }),
      link('Open the inspector', '/inspector', 'button-link secondary-link'),
    ]),
  );

  const so_far = el('section', { className: 'shoots-so-far' }, [el('h2', { text: 'Shoots so far' })]);
  const mine = projects.filter((p) => ['composed', 'scenario'].includes(annotationFor(p.id)?.kind));
  if (listError) so_far.append(el('p', { className: 'state error', text: `Could not load shoots: ${refusal(listError)}` }));
  else if (mine.length === 0) so_far.append(el('p', { className: 'muted', text: 'None yet. Shoots you compose or open stay here until the demo is reset.' }));
  else {
    const list = el('ul', { className: 'shoot-list' });
    for (const p of mine) list.append(el('li', {}, [link(shootTitle(p.id), `#/shoots/${p.id}`)]));
    so_far.append(list);
  }

  root.append(
    el('header', { className: 'screen-head' }, [
      el('p', { className: 'eyebrow', text: 'Modeling Standard · demonstration' }),
      el('h1', { text: 'Shoots' }),
      el('p', {
        className: 'lede',
        text: 'Make an invented photo shoot, look at it as each person, and resolve it live until it is READY TO SIGN.',
      }),
    ]),
    cards,
    so_far,
    el('section', { className: 'not-shown' }, [
      el('h2', { text: 'What this demo does not show' }),
      el('ul', {}, NOT_SHOWN.map((t) => el('li', { text: t }))),
      el('p', {
        className: 'hint',
        text: 'On a shared Wi-Fi anyone who opens this demo can act as any person by changing the address. That is acceptable only because everything here is invented.',
      }),
    ]),
  );
}

// ---- Screen: Compose ----

const EXAMPLE = {
  concept: 'A rooftop portrait session at golden hour',
  declaration: 'Nobody touches my hair.',
  callTime: '9:00 at the rooftop studio',
  deliveryDate: 'Within two weeks of the shoot',
  coverage: 'Level 2',
  deliverables: 'Twenty edited high-resolution images',
  request: 'Selected images may be used as an album cover.',
  fee: '400 CAD',
};

function textRow(name, label, hint, multiline = false) {
  const id = `f-${name}`;
  const input = multiline
    ? el('textarea', { attrs: { id, name, rows: '2', maxlength: '400' } })
    : el('input', { attrs: { id, name, type: 'text', maxlength: '400' } });
  input.value = EXAMPLE[name];
  return el('div', { className: 'field', attrs: { 'data-field': name } }, [
    el('label', { text: label, attrs: { for: id } }),
    hint ? el('p', { className: 'hint', text: hint }) : null,
    input,
    el('p', { className: 'field-error', attrs: { id: `${id}-error`, 'aria-live': 'polite' } }),
  ]);
}

/** A field with explicit states: each option is a radio; some carry a value. */
function choiceRow(name, label, hint, options, chosen) {
  const id = `f-${name}`;
  const valueInput = el('input', { attrs: { id: `${id}-value`, type: 'text', maxlength: '400', 'aria-label': `${label}: value` } });
  valueInput.value = EXAMPLE[name];
  const radios = el('div', { className: 'choices', attrs: { role: 'radiogroup', 'aria-label': label } });
  for (const [mode, text, withValue] of options) {
    const radio = el('input', { attrs: { type: 'radio', name: id, value: mode, id: `${id}-${mode}`, 'data-with-value': withValue ? 'yes' : 'no' } });
    if (mode === chosen) radio.checked = true;
    radios.append(el('label', { className: 'choice', attrs: { for: `${id}-${mode}` } }, [radio, el('span', { text })]));
  }
  const row = el('div', { className: 'field', attrs: { 'data-field': name } }, [
    el('span', { className: 'field-label', text: label }),
    hint ? el('p', { className: 'hint', text: hint }) : null,
    radios,
    valueInput,
    el('p', { className: 'field-error', attrs: { id: `${id}-error`, 'aria-live': 'polite' } }),
  ]);
  const sync = () => {
    const picked = radios.querySelector('input:checked');
    valueInput.hidden = picked?.dataset.withValue !== 'yes';
  };
  radios.addEventListener('change', sync);
  sync();
  return row;
}

const FILL_IN = 'Fill it in.';
const FILL_IN_OR_DECIDE = 'Fill it in, or mark it decide together.';
const FILL_IN_OR_LEAVE = 'Fill it in, or leave it for the Model to set.';

function readCompose(form) {
  const text = (name) => form.querySelector(`#f-${name}`).value;
  const choice = (name) => {
    const mode = form.querySelector(`input[name="f-${name}"]:checked`).value;
    const withValue = form.querySelector(`input[name="f-${name}"]:checked`).dataset.withValue === 'yes';
    return withValue ? { mode, value: form.querySelector(`#f-${name}-value`).value } : { mode };
  };
  return {
    concept: text('concept'),
    declaration: text('declaration'),
    callTime: choice('callTime'),
    deliveryDate: choice('deliveryDate'),
    coverage: choice('coverage'),
    deliverables: text('deliverables'),
    request: text('request'),
    fee: choice('fee'),
  };
}

/** Blank supplied values, by field, before anything is sent. */
function blankFields(body) {
  const blank = (v) => typeof v !== 'string' || !/\S/.test(v);
  const errors = {};
  for (const name of ['concept', 'declaration', 'deliverables', 'request']) if (blank(body[name])) errors[name] = FILL_IN;
  for (const name of ['callTime', 'deliveryDate', 'fee']) if ('value' in body[name] && blank(body[name].value)) errors[name] = FILL_IN_OR_DECIDE;
  if ('value' in body.coverage && blank(body.coverage.value)) errors.coverage = FILL_IN_OR_LEAVE;
  return errors;
}

function showFieldErrors(form, errors) {
  for (const row of form.querySelectorAll('.field')) {
    const name = row.dataset.field;
    const message = errors[name] ?? '';
    row.classList.toggle('has-error', Boolean(message));
    row.querySelector('.field-error').textContent = message;
  }
  const first = form.querySelector('.field.has-error input[type="text"]:not([hidden]), .field.has-error textarea');
  first?.focus();
}

function renderCompose(root) {
  const form = el('form', { className: 'compose', attrs: { novalidate: '' } });
  form.append(
    el('section', { className: 'compose-layer', attrs: { 'data-layer': 'shared' } }, [
      layerHead('shared', 'Shared', 'everyone in the collaboration'),
      textRow('concept', 'What the shoot is', 'The screens use this as the shoot’s heading.'),
    ]),
    el('section', { className: 'compose-layer', attrs: { 'data-layer': 'universal' } }, [
      layerHead('universal', 'Universal', 'everyone on site'),
      el('p', { className: 'hint', text: LAYER_CHOICE_NOTE }),
      textRow('declaration', 'A declaration by the Model', 'Something the Model declares to everyone on site. It cannot be declined.', true),
    ]),
    el('section', { className: 'compose-layer', attrs: { 'data-layer': 'shared' } }, [
      layerHead('shared', 'Shared', 'everyone in the collaboration'),
      choiceRow('callTime', 'Call time and location', null, [['supplied', 'Fill it in now', true], ['decide_together', 'Decide together', false]], 'supplied'),
      choiceRow('deliveryDate', 'Delivery date', null, [['supplied', 'Fill it in now', true], ['decide_together', 'Decide together', false]], 'decide_together'),
      choiceRow(
        'coverage',
        'Coverage level (a synthetic example)',
        'The Model controls this one. It always needs its own tick.',
        [['model_sets', 'Leave it for the Model to set', false], ['set_now', 'Set it now', true]],
        'model_sets',
      ),
      textRow('deliverables', 'Deliverables', 'Between the Photographer and the Model; everyone can see it.'),
      textRow('request', 'A request about the Model', 'Only the Model can decline it.'),
    ]),
    el('section', { className: 'compose-layer', attrs: { 'data-layer': 'money' } }, [
      layerHead('money', 'Private money', 'only this pair'),
      choiceRow(
        'fee',
        'Fee',
        'Private to the Photographer and the Model. It always needs its own tick.',
        [['none', 'No fee (no money changes hands)', false], ['amount', 'An amount', true], ['decide_together', 'Decide together', false]],
        'none',
      ),
    ]),
  );
  const submit = el('button', { className: 'primary', text: 'Create the draft', attrs: { type: 'submit' } });
  form.append(
    el('div', { className: 'compose-submit' }, [
      submit,
      el('p', { className: 'hint', text: 'Nothing here marks a term as required. To change a draft, compose another shoot.' }),
    ]),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = readCompose(form);
    const errors = blankFields(body);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) return;
    submit.disabled = true;
    try {
      const shoot = await api('POST', '/demo/shoots', body);
      await loadAnnotations();
      toast('Draft created.');
      location.hash = `#/shoots/${shoot.projectId}`;
    } catch (error) {
      if (error.code === 'invalid_input') {
        const fromServer = {};
        for (const issue of error.issues) fromServer[issue.path.split('.')[0]] = issue.message;
        showFieldErrors(form, fromServer);
      } else toast(`Could not create it: ${refusal(error)}`, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  root.append(
    el('header', { className: 'screen-head' }, [
      el('p', { className: 'eyebrow', text: 'New shoot' }),
      el('h1', { text: 'Compose a shoot' }),
      el('p', { className: 'cast-line' }, [el('span', { className: 'cast-chip', text: 'Photographer' }), el('span', { className: 'cast-chip', text: 'Model' }), el('span', { className: 'muted', text: 'sent directly' })]),
      el('p', {
        className: 'operator-note',
        text: 'You are composing this brief as the demo operator; the product’s composing flow and who composes are not shown here.',
      }),
      el('p', { className: 'hint', text: 'Every value is either filled in now or explicitly left open. Everything is stored marked [synthetic].' }),
    ]),
    form,
  );
}

// ---- Screen: a shoot (draft, or the chooser once live) ----

async function renderShoot(root, projectId) {
  const record = await api('GET', `/demo/projects/${projectId}/record`);
  const partyIds = record.parties.map((p) => p.id);
  const label = labeller(projectId, partyIds);
  const cast = [...partyIds].sort(byLabel(label));
  const brief = record.brief;

  const head = el('header', { className: 'screen-head' }, [
    el('p', { className: 'eyebrow', text: brief?.phase === 'live' ? 'Shared' : 'Draft · composed as the demo operator' }),
    el('h1', { text: shootTitle(projectId) }),
    brief ? stageStrip(brief.phase === 'live' ? (brief.ready ? 'ready' : 'live') : 'draft') : null,
    el('p', { className: 'cast-line' }, cast.length ? cast.map((id) => el('span', { className: 'cast-chip', text: label(id) })) : [el('span', { className: 'muted', text: 'No people yet' })]),
    eng(`project ${projectId}`),
  ]);
  root.append(head);

  if (!brief) {
    root.append(el('p', { className: 'state empty', text: 'This shoot has no brief.' }));
    return;
  }
  if (brief.phase === 'live') {
    root.append(renderChooser(projectId, cast, label));
    return;
  }

  // Draft: presence, then share. Operator-level: nobody is simulated before
  // the brief is shared.
  if (cast.length === 0) {
    root.append(
      el('section', { className: 'panel' }, [
        el('h2', { text: 'Nobody is in this shoot yet' }),
        el('p', { text: 'In the product a person joins through an invitation and signs in (D03); neither is built, so this draft stays empty.' }),
        el('p', { className: 'muted', text: 'The draft brief has no items.' }),
      ]),
    );
    return;
  }

  const facts = new Map(brief.presence.map((p) => [p.partyId, p.onSite]));
  const presence = el('ul', { className: 'presence-list' });
  for (const id of cast) {
    const fact = facts.get(id);
    const set = (onSite) => async () => {
      try {
        await api('POST', `/demo/sim/briefs/${brief.id}/presence`, { partyId: id, onSite });
      } catch (error) {
        toast(refusal(error), 'error');
      }
      await rerender();
    };
    presence.append(
      el('li', { attrs: { 'data-party': id } }, [
        el('span', { className: 'who', text: label(id) }),
        el('span', { className: `presence-status${fact === undefined ? ' unset' : ''}`, text: fact === undefined ? 'not answered' : fact ? 'on site' : 'not on site' }),
        el('span', { className: 'presence-controls', attrs: { role: 'group', 'aria-label': `${label(id)}: on site?` } }, [
          button('On site', set(true), fact === true ? 'secondary chosen' : 'secondary', { 'aria-pressed': fact === true ? 'true' : 'false' }),
          button('Not on site', set(false), fact === false ? 'secondary chosen' : 'secondary', { 'aria-pressed': fact === false ? 'true' : 'false' }),
        ]),
      ]),
    );
  }
  const shareError = el('p', { className: 'field-error share-error', attrs: { 'aria-live': 'polite' } });
  const share = button(
    'Share the brief',
    async () => {
      try {
        await api('POST', `/demo/sim/briefs/${brief.id}/share`, {});
        toast('Shared. The brief is live.');
        await rerender();
      } catch (error) {
        shareError.textContent = refusal(error);
      }
    },
    'primary share',
  );

  root.append(
    el('section', { className: 'panel' }, [
      el('h2', { text: 'Who will be on site?' }),
      el('p', { className: 'hint', text: 'Everyone on site ticks the universal items. Fixed once the brief is shared.' }),
      presence,
      el('div', { className: 'share-row' }, [share, el('p', { className: 'hint', text: 'Open values can stay open; every person needs an on-site answer first.' })]),
      shareError,
      el('p', { className: 'operator-note', text: 'Setting presence and sharing are done here as the demo operator; who does this in the product is not shown.' }),
    ]),
    renderDraftPreview(brief, label),
  );
}

/** What was composed, read-only, as the operator sees it before sharing. */
function renderDraftPreview(brief, label) {
  const body = el('section', { className: 'panel draft-preview' }, [
    el('h2', { text: 'The draft' }),
    el('p', { className: 'hint', text: 'As composed. Not shown to anyone until it is shared, and fixed once shared.' }),
  ]);
  if (brief.items.length === 0) body.append(el('p', { className: 'muted', text: 'The draft brief has no items.' }));
  let n = 0;
  for (const [layer, title, audience] of LAYERS) {
    const items = brief.items.filter((i) => i.layer === layer);
    if (items.length === 0) continue;
    const list = el('ol', { className: 'brief-items' });
    for (const item of items) {
      n += 1;
      list.append(
        el('li', { className: 'brief-item', attrs: { 'data-layer': layer } }, [
          el('span', { className: 'pos', text: String(n) }),
          el('div', { className: 'item-body' }, [
            el('p', { className: 'wording', text: item.content ?? '(no wording yet)' }),
            item.value !== null ? el('p', { className: 'value', text: item.value }) : null,
            el('div', { className: 'chips' }, pendingChips(item, label)),
          ]),
        ]),
      );
    }
    body.append(el('section', { className: 'layer', attrs: { 'data-layer': layer } }, [layerHead(layer, title, audience), list]));
  }
  return body;
}

function renderChooser(projectId, cast, label) {
  // Default to the Model when there is one; the band switches to anyone else.
  const model = cast.find((id) => label(id) === 'Model');
  const order = model ? [model, ...cast.filter((id) => id !== model)] : cast;
  const choices = el('div', { className: 'chooser-buttons' });
  order.forEach((id, i) => choices.append(link(`Look at it as ${label(id)}`, `#/shoots/${projectId}/as/${id}`, i === 0 ? 'button-link primary' : 'button-link primary-outline')));
  return el('section', { className: 'panel chooser' }, [
    el('h2', { text: 'The brief is live. Look at it as…' }),
    choices,
    el('p', {
      className: 'hint',
      text: model ? 'Start as the Model, then switch to the Photographer from the band at the top.' : 'Then switch between people from the band at the top.',
    }),
    el('p', { className: 'operator-note', text: 'Simulation: in the product each person sees and acts only for themselves, signed in (D03, D12).' }),
  ]);
}

// ---- Screen: one person's live brief ----

function pendingChips(item, label, me = null) {
  const chips = [];
  if (item.pending === 'subject') chips.push(el('span', { className: 'chip waiting', text: `Waiting for ${item.subjectPartyId === me ? 'you' : label(item.subjectPartyId)}` }));
  if (item.pending === 'decide_together') chips.push(el('span', { className: 'chip waiting', text: 'Decide together · still open' }));
  return chips;
}

function itemChips(item, label, me) {
  const chips = pendingChips(item, label, me);
  const subject = item.subjectPartyId ? (item.subjectPartyId === me ? 'you' : label(item.subjectPartyId)) : null;
  if (item.layer === 'money') {
    const other = item.between?.find((id) => id !== me);
    chips.push(el('span', { className: 'chip private', text: other ? `Private · only you and ${label(other)} see this` : 'Private to its pair' }));
  } else if (item.between) {
    chips.push(el('span', { className: 'chip between', text: `Between ${item.between.map((id) => (id === me ? 'you' : label(id))).join(' and ')} · everyone can see it` }));
  }
  if (item.shape === 'declaration') chips.push(el('span', { className: 'chip subject', text: `Declaration by ${subject}` }));
  if (item.shape === 'open_parameter') chips.push(el('span', { className: 'chip subject', text: `${subject === 'you' ? 'You set' : `${subject} sets`} this` }));
  if (item.shape === 'request') chips.push(el('span', { className: 'chip subject', text: `Request about ${subject} · only ${subject === 'you' ? 'you' : subject} can decline it` }));
  if (item.deliberate) chips.push(el('span', { className: 'chip deliberate', text: 'Needs its own tick' }));
  return chips;
}

function valueForm(labelText, placeholder, onSubmit) {
  const input = el('input', { attrs: { type: 'text', maxlength: '500', placeholder, 'aria-label': labelText } });
  input.value = '[synthetic] ';
  const submit = el('button', { className: 'secondary set', text: labelText, attrs: { type: 'submit' } });
  const form = el('form', { className: 'value-form' }, [input, submit]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!/\S/.test(input.value.replace('[synthetic]', ''))) return toast(REFUSALS.blank_value, 'error');
    submit.disabled = true;
    try {
      await onSubmit(input.value);
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

async function renderParticipant(root, projectId, partyId) {
  let view;
  try {
    view = await api('GET', `/demo/shoots/${projectId}/as/${partyId}`);
  } catch (error) {
    if (error.status === 404) {
      root.append(
        el('section', { className: 'panel' }, [
          el('h1', { text: 'Nothing to show as this person' }),
          el('p', { text: 'Either this shoot is not shared yet, or that person is not one of its people.' }),
          link('Back to the shoot', `#/shoots/${projectId}`, 'button-link secondary-link'),
        ]),
      );
      return;
    }
    throw error;
  }
  const me = view.partyId;
  const label = labeller(projectId, view.parties.map((p) => p.id));
  const cast = view.parties.map((p) => p.id).sort(byLabel(label));
  const stage = view.ready === true ? 'ready' : 'live';

  // A stage change this browser saw after an act.
  const before = state.lastReady[projectId];
  state.lastReady[projectId] = view.ready;
  let note = null;
  if (state.note?.projectId === projectId && before !== undefined && before !== view.ready) {
    note = view.ready ? 'Everything is green. The brief is READY TO SIGN.' : 'No longer ready to sign.';
  }
  state.note = null;

  const act = async (path, body, success) => {
    try {
      await api('POST', `/demo/shoots/${projectId}/as/${me}${path}`, body ?? {});
      if (success) toast(success);
    } catch (error) {
      toast(refusal(error), 'error');
    }
    state.note = { projectId };
    await rerender();
  };

  root.append(
    renderBand(view, cast, label, stage, note, projectId),
    el('header', { className: 'screen-head participant-head' }, [
      el('h1', { text: shootTitle(projectId) }),
      eng(`project ${projectId} · simulated party ${me}`),
    ]),
    renderMilestone(view, stage),
    renderAttention(view, label, act),
    ...renderLayers(view, label, act),
    // append() would print a null as the text "null".
    ...[renderSimulationControls(view, projectId)].filter(Boolean),
  );
}

function renderBand(view, cast, label, stage, note, projectId) {
  const me = view.partyId;
  const onSite = new Map(view.parties.map((p) => [p.id, p.onSite]));
  const switcher = el('div', { className: 'actor-switch', attrs: { role: 'group', 'aria-label': 'Simulating as' } });
  for (const id of cast) {
    const current = id === me;
    const a = el('a', {
      className: current ? 'actor current' : 'actor',
      text: label(id),
      attrs: { href: `#/shoots/${projectId}/as/${id}`, 'aria-current': current ? 'page' : 'false' },
    });
    switcher.append(a);
  }
  const progress =
    stage === 'ready'
      ? `All ${view.progress.total} green`
      : `${view.progress.green} of ${view.progress.total} green${view.progress.open ? ` · ${view.progress.open} still open` : ''}`;
  const band = el('div', { className: `band participant-band ${stage}${note ? ' changed' : ''}`, attrs: { 'data-stage': stage } }, [
    el('div', { className: 'band-who' }, [
      el('p', { className: 'cast-line compact' }, [
        el('span', { className: 'band-label', text: 'Cast' }),
        ...cast.map((id) => el('span', { className: 'cast-name', text: `${label(id)}${onSite.get(id) ? ' · on site' : onSite.get(id) === false ? ' · not on site' : ''}` })),
      ]),
      el('div', { className: 'simulating' }, [el('span', { className: 'band-label', text: 'Simulating as' }), switcher]),
      el('p', { className: 'simulation-label', text: 'simulation — in the product each person acts only for themselves, signed in (D03/D12)' }),
    ]),
    el('div', { className: 'band-stage', attrs: { role: 'status' } }, [
      stageStrip(stage),
      el('p', { className: 'stage-headline' }, [
        el('span', { text: stage === 'ready' ? 'READY TO SIGN' : 'Live' }),
        stage === 'live' ? el('span', { className: 'proposed', text: 'proposed word (D05)', attrs: { title: '“Live” is a candidate word for Cory (D05); not chosen.' } }) : null,
      ]),
      el('p', { className: 'band-progress', text: progress }),
    ]),
  ]);
  if (note) band.append(el('p', { className: 'band-note', text: note }));
  return band;
}

function renderMilestone(view, stage) {
  const node = el('section', { className: `milestone ${stage}` });
  if (stage === 'ready') {
    node.append(
      el('p', { className: 'milestone-title', text: 'READY TO SIGN' }),
      el('p', { className: 'stage-detail', text: 'Everything in this brief is resolved and green-lit by everyone who must tick it.' }),
      el('div', { className: 'next-step' }, [el('span', { className: 'next-label', text: 'Next step: signing' }), el('span', { text: 'Signing is the next step and is not built in this demo.' })]),
    );
  } else {
    node.append(
      el('p', { className: 'milestone-title', text: 'Resolve what is open, then green-light each item' }),
      el('p', { className: 'stage-detail', text: 'An item turns green when everyone who must tick it has. Ticking is not signing.' }),
    );
    if (view.ready === undefined) {
      node.append(el('p', { className: 'hint', text: 'With more than two people this screen shows no overall readiness: it would say something about other pairs’ private fees.' }));
    }
  }
  node.append(el('p', { className: 'catalogue-caveat', text: 'READY TO SIGN is the structural all-green rule; the required-term list is not yet drafted.' }));
  return node;
}

/** This person's pending acts, in order: set your open parameter; decide a request about you; tick. */
function renderAttention(view, label, act) {
  const toSet = view.items.filter((i) => i.actions.setParameter);
  // A request about this person needs a decision until they have ticked it.
  const toDecide = view.items.filter((i) => i.actions.decline && !i.actions.untick);
  const toTick = view.items.filter((i) => i.actions.tick && !i.actions.setParameter);
  const waiting = view.items.filter((i) => i.pending !== null && !i.actions.setParameter);
  const list = el('ol', { className: 'attention-list' });
  const jump = (item, text) => {
    const go = el('button', { className: 'attention-link', text, attrs: { type: 'button' } });
    go.addEventListener('click', () => document.getElementById(`item-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return el('li', {}, [go]);
  };
  for (const item of toSet) list.append(jump(item, 'Set your value: ' + (item.content ?? 'an open parameter')));
  for (const item of toDecide) list.append(jump(item, 'Decide a request about you: tick it, or decline it'));
  if (toTick.length) list.append(el('li', { text: `Tick ${plural(toTick.length, 'item')} you have not ticked yet` }));

  const section = el('section', { className: 'attention', attrs: { 'aria-label': 'Needs your attention' } }, [el('h2', { text: 'Needs your attention' })]);
  if (list.childElementCount) section.append(list);
  else section.append(el('p', { className: 'muted', text: waiting.length ? 'Nothing for you right now — waiting on something still open.' : 'Nothing for you to do.' }));

  // Group-check: the same individual ticks, several ordinary items at once.
  const ordinary = view.items.filter((i) => i.actions.groupCheck);
  const deliberate = view.items.filter((i) => i.actions.tick && i.deliberate);
  if (ordinary.length > 1 || (ordinary.length && deliberate.length)) {
    const boxes = el('ul', { className: 'group-items' });
    for (const item of ordinary) {
      const box = el('input', { attrs: { type: 'checkbox', value: item.id, id: `gc-${item.id}` } });
      box.checked = true;
      boxes.append(el('li', {}, [box, el('label', { text: item.content ?? '(no wording)', attrs: { for: `gc-${item.id}` } })]));
    }
    for (const item of deliberate) {
      boxes.append(
        el('li', { className: 'deliberate' }, [
          el('input', { attrs: { type: 'checkbox', disabled: '', 'aria-label': 'Needs its own tick' } }),
          el('span', { className: 'gc-label', text: item.content ?? '(no wording)' }),
          el('span', { className: 'hint', text: 'Needs its own tick' }),
        ]),
      );
    }
    const run = button(
      `Tick the chosen items`,
      async () => {
        const itemIds = [...boxes.querySelectorAll('input:checked:not(:disabled)')].map((b) => b.value);
        if (itemIds.length === 0) return toast('Choose at least one item.', 'error');
        await act('/group-check', { itemIds }, `Ticked ${plural(itemIds.length, 'item')}.`);
      },
      'secondary group-run',
    );
    section.append(
      el('details', { className: 'group-check' }, [
        el('summary', { text: `Group-check: tick ${plural(ordinary.length, 'ordinary item')} at once` }),
        el('p', { className: 'hint', text: 'A shortcut only: exactly the same as ticking each chosen item one by one. The fee and coverage level always need their own tick.' }),
        boxes,
        run,
      ]),
    );
  }
  return section;
}

function renderLayers(view, label, act) {
  const me = view.partyId;
  const sections = [];
  let n = 0;
  for (const [layer, title, audience] of LAYERS) {
    const items = view.items.filter((i) => i.layer === layer);
    if (items.length === 0) continue;
    const list = el('ol', { className: 'brief-items' });
    for (const item of items) {
      n += 1;
      list.append(renderItem(item, n, label, me, act));
    }
    sections.push(
      el('section', { className: 'layer', attrs: { 'data-layer': layer } }, [
        layerHead(layer, title, audience),
        el('p', { className: 'hint layer-choice', text: LAYER_CHOICE_NOTE }),
        list,
      ]),
    );
  }
  if (sections.length === 0) sections.push(el('p', { className: 'state empty', text: 'This brief has no items.' }));
  return sections;
}

function renderItem(item, n, label, me, act) {
  const name = label(me);
  const approvals = el('ul', { className: 'approvals', attrs: { 'aria-label': 'Who ticks this' } });
  if (item.approverIds.length === 0) approvals.append(el('li', { className: 'muted', text: 'nobody must tick this' }));
  for (const id of [...item.approverIds].sort(byLabel(label))) {
    const yes = item.tickedBy.includes(id);
    approvals.append(el('li', { className: yes ? 'approval yes' : 'approval no', text: `${yes ? '✓' : '○'} ${id === me ? `${label(id)} (you)` : label(id)}` }));
  }

  const actions = el('div', { className: 'item-actions' });
  if (item.actions.setParameter) {
    actions.append(valueForm(`Set as ${name}`, '[synthetic] your value', (v) => act(`/items/${item.id}/parameter`, { value: v }, 'Value set. It can now be ticked.')));
  }
  if (item.actions.tick) actions.append(button(`Tick as ${name}`, () => act(`/items/${item.id}/tick`, {}, 'Ticked.'), 'tick'));
  if (item.actions.untick) {
    if (item.green) actions.append(el('span', { className: 'green-note', text: 'Green — everyone has ticked' }));
    actions.append(button(`Untick as ${name}`, () => act(`/items/${item.id}/untick`, {}, 'Tick withdrawn.'), 'untick'));
  }
  if (item.actions.decline) actions.append(button(`Decline as ${name}`, () => act(`/items/${item.id}/decline`, {}, 'Request removed.'), 'decline'));
  if (item.pending === 'subject' && !item.actions.setParameter) actions.append(el('p', { className: 'hint', text: `Waiting for ${label(item.subjectPartyId)} to set this.` }));
  if (item.pending === 'decide_together') actions.append(el('p', { className: 'hint', text: 'Still to be decided together — see Simulation controls below.' }));

  const classes = ['brief-item'];
  if (item.green) classes.push('green');
  if (item.pending) classes.push('open');
  return el('li', { className: classes.join(' '), attrs: { id: `item-${item.id}`, 'data-layer': item.layer, 'data-item': item.id } }, [
    // Numbered by what this person sees: a declined request or another
    // pair's fee leaves no gap.
    el('span', { className: 'pos', text: item.green ? '✓' : String(n), attrs: { 'aria-label': item.green ? `item ${n}, green` : `item ${n}` } }),
    el('div', { className: 'item-body' }, [
      el('p', { className: 'wording', text: item.content ?? '(no wording yet)' }),
      item.value !== null ? el('p', { className: 'value' }, [el('span', { className: 'muted', text: 'Set to ' }), el('span', { text: item.value })]) : null,
      el('div', { className: 'chips' }, itemChips(item, label, me)),
      el('p', { className: 'eng eng-note', text: `item ${item.id}${item.itemKey ? ` · item key ${item.itemKey}` : ''}` }),
      approvals,
      actions.childElementCount ? actions : null,
    ]),
  ]);
}

/** Settling a decide-together value is not a party act; it lives apart, as a simulation control. */
function renderSimulationControls(view, projectId) {
  const open = view.items.filter((i) => i.pending === 'decide_together');
  if (open.length === 0) return null;
  const list = el('ul', { className: 'sim-list' });
  for (const item of open) {
    list.append(
      el('li', {}, [
        el('p', { className: 'wording', text: item.content ?? '(no wording yet)' }),
        valueForm('Enter the agreed value', '[synthetic] agreed value', async (v) => {
          try {
            await api('POST', `/demo/sim/items/${item.id}/settle`, { value: v });
            toast('Agreed value entered. It can now be ticked.');
          } catch (error) {
            toast(refusal(error), 'error');
          }
          state.note = { projectId };
          await rerender();
        }),
      ]),
    );
  }
  return el('section', { className: 'sim-controls', attrs: { 'aria-label': 'Simulation controls' } }, [
    el('h2', { text: 'Simulation controls' }),
    el('p', { className: 'sim-caveat', text: 'Enter the value the two of them agreed — who enters it in the product is an open question for Cory.' }),
    list,
  ]);
}

// ---- Routing ----

let generation = 0;

async function render(scrollTop) {
  busy(1);
  try {
    await renderScreen(scrollTop);
  } finally {
    busy(-1);
  }
}

async function renderScreen(scrollTop) {
  generation += 1;
  const mine = generation;
  const screen = document.getElementById('screen');
  const next = el('div', { className: 'screen-body' });
  const hash = location.hash || '#/';
  let match;
  try {
    if ((match = /^#\/shoots\/([0-9a-f-]{36})\/as\/([0-9a-f-]{36})$/i.exec(hash))) await renderParticipant(next, match[1].toLowerCase(), match[2].toLowerCase());
    else if ((match = /^#\/shoots\/([0-9a-f-]{36})$/i.exec(hash))) await renderShoot(next, match[1].toLowerCase());
    else if (hash === '#/shoots/new') renderCompose(next);
    else await renderEntry(next);
  } catch (error) {
    next.replaceChildren(
      el('section', { className: 'panel state error' }, [
        el('p', { text: error.status === 404 ? 'That shoot does not exist (the demo may have been reset).' : `Could not load this screen: ${refusal(error)}` }),
        link('Back to shoots', '#/', 'button-link secondary-link'),
      ]),
    );
  }
  // A late response for a screen navigated away from is dropped.
  if (mine !== generation) return;
  const y = window.scrollY;
  screen.replaceChildren(next);
  document.body.dataset.screen = hash.includes('/as/') ? 'participant' : hash.startsWith('#/shoots/') ? 'shoot' : 'entry';
  // The route this screen shows; with data-busy, tells when navigation has caught up.
  document.body.dataset.route = hash;
  window.scrollTo(0, scrollTop ? 0 : y);
}

/** Re-render the current screen in place, keeping the scroll position. */
function rerender() {
  return render(false);
}

window.addEventListener('hashchange', () => void render(true));

setEngineeringNotes(engineeringNotesOn());
document.getElementById('eng-toggle').addEventListener('click', () => setEngineeringNotes(!document.body.classList.contains('show-eng')));

await loadAnnotations();
await render(true);
