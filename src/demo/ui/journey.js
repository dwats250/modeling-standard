// The participant journey for the local synthetic demo: welcome, the
// composer, the draft, each person's live brief, invitations and sign-in.
// Plain browser JavaScript, no build step. Every value from the server is
// written with textContent, never as HTML.
//
// A browser is in one of three modes, decided by the server from its
// cookies, never by this page:
// - the demo operator (an explicit choice on the start screen), who
//   composes, shares, invites, settles agreed values and can simulate any
//   person (#/shoots/<shoot>/as/<person>; the person is part of the address,
//   never a credential);
// - a signed-in test participant (#/brief/<shoot>), who opened an
//   invitation link (#/i/<credential>) and signed in with the local test
//   identity provider, and sees and acts only as their own person;
// - neither.
// An invitation credential is read from the address fragment and kept in
// memory only; it is never stored in this browser or put in another URL.

const state = {
  annotations: { projects: {} },
  // The last readiness this browser saw per shoot, for the one-off
  // "now ready" / "no longer ready" message. Display state only.
  lastReady: {},
  acted: null,
  // Text typed into a value box survives the re-render after another act.
  valueDrafts: {},
  // Invitation links just created, per shoot. Memory only: shown once, never stored.
  invites: {},
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

/** A developer note (ids, engineering names). Hidden unless engineering notes are on. */
function eng(text) {
  return el('p', { className: 'eng eng-note', text });
}

function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

/**
 * Stored demo text carries a "[synthetic]" mark. The persistent demo
 * indicator says so once; documents show the text without repeating it.
 * Display only: the stored text is unchanged.
 */
function clean(text) {
  return typeof text === 'string' ? text.replace(/^\s*\[synthetic\]\s*/i, '') : text;
}

/** Values typed on the demo screens are stored marked, like every demo text. */
function markSynthetic(text) {
  const trimmed = text.trim();
  return /^\[synthetic\]/i.test(trimmed) ? trimmed : `[synthetic] ${trimmed}`;
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
  toast.timer = setTimeout(() => (node.hidden = true), kind === 'error' ? 5000 : 2800);
}

/** A button that shows it is working while its action runs. */
function button(text, onClick, className = 'btn', attrs = {}) {
  const node = el('button', { className, text, attrs: { type: 'button', ...attrs } });
  node.addEventListener('click', async () => {
    if (node.getAttribute('aria-busy') === 'true') return;
    node.setAttribute('aria-busy', 'true');
    node.disabled = true;
    try {
      await onClick();
    } finally {
      node.removeAttribute('aria-busy');
      node.disabled = false;
    }
  });
  return node;
}

function link(text, href, className = '') {
  return el('a', { className, text, attrs: { href } });
}

function scrollToItem(id, focus = false) {
  const node = document.getElementById(`item-${id}`);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  node.classList.remove('highlight');
  void node.offsetWidth;
  node.classList.add('highlight');
  if (focus) setTimeout(() => node.querySelector('input')?.focus({ preventScroll: true }), 350);
}

// Refusals the server can give, in plain words.
const REFUSALS = {
  presence_missing: 'Every person needs an on-site answer before the brief can be shared.',
  wording_not_materialized: 'A term has no wording yet, so the brief cannot be shared.',
  not_draft: 'This brief is already shared.',
  not_live: 'Only a shared brief can be resolved or ticked.',
  not_decide_together: 'That value is already settled.',
  not_open_parameter: 'That value is already set.',
  not_request: 'Only a request can be declined.',
  not_subject: 'Only the person the term is about can do that.',
  universal_kept: 'On-set terms stay once the brief is shared.',
  blank_value: 'Enter a value first.',
  deliberate_tick: 'The fee and coverage level are ticked one by one.',
  not_an_approver: 'This person does not tick that term.',
  still_pending: 'That term is still open; it can be ticked once it is settled.',
  fixed_once_shared: 'A shared brief is fixed: nothing is added or reworded.',
  not_found: 'That has changed — the screen is up to date now.',
  invalid_input: 'Check what was entered.',
  already_claimed: 'This invitation has already been accepted with a different sign-in.',
  already_in_shoot: 'This sign-in already belongs to another person in this shoot.',
  cross_origin: 'This request did not come from this demo’s own page.',
  unauthenticated: 'This browser is not signed in.',
  forbidden: 'This browser cannot do that.',
};

function refusal(error) {
  return REFUSALS[error?.code] ?? `Something went wrong (${error?.code ?? 'unknown'}).`;
}

// ---- Engineering notes (a per-browser display preference, from the demo menu) ----

function engineeringNotesOn() {
  try {
    return localStorage.getItem('ms-demo-engineering-notes') === 'on';
  } catch {
    return false;
  }
}

function setEngineeringNotes(on) {
  document.body.classList.toggle('show-eng', on);
  try {
    localStorage.setItem('ms-demo-engineering-notes', on ? 'on' : 'off');
  } catch {
    // A convenience only.
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
  const title = annotationFor(projectId)?.title;
  if (!title) return 'A shoot created in this session';
  const plain = title.replace(/^Fixture \d+ — /, '');
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

// ---- Shared pieces ----

// "Live" is a candidate word for Cory (D05); About says so.
const STAGES = [
  ['draft', 'Draft'],
  ['live', 'Live'],
  ['ready', 'Ready to sign'],
];

function progressSteps(stage) {
  const current = STAGES.findIndex(([key]) => key === stage);
  const list = el('ol', { className: 'progress-steps', attrs: { 'aria-label': 'Stage' } });
  STAGES.forEach(([, label], i) => {
    const item = el('li', { className: i === current ? 'current' : i < current ? 'done' : '', text: label });
    if (i === current) item.setAttribute('aria-current', 'step');
    list.append(item);
  });
  return list;
}

// The three layers, as document sections. The layer words are the design
// study's shared structure (proposed labels).
const SECTIONS = {
  universal: { title: 'On set', audience: () => 'Universal · everyone on site sees and ticks these' },
  shared: { title: 'The shoot', audience: () => 'Shared · everyone in the collaboration' },
  money: { title: 'Fee', audience: (other) => (other ? `Private money · only you and ${other}` : 'Private money · only this pair') },
};
const LAYER_ORDER = ['universal', 'shared', 'money'];

function aboutLink(text = 'About this demo') {
  return el('p', { className: 'small muted' }, [link(text, '#/about', 'link')]);
}

// ---- Screen: Welcome ----

/** Leaves any mode: ends a test sign-in and leaves operator mode. */
async function signOut() {
  try {
    await api('POST', '/sign-out', {});
    toast('Signed out.');
  } catch (error) {
    toast(refusal(error), 'error');
  }
  location.hash = '#/';
  await rerender(true);
}

async function enterOperatorMode() {
  try {
    await api('POST', '/demo/operator', {});
  } catch (error) {
    toast(refusal(error), 'error');
    return;
  }
  await rerender(true);
}

/** This browser is neither the operator nor signed in. */
function renderNoMode(root) {
  root.append(
    el('section', { className: 'hero mode-choice', attrs: { 'data-mode': 'none' } }, [
      el('p', { className: 'eyebrow', text: 'Photo shoots' }),
      el('h1', { text: 'One brief that everyone on the shoot agrees to.' }),
      el('p', { className: 'lede', text: 'Invited to a shoot? Open the invitation link you were sent — it signs you in as yourself.' }),
      button('Continue as the demo operator', enterOperatorMode, 'btn primary block enter-operator'),
      el('p', { className: 'small muted', text: 'A demo convenience: the operator composes shoots, shares them and sends invitations. It is not a person in any shoot.' }),
    ]),
    aboutLink(),
  );
}

/** This browser is a signed-in test participant: the operator screens are not for it. */
function renderParticipantHome(root) {
  root.append(
    el('section', { className: 'card', attrs: { 'data-mode': 'participant' } }, [
      el('p', { className: 'eyebrow', text: 'Signed in' }),
      el('h1', { text: 'You’re signed in as a test participant' }),
      el('p', { className: 'muted', text: 'Open your invitation link to return to your shoot. The operator screens are not available while this browser is signed in.' }),
      button('Sign out', signOut, 'btn block sign-out'),
    ]),
    aboutLink(),
  );
}

async function renderWelcome(root) {
  let projects = [];
  try {
    projects = (await api('GET', '/demo/projects')).projects;
  } catch (error) {
    if (error.status === 401) return renderNoMode(root);
    if (error.status === 403) return renderParticipantHome(root);
    projects = [];
  }
  const mine = projects.filter((p) => ['composed', 'scenario'].includes(annotationFor(p.id)?.kind));

  root.append(
    el('section', { className: 'hero' }, [
      el('p', { className: 'eyebrow', text: 'Photo shoots' }),
      el('h1', { text: 'One brief that everyone on the shoot agrees to.' }),
      el('p', {
        className: 'lede',
        text: 'Write down the shoot, share it with the people involved, settle what is still open, and tick each term until the brief is ready to sign.',
      }),
      link('Create a shoot', '#/shoots/new', 'btn primary block'),
      link('Or open a ready-made example', '#/demo', 'link secondary-link'),
    ]),
    el('section', { className: 'quiet-card' }, [
      el('h2', { text: 'How it works' }),
      el('ol', { className: 'steps' }, [
        el('li', {}, [el('div', {}, [el('strong', { text: 'Compose the brief' }), el('span', { text: 'Fill in what you know; leave the rest to decide together.' })])]),
        el('li', {}, [el('div', {}, [el('strong', { text: 'Share it' }), el('span', { text: 'Everyone sees the same document. A fee stays private to the two people it is between.' })])]),
        el('li', {}, [el('div', {}, [el('strong', { text: 'Agree each term' }), el('span', { text: 'Each person ticks every term that concerns them. When everything is ticked, the brief is ready to sign.' })])]),
      ]),
    ]),
    mine.length
      ? el('section', { className: 'your-shoots' }, [
          el('h2', { text: 'Your shoots' }),
          el(
            'ul',
            { className: 'shoot-list' },
            mine.map((p) => el('li', {}, [el('a', { attrs: { href: `#/shoots/${p.id}` } }, [el('span', { className: 'title', text: shootTitle(p.id) }), el('span', { className: 'chev', text: '›', attrs: { 'aria-hidden': 'true' } })])])),
          ),
        ])
      : null,
    el('p', { className: 'small muted operator-mode' }, [
      el('span', { text: 'You are the demo operator in this browser. ' }),
      button('Leave operator mode', signOut, 'text-btn leave-operator'),
    ]),
    aboutLink(),
  );
}

// ---- Screen: Demo menu ----

const CARDS = [
  { card: 'straightforward', title: 'Two-person shoot, from the start', text: 'A photographer and a model with a fresh draft: say who is on set, share, and agree.' },
  { card: 'unresolved', title: 'Shared, with values still open', text: 'The model has a coverage level to set and a delivery date is still to agree.' },
  { card: 'declined', title: 'After a declined request', text: 'The album-cover request is no longer in the brief. Carry on to ready to sign.' },
];

async function startCard(card) {
  try {
    const shoot = await api('POST', '/demo/shoots/scenarios', { card });
    await loadAnnotations();
    location.hash = `#/shoots/${shoot.projectId}`;
  } catch (error) {
    toast(`Could not open it. ${refusal(error)}`, 'error');
  }
}

function fixtureId(prefix) {
  const entry = Object.entries(state.annotations.projects ?? {}).find(([, a]) => a.kind === 'fixture' && a.title.startsWith(prefix));
  return entry ? entry[0] : null;
}

function menuItem(title, text, onClick, attrs = {}) {
  const node = el('button', { className: 'menu-item', attrs: { type: 'button', ...attrs } }, [el('strong', { text: title }), el('span', { text })]);
  node.addEventListener('click', onClick);
  return el('li', {}, [node]);
}

function menuLink(title, text, href) {
  return el('li', {}, [el('a', { className: 'menu-item', attrs: { href } }, [el('strong', { text: title }), el('span', { text })])]);
}

function renderDemoMenu(root) {
  const examples = el('ul', { className: 'menu-list' }, CARDS.map((c) => menuItem(c.title, c.text, () => startCard(c.card), { 'data-card': c.card })));
  const three = fixtureId('Fixture 2');
  if (three) examples.append(menuLink('Three people, two fees', 'People A, B and C. Each fee is private to its pair — look as A and as B.', `#/shoots/${three}`));
  const empty = fixtureId('Fixture 3');
  if (empty) examples.append(menuLink('Empty shoot', 'Nobody has joined yet: what the screens say with nothing in them.', `#/shoots/${empty}`));

  const toggle = el('input', { attrs: { type: 'checkbox', id: 'eng-toggle', role: 'switch' } });
  toggle.checked = engineeringNotesOn();
  toggle.addEventListener('change', () => setEngineeringNotes(toggle.checked));

  root.append(
    el('header', { className: 'page-head' }, [
      el('p', { className: 'eyebrow', text: 'Synthetic demo' }),
      el('h1', { text: 'Demo menu' }),
      el('p', { className: 'muted', text: 'Ready-made examples and tools. Everything here is invented.' }),
    ]),
    el('section', {}, [el('h2', { text: 'Examples' }), examples]),
    el('section', {}, [
      el('h2', { text: 'Tools' }),
      el('ul', { className: 'menu-list' }, [
        menuLink('About this demo', 'What is real, what is simulated, and what is not shown.', '#/about'),
        menuLink('Inspector', 'Engineering aid: the whole stored record of every shoot — not what any one person sees.', '/inspector'),
        el('li', {}, [
          el('label', { className: 'switch-row', attrs: { for: 'eng-toggle' } }, [
            el('span', {}, [el('strong', { text: 'Engineering notes' }), el('span', { className: 'small muted', text: ' — show ids and internal names' })]),
            toggle,
          ]),
        ]),
      ]),
      el('p', { className: 'small muted', text: 'To start over with only the examples: stop the server and run npm run demo:fresh.' }),
    ]),
  );
}

// ---- Screen: About this demo ----

function renderAbout(root) {
  const section = (title, items) => el('section', {}, [el('h2', { text: title }), el('ul', {}, items.map((t) => el('li', { text: t })))]);
  root.append(
    el('div', { className: 'about' }, [
      el('header', { className: 'page-head' }, [
        el('p', { className: 'eyebrow', text: 'Synthetic demo' }),
        el('h1', { text: 'About this demo' }),
        el('p', { className: 'lede', text: 'Invented people, nothing here is real. This is the interactive demo running on one machine — not the read-only snapshot, and not a product release.' }),
      ]),
      section('Signing in', [
        'Each invited person opens their own invitation link and signs in, then sees and acts only as themselves (D03, D12). Two people on two devices act separately.',
        'Sign-in here is a local test identity provider that stands in for Google or Apple. It is not Google and not Apple, and it checks nothing about who you are: pick any invented name. No real sign-in has been tested.',
        'Signing in is not verification. Whether a demonstration with invented people needs a verification step is an open question for Cory (D11); none happens here.',
        'Test sign-ins are stored as if they were Google logins, because the account table admits only Google and Apple. No Google sign-in happened.',
      ]),
      section('What is simulated', [
        'The demo operator is an explicit mode, chosen on the start screen. It composes, sets who is on site, shares, and sends invitations. Who does these in the product is still to be decided; sending invitations is an operator convenience here.',
        'Agreed values for “decide together” terms are entered by the operator. Who enters an agreed value in the product is an open question for Cory.',
        'The operator can also look at the brief as any person, with that person in the address. That is a labelled simulation, not a sign-in; a signed-in browser cannot use it.',
        'On a shared Wi-Fi anyone who opens this demo can choose operator mode. That is acceptable only because everything is invented.',
      ]),
      section('What “ready to sign” means here', [
        'Every term currently in the brief is settled and ticked by everyone who must tick it. It is a structural rule: the list of terms a shoot must contain is not drafted yet, so it does not mean the brief is complete.',
        'Signing is the next step and is not built in this demo. Nothing here is signed.',
        'With more than two people, overall readiness is not shown, because it could say something about another pair’s private fee.',
      ]),
      section('What this demo does not show', [
        'The no-means-no term — its wording is Cory’s to write (D04).',
        'Whether a brief holds every required term — the required-term catalogue is not drafted yet.',
        'Real Google or Apple sign-in (D03), and verification (D11).',
        'What signing looks like (D04).',
        'Walking away from a collaboration.',
      ]),
      section('Words and layout', [
        'The words on these screens are proposed labels for Cory’s review (D05). “Live” in particular is a candidate word, not a chosen one.',
        'Which section each term sits in (on set, the shoot, fee) is a demo choice, not the term catalogue.',
        'Stored demo text is marked “[synthetic]”; documents show it without repeating the mark on every line.',
      ]),
      el('p', { className: 'ref', text: 'Decisions referenced: D02 lifecycle, D03 participation credential, D04 terms and signing, D05 vocabulary, D10 what each party sees, D11 adult assurance, D12 who may act.' }),
      link('Back to start', '#/', 'btn block'),
    ]),
  );
}

// ---- Screen: Compose ----

const EXAMPLE = {
  concept: 'Golden-hour portraits on a Leslieville rooftop',
  declaration: 'Please don’t touch my hair — I’ll adjust it myself.',
  callTime: 'Saturday 7:30 pm · rooftop studio, 214 Carlaw Ave',
  deliveryDate: 'Within two weeks of the shoot',
  coverage: 'Fully clothed',
  deliverables: 'Twenty edited high-resolution images',
  request: 'Selected images may be used as an album cover.',
  fee: '$400 CAD',
};
const DRAFT_KEY = 'ms-demo-compose';

function loadSavedCompose() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function inputAttrs(id, name) {
  return { id, name, autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'next', maxlength: '400' };
}

function textField(name, label, hint, saved, multiline = false) {
  const id = `f-${name}`;
  const input = el(multiline ? 'textarea' : 'input', { className: 'input', attrs: { ...inputAttrs(id, name), ...(multiline ? { rows: '2' } : { type: 'text' }), 'aria-describedby': `${id}-error` } });
  input.value = saved?.[name] ?? EXAMPLE[name];
  return el('div', { className: 'field', attrs: { 'data-field': name } }, [
    el('label', { text: label, attrs: { for: id } }),
    hint ? el('p', { className: 'hint', text: hint }) : null,
    input,
    el('p', { className: 'field-error', attrs: { id: `${id}-error`, 'aria-live': 'polite' } }),
  ]);
}

/** A field with explicit states, as a segmented choice; some states carry a value. */
function choiceField(name, label, hint, options, chosen, saved) {
  const id = `f-${name}`;
  const value = el('input', { className: 'input', attrs: { ...inputAttrs(`${id}-value`, `${name}-value`), type: 'text', 'aria-label': `${label}: value`, 'aria-describedby': `${id}-error` } });
  value.value = saved?.[name]?.value ?? EXAMPLE[name];
  const note = el('p', { className: 'option-note' });
  const group = el('div', { className: 'segmented', attrs: { role: 'radiogroup', 'aria-label': label } });
  const pick = saved?.[name]?.mode ?? chosen;
  for (const [mode, text, withValue, explain] of options) {
    const radio = el('input', { attrs: { type: 'radio', name: id, value: mode, id: `${id}-${mode}`, 'data-with-value': withValue ? 'yes' : 'no', 'data-note': explain ?? '' } });
    if (mode === pick) radio.checked = true;
    group.append(el('label', { attrs: { for: `${id}-${mode}` } }, [radio, el('span', { text })]));
  }
  const sync = () => {
    const picked = group.querySelector('input:checked');
    value.hidden = picked?.dataset.withValue !== 'yes';
    note.textContent = picked?.dataset.note ?? '';
    note.hidden = !note.textContent;
  };
  group.addEventListener('change', () => {
    sync();
    if (!value.hidden) value.focus();
  });
  sync();
  return el('div', { className: 'field', attrs: { 'data-field': name } }, [
    el('span', { className: 'field-label', text: label }),
    hint ? el('p', { className: 'hint', text: hint }) : null,
    group,
    value,
    note,
    el('p', { className: 'field-error', attrs: { id: `${id}-error`, 'aria-live': 'polite' } }),
  ]);
}

const FILL_IN = 'Fill it in.';
const FILL_IN_OR_DECIDE = 'Fill it in, or mark it decide together.';
const FILL_IN_OR_LEAVE = 'Fill it in, or leave it for the Model to set.';

function readCompose(form) {
  const text = (name) => form.querySelector(`#f-${name}`).value;
  const choice = (name) => {
    const picked = form.querySelector(`input[name="f-${name}"]:checked`);
    return picked.dataset.withValue === 'yes' ? { mode: picked.value, value: form.querySelector(`#f-${name}-value`).value } : { mode: picked.value };
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
    const message = errors[row.dataset.field] ?? '';
    row.classList.toggle('has-error', Boolean(message));
    row.querySelector('.field-error').textContent = message;
    for (const input of row.querySelectorAll('.input')) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  const first = form.querySelector('.field.has-error .input:not([hidden])');
  if (first) {
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    first.focus({ preventScroll: true });
  }
}

function sectionCard(title, subtitle, fields) {
  return el('section', { className: 'section-card' }, [el('header', {}, [el('h2', { text: title }), subtitle ? el('p', { text: subtitle }) : null]), ...fields]);
}

function renderCompose(root) {
  const saved = loadSavedCompose();
  const form = el('form', { className: 'compose', attrs: { novalidate: '' } });
  form.append(
    sectionCard('The shoot', 'Everyone involved sees this.', [textField('concept', 'What is the shoot?', 'This becomes the brief’s title.', saved)]),
    sectionCard('On set', 'Everyone on site sees and ticks these.', [
      textField('declaration', 'A declaration by the Model', 'Something the Model states to everyone on set. It can’t be declined.', saved, true),
    ]),
    sectionCard('Logistics', 'Fill in what you know; leave the rest to decide together.', [
      choiceField('callTime', 'Call time and location', null, [['supplied', 'Fill in now', true], ['decide_together', 'Decide together', false, 'Left open: the two of them settle it once the brief is shared.']], 'supplied', saved),
      choiceField('deliveryDate', 'Delivery date', null, [['supplied', 'Fill in now', true], ['decide_together', 'Decide together', false, 'Left open: the two of them settle it once the brief is shared.']], 'decide_together', saved),
    ]),
    sectionCard('Creative and usage', 'Shared with everyone in the collaboration.', [
      choiceField(
        'coverage',
        'Coverage level',
        'The Model controls this term, and it is always ticked on its own. (A synthetic example.)',
        [['model_sets', 'Model sets it', false, 'The Model sets it after the brief is shared.'], ['set_now', 'Set it now', true]],
        'model_sets',
        saved,
      ),
      textField('deliverables', 'Deliverables', 'Between the Photographer and the Model.', saved),
      textField('request', 'A request about the Model', 'The Model can keep it by ticking, or decline it.', saved),
    ]),
    sectionCard('Fee', 'Private to the Photographer and the Model. Always ticked on its own.', [
      choiceField('fee', 'Fee', null, [['none', 'No fee', false, 'No money changes hands; the brief has no fee term.'], ['amount', 'Amount', true], ['decide_together', 'Decide together', false, 'Left open: the two of them settle it once the brief is shared.']], 'none', saved),
    ]),
  );
  const save = () => {
    try {
      const body = readCompose(form);
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(body));
    } catch {
      // A convenience only.
    }
  };
  form.addEventListener('input', save);
  form.addEventListener('change', save);

  const submit = el('button', { className: 'btn primary block', text: 'Create the draft', attrs: { type: 'submit' } });
  form.append(
    el('div', { className: 'sticky-footer' }, [
      submit,
      el('p', { text: 'Nothing here marks a term as required. A draft can’t be edited once created — compose another instead.' }),
    ]),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = readCompose(form);
    const errors = blankFields(body);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      toast('A few fields need an answer.', 'error');
      return;
    }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    submit.textContent = 'Creating…';
    try {
      const shoot = await api('POST', '/demo/shoots', body);
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // A convenience only.
      }
      await loadAnnotations();
      toast('Draft created.');
      location.hash = `#/shoots/${shoot.projectId}`;
    } catch (error) {
      if (error.code === 'invalid_input') {
        const fromServer = {};
        for (const issue of error.issues) fromServer[issue.path.split('.')[0]] = issue.message;
        showFieldErrors(form, fromServer);
      } else toast(`Could not create it. ${refusal(error)}`, 'error');
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      submit.textContent = 'Create the draft';
    }
  });

  root.append(
    el('header', { className: 'page-head' }, [
      el('p', { className: 'eyebrow', text: 'New shoot' }),
      el('h1', { text: 'Compose the brief' }),
      el('div', { className: 'cast' }, [el('span', { className: 'person', text: 'Photographer' }), el('span', { className: 'person', text: 'Model' }), el('span', { className: 'small muted', text: 'sent directly' })]),
      el('p', { className: 'small muted operator-note' }, [
        el('span', { text: 'You are composing as the demo operator. ' }),
        link('Why?', '#/about', 'link'),
      ]),
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
  const stage = brief?.phase === 'live' ? (brief.ready ? 'ready' : 'live') : 'draft';

  root.append(
    el('header', { className: 'shoot-head' }, [
      el('p', { className: 'eyebrow', text: brief?.phase === 'live' ? 'Shared' : 'Draft' }),
      el('h1', { text: shootTitle(projectId) }),
      brief ? progressSteps(stage) : null,
      el('div', { className: 'cast' }, cast.length ? cast.map((id) => el('span', { className: 'person', text: label(id) })) : [el('span', { className: 'muted', text: 'Nobody yet' })]),
      eng(`project ${projectId}`),
    ]),
  );

  if (!brief) {
    root.append(el('p', { className: 'state', text: 'This shoot has no brief.' }));
    return;
  }
  if (brief.phase === 'live') {
    root.append(renderChooser(projectId, cast, label), renderInviteCard(projectId, cast, label));
    return;
  }
  if (cast.length === 0) {
    root.append(
      el('section', { className: 'card' }, [
        el('h2', { text: 'Nobody has joined this shoot yet' }),
        el('p', { className: 'muted', text: 'In the product a person joins by invitation and signs in; neither is built, so this draft stays empty.' }),
        el('p', { className: 'small muted', text: 'The draft brief has no terms.' }),
      ]),
    );
    return;
  }

  // Draft: presence, then share. Operator acts: nobody is simulated before sharing.
  const facts = new Map(brief.presence.map((p) => [p.partyId, p.onSite]));
  const rows = cast.map((id) => {
    const fact = facts.get(id);
    const set = (onSite) => async () => {
      try {
        await api('POST', `/demo/sim/briefs/${brief.id}/presence`, { partyId: id, onSite });
      } catch (error) {
        toast(refusal(error), 'error');
      }
      await rerender();
    };
    const choice = (text, value) =>
      button(text, set(value), `seg-btn${fact === value ? ' chosen' : ''}`, { 'aria-pressed': fact === value ? 'true' : 'false' });
    return el('div', { className: 'presence-row', attrs: { 'data-party': id } }, [
      el('span', { className: 'who', text: label(id) }),
      el('div', { className: 'segmented buttons', attrs: { role: 'group', 'aria-label': `${label(id)}: on set?` } }, [choice('On set', true), choice('Not on set', false)]),
    ]);
  });
  const answered = cast.every((id) => facts.has(id));
  const shareError = el('p', { className: 'share-error', attrs: { 'aria-live': 'polite' } });
  const share = button(
    'Share the brief',
    async () => {
      shareError.textContent = '';
      try {
        await api('POST', `/demo/sim/briefs/${brief.id}/share`, {});
        toast('Shared. The brief is live.');
        await rerender(true);
      } catch (error) {
        shareError.textContent = refusal(error);
      }
    },
    'btn primary block share',
  );

  root.append(
    el('section', { className: 'card' }, [
      el('p', { className: 'eyebrow', text: 'Before you share' }),
      el('h2', { text: 'Who will be on set?' }),
      el('p', { className: 'small muted', text: 'Everyone on set ticks the on-set terms. This is fixed once the brief is shared.' }),
      el('div', {}, rows),
      share,
      shareError,
      el('p', { className: 'small muted', text: answered ? 'Ready to share. Open values stay open until the two of them settle them.' : 'Answer for each person, then share.' }),
    ]),
    renderDraftDocument(brief, label),
    renderInviteCard(projectId, cast, label),
    aboutLink('Composed by the demo operator — about this demo'),
  );
}

/** Invitation links, one per person: an operator convenience, shown once and kept in memory only. */
function renderInviteCard(projectId, cast, label) {
  const card = el('section', { className: 'card invite', attrs: { 'aria-label': 'Invitations' } }, [
    el('p', { className: 'eyebrow', text: 'Invitations' }),
    el('h2', { text: 'Invite each person' }),
    el('p', { className: 'small muted', text: 'Each person opens their own link on their own device and signs in; then they see and act only as themselves. Sending invitations is an operator convenience here — who sends them in the product is an open question.' }),
  ]);
  const links = state.invites[projectId];
  if (!links) {
    card.append(
      button(
        'Create invitation links',
        async () => {
          try {
            const created = await api('POST', `/demo/shoots/${projectId}/invitations`, {});
            state.invites[projectId] = created.invitations;
          } catch (error) {
            toast(refusal(error), 'error');
          }
          await rerender();
        },
        'btn primary block create-invites',
      ),
    );
    return card;
  }
  const rows = [...links]
    .sort((a, b) => byLabel(label)(a.partyId, b.partyId))
    .map(({ partyId, credential }) => {
      const url = `${location.origin}/#/i/${credential}`;
      const input = el('input', { className: 'input invite-link', attrs: { type: 'text', readonly: '', value: url, 'aria-label': `Invitation link for ${label(partyId)}`, 'data-party': partyId } });
      const copy = button('Copy', async () => {
        input.select();
        try {
          await navigator.clipboard.writeText(url);
          toast('Link copied.');
        } catch {
          toast('Selected — copy it with your device’s copy command.');
        }
      }, 'btn small');
      return el('li', { className: 'invite-row' }, [el('span', { className: 'who', text: label(partyId) }), el('div', { className: 'invite-copy' }, [input, copy])]);
    });
  card.append(
    el('ul', { className: 'invite-list' }, rows),
    el('p', { className: 'small muted', text: 'Shown once, here. Reloading this page forgets them; create new ones if you need to. A link that someone has already accepted stays theirs.' }),
  );
  return card;
}

/** The draft as composed, read-only. */
function renderDraftDocument(brief, label) {
  const doc = el('section', { className: 'doc', attrs: { 'aria-label': 'The draft brief' } });
  if (brief.items.length === 0) doc.append(el('p', { className: 'state', text: 'The draft brief has no terms.' }));
  let n = 0;
  for (const layer of LAYER_ORDER) {
    const items = brief.items.filter((i) => i.layer === layer);
    if (!items.length) continue;
    const list = el('ol', { className: 'terms' });
    for (const item of items) {
      n += 1;
      list.append(
        el('li', { className: 'term' }, [
          el('span', { className: 'num', text: String(n) }),
          el('p', { className: 'term-text', text: clean(item.content) ?? '(no wording yet)' }),
          item.value !== null
            ? el('p', { className: 'term-value', text: clean(item.value) })
            : item.pending === 'decide_together'
              ? el('p', { className: 'term-open', text: 'To decide together' })
              : item.pending === 'subject'
                ? el('p', { className: 'term-open', text: `${label(item.subjectPartyId)} sets this` })
                : null,
        ]),
      );
    }
    doc.append(el('div', { className: 'doc-section', attrs: { 'data-layer': layer } }, [el('header', {}, [el('h3', { text: SECTIONS[layer].title }), el('p', { text: SECTIONS[layer].audience(null) })]), list]));
  }
  return doc;
}

function renderChooser(projectId, cast, label) {
  const model = cast.find((id) => label(id) === 'Model');
  const order = model ? [model, ...cast.filter((id) => id !== model)] : cast;
  return el('section', { className: 'card chooser' }, [
    el('p', { className: 'eyebrow', text: 'Shared' }),
    el('h2', { text: 'Open the brief as…' }),
    el('div', { className: 'chooser-buttons' }, order.map((id, i) => link(label(id), `#/shoots/${projectId}/as/${id}`, i === 0 ? 'btn primary block' : 'btn block'))),
    el('p', { className: 'small muted', text: model ? 'Start as the Model; switch people at the top of the brief.' : 'Switch people at the top of the brief.' }),
  ]);
}

// ---- Screen: one person's live brief ----

/** The operator's labelled simulation of one person: the person is in the address. */
function simulatedRoute(projectId, partyId) {
  return { base: `/demo/shoots/${projectId}/as/${partyId}`, simulated: true };
}

/** A signed-in participant's own brief: the person is whoever this browser signed in as. */
function signedInRoute(projectId) {
  return { base: `/shoots/${projectId}`, simulated: false };
}

async function renderParticipant(root, projectId, route) {
  let view;
  try {
    view = await api('GET', route.base);
  } catch (error) {
    if (error.status === 404) {
      root.append(
        el('section', { className: 'card' }, route.simulated
          ? [
              el('h1', { text: 'Nothing to show as this person' }),
              el('p', { className: 'muted', text: 'Either this shoot is not shared yet, or that person is not one of its people.' }),
              link('Back to the shoot', `#/shoots/${projectId}`, 'btn block'),
            ]
          : [
              el('h1', { text: 'Nothing to show yet' }),
              el('p', { className: 'muted', text: 'This shoot’s brief has not been shared yet, or this sign-in is not one of its people.' }),
              button('Check again', () => rerender(), 'btn block'),
              button('Sign out', signOut, 'text-btn sign-out'),
            ]),
      );
      return;
    }
    if (!route.simulated && error.status === 401) {
      root.append(
        el('section', { className: 'card' }, [
          el('h1', { text: 'You’re not signed in' }),
          el('p', { className: 'muted', text: 'Open your invitation link to sign in and come back to this shoot.' }),
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

  // Readiness gained or lost by an act this browser just made.
  const before = state.lastReady[projectId];
  state.lastReady[projectId] = view.ready;
  if (state.acted === projectId && before !== undefined && before !== view.ready) {
    toast(view.ready ? 'Everything is ticked — ready to sign.' : 'No longer ready to sign.', view.ready ? 'ok' : 'error');
  }
  state.acted = null;

  const act = async (path, body, success) => {
    try {
      await api('POST', `${route.base}${path}`, body ?? {});
      if (success) toast(success);
    } catch (error) {
      toast(refusal(error), 'error');
    }
    state.acted = projectId;
    await rerender();
  };

  const status =
    stage === 'ready'
      ? `All ${view.progress.total} terms ticked`
      : `${view.progress.green} of ${view.progress.total} terms agreed${view.progress.open ? ` · ${view.progress.open} still open` : ''}`;

  root.append(
    route.simulated ? renderViewing(view, cast, label, projectId) : renderSignedIn(label(me)),
    el('header', { className: 'shoot-head' }, [
      el('h1', { text: shootTitle(projectId) }),
      progressSteps(stage),
      el('p', { className: 'status-line', text: status }),
      view.ready === undefined ? el('p', { className: 'small muted readiness-note', text: 'With more than two people, overall readiness isn’t shown.' }) : null,
      eng(`project ${projectId} · ${route.simulated ? 'simulated' : 'signed-in'} party ${me}`),
    ]),
    stage === 'ready' ? renderReady() : renderNextStep(view, label, act, projectId),
    renderDocument(view, label, act),
    // Entering an agreed value is the operator's (who does it is open); a participant never sees the control.
    ...(route.simulated ? [renderDemoControl(view, projectId)].filter(Boolean) : []),
    aboutLink(),
  );
}

/** The signed-in participant's band: who they are here, and the way out. No switch to anyone else. */
function renderSignedIn(name) {
  return el('div', { className: 'viewing signed-in', attrs: { 'data-mode': 'participant' } }, [
    el('div', { className: 'viewing-row' }, [
      el('span', { className: 'viewing-label', text: 'Signed in as' }),
      el('strong', { className: 'me', text: name }),
      button('Sign out', signOut, 'text-btn sign-out'),
    ]),
    el('p', { className: 'simulation-note', text: 'Test sign-in (a local stand-in for Google or Apple; nothing is verified). You see and act only as yourself.' }),
  ]);
}

function renderViewing(view, cast, label, projectId) {
  const me = view.partyId;
  return el('div', { className: 'viewing' }, [
    el('div', { className: 'viewing-row' }, [
      el('span', { className: 'viewing-label', text: 'Viewing as' }),
      el(
        'nav',
        { className: 'people', attrs: { 'aria-label': 'Viewing as (demo simulation)' } },
        cast.map((id) => el('a', { text: label(id), attrs: { href: `#/shoots/${projectId}/as/${id}`, 'aria-current': id === me ? 'page' : 'false' } })),
      ),
    ]),
    el('p', { className: 'simulation-note', text: 'Demo simulation — in the product, each person signs in and acts only for themselves.' }),
  ]);
}

function renderReady() {
  return el('section', { className: 'card ready', attrs: { 'aria-live': 'polite' } }, [
    el('div', { className: 'seal', text: '✓', attrs: { 'aria-hidden': 'true' } }),
    el('p', { className: 'eyebrow', text: 'Milestone' }),
    el('h2', { text: 'Ready to sign' }),
    el('p', { className: 'lede', text: 'Everyone has ticked every term in this brief.' }),
    el('p', { className: 'next-up', text: 'Signing comes next. It isn’t part of this demo, so nothing here is signed.' }),
  ]);
}

/** This person's next act, or a clear waiting state when their work is done. */
function renderNextStep(view, label, act, projectId) {
  const me = view.partyId;
  const toSet = view.items.filter((i) => i.actions.setParameter);
  const toDecide = view.items.filter((i) => i.actions.decline && !i.actions.untick);
  const ordinary = view.items.filter((i) => i.actions.groupCheck);
  const deliberate = view.items.filter((i) => i.actions.tick && i.deliberate);
  const card = el('section', { className: 'card next', attrs: { 'aria-label': 'Your next step' } });

  if (toSet.length) {
    const item = toSet[0];
    card.append(
      el('p', { className: 'eyebrow', text: 'Your next step' }),
      el('h2', { text: 'Set the value only you control' }),
      el('p', { className: 'muted', text: clean(item.content) }),
      button('Set it', () => scrollToItem(item.id, true), 'btn primary block'),
    );
    return card;
  }
  if (toDecide.length) {
    const item = toDecide[0];
    card.append(
      el('p', { className: 'eyebrow', text: 'Your next step' }),
      el('h2', { text: 'Decide on a request about you' }),
      el('p', { className: 'muted', text: clean(item.content) }),
      el('p', { className: 'small muted', text: 'Keep it by ticking it, or decline it — a declined request simply leaves the brief.' }),
      button('Review it', () => scrollToItem(item.id), 'btn primary block'),
    );
    return card;
  }
  if (ordinary.length || deliberate.length) {
    const total = ordinary.length + deliberate.length;
    card.append(el('p', { className: 'eyebrow', text: 'Your next step' }), el('h2', { text: `Tick ${plural(total, 'term')}` }));
    if (ordinary.length > 1) {
      card.append(
        el('p', { className: 'muted', text: 'Read the brief below, then tick. You can tick the ordinary terms together — exactly the same as ticking each one.' }),
        button(`Tick ${plural(ordinary.length, 'ordinary term')}`, () => act('/group-check', { itemIds: ordinary.map((i) => i.id) }, `Ticked ${plural(ordinary.length, 'term')}.`), 'btn primary block group-run'),
      );
    } else if (ordinary.length === 1) {
      card.append(button('Go to it', () => scrollToItem(ordinary[0].id), 'btn primary block'));
    }
    if (deliberate.length) {
      card.append(
        el('p', { className: 'small muted', text: `${ordinary.length ? 'Then tick' : 'Tick'} these on their own:` }),
        el('div', { className: 'actions-row' }, deliberate.map((i) => button(deliberateName(i), () => scrollToItem(i.id), 'btn small'))),
      );
    }
    return card;
  }

  // Nothing left for this person: say what the brief is waiting on.
  card.classList.add('waiting');
  const waits = [];
  const owed = new Map();
  for (const item of view.items) {
    if (item.pending === 'subject') waits.push(`${label(item.subjectPartyId)} to set: ${clean(item.content)}`);
    else if (item.pending === 'decide_together') waits.push(`A value to agree together: ${clean(item.content)}`);
    else for (const id of item.approverIds) if (id !== me && !item.tickedBy.includes(id)) owed.set(id, (owed.get(id) ?? 0) + 1);
  }
  for (const [id, n] of owed) waits.push(`${label(id)}: ${plural(n, 'term')} to tick`);
  card.append(
    el('p', { className: 'eyebrow', text: 'You’re done for now' }),
    el('h2', { text: waits.length ? 'Waiting on the others' : 'Nothing left for you to do' }),
    waits.length ? el('ul', { className: 'waiting-list' }, waits.map((w) => el('li', { text: w }))) : null,
  );
  return card;
}

function deliberateName(item) {
  if (item.itemKey === 'fee') return 'Fee';
  if (item.itemKey === 'coverage_level') return 'Coverage level';
  return clean(item.content)?.slice(0, 32) ?? 'This term';
}

function renderDocument(view, label, act) {
  const me = view.partyId;
  const doc = el('section', { className: 'doc', attrs: { 'aria-label': 'The brief' } });
  let n = 0;
  for (const layer of LAYER_ORDER) {
    const items = view.items.filter((i) => i.layer === layer);
    if (!items.length) continue;
    const other = layer === 'money' ? items[0].between?.find((id) => id !== me) : null;
    const list = el('ol', { className: 'terms' });
    for (const item of items) {
      n += 1;
      list.append(renderTerm(item, n, label, me, act));
    }
    doc.append(
      el('div', { className: 'doc-section', attrs: { 'data-layer': layer } }, [
        el('header', {}, [el('h3', { text: SECTIONS[layer].title }), el('p', { text: SECTIONS[layer].audience(other ? label(other) : null) })]),
        list,
      ]),
    );
  }
  if (!view.items.length) doc.append(el('p', { className: 'state', text: 'This brief has no terms.' }));
  return doc;
}

function renderTerm(item, n, label, me, act) {
  const name = label(me);
  const who = (id) => (id === me ? 'you' : label(id));

  const notes = [];
  if (item.shape === 'declaration') notes.push(`Declared by ${who(item.subjectPartyId) === 'you' ? 'you' : `the ${label(item.subjectPartyId)}`}`);
  if (item.shape === 'request') notes.push(item.subjectPartyId === me ? 'A request about you — only you can decline it' : `A request about the ${label(item.subjectPartyId)}`);
  if (item.shape === 'open_parameter') notes.push(item.subjectPartyId === me ? 'You set this' : `The ${label(item.subjectPartyId)} sets this`);
  if (item.between && item.layer !== 'money') notes.push(`Between ${item.between.map(who).join(' and ')} · everyone can see it`);
  if (item.deliberate) notes.push('Ticked on its own');

  let valueLine = null;
  if (item.value !== null) valueLine = el('p', { className: 'term-value', text: clean(item.value) });
  else if (item.pending === 'subject') valueLine = el('p', { className: 'term-open', text: item.subjectPartyId === me ? 'Waiting for you to set this' : `Waiting for ${label(item.subjectPartyId)}` });
  else if (item.pending === 'decide_together') valueLine = el('p', { className: 'term-open', text: 'Decide together · still open' });

  const status = el('div', { className: 'term-status', attrs: { 'aria-label': 'Who ticks this' } });
  if (item.approverIds.length === 0) status.append(el('span', { text: 'Nobody needs to tick this' }));
  for (const id of [...item.approverIds].sort(byLabel(label))) {
    const yes = item.tickedBy.includes(id);
    status.append(el('span', { className: yes ? 'yes' : 'no', text: `${yes ? '✓' : '○'} ${id === me ? `${label(id)} (you)` : label(id)}` }));
  }
  if (item.green) status.append(el('span', { className: 'agreed-word', text: 'Agreed' }));

  const actions = el('div', { className: 'term-actions' });
  if (item.actions.setParameter) {
    const input = el('input', { className: 'input', attrs: { type: 'text', maxlength: '500', 'aria-label': `Set as ${name}`, enterkeyhint: 'done', autocomplete: 'off', placeholder: 'Your value' } });
    input.value = state.valueDrafts[item.id] ?? '';
    input.addEventListener('input', () => (state.valueDrafts[item.id] = input.value));
    const submit = el('button', { className: 'btn primary small', text: `Set as ${name}`, attrs: { type: 'submit' } });
    const form = el('form', { className: 'value-form' }, [input, submit]);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!/\S/.test(input.value)) return toast(REFUSALS.blank_value, 'error');
      submit.disabled = true;
      delete state.valueDrafts[item.id];
      await act(`/items/${item.id}/parameter`, { value: markSynthetic(input.value) }, 'Value set. It can be ticked now.');
    });
    actions.append(form);
  }
  if (item.actions.tick) actions.append(button(`Tick as ${name}`, () => act(`/items/${item.id}/tick`, {}, 'Ticked.'), 'btn primary small tick'));
  if (item.actions.untick) actions.append(button(`Untick as ${name}`, () => act(`/items/${item.id}/untick`, {}, 'Tick withdrawn.'), 'text-btn untick'));
  if (item.actions.decline) actions.append(button(`Decline as ${name}`, () => act(`/items/${item.id}/decline`, {}, 'Request removed.'), 'btn small decline'));

  return el('li', { className: `term${item.green ? ' agreed' : ''}${item.pending ? ' open' : ''}`, attrs: { id: `item-${item.id}`, 'data-layer': item.layer, 'data-item': item.id } }, [
    // Numbered by what this person sees: a declined request or another
    // pair's fee leaves no gap.
    el('span', { className: 'num pos', text: item.green ? '✓' : String(n), attrs: { 'aria-label': item.green ? `term ${n}, agreed` : `term ${n}` } }),
    el('p', { className: 'term-text wording', text: clean(item.content) ?? '(no wording yet)' }),
    valueLine,
    notes.length ? el('p', { className: 'term-notes' }, notes.map((t) => el('span', { text: t }))) : null,
    status,
    eng(`item ${item.id}${item.itemKey ? ` · item key ${item.itemKey}` : ''}`),
    actions.childElementCount ? actions : null,
  ]);
}

/** Settling a decide-together value is not a party act; it lives apart, as a demo control. */
function renderDemoControl(view, projectId) {
  const open = view.items.filter((i) => i.pending === 'decide_together');
  if (!open.length) return null;
  const rows = open.map((item) => {
    const input = el('input', { className: 'input', attrs: { type: 'text', maxlength: '500', 'aria-label': 'Agreed value', enterkeyhint: 'done', autocomplete: 'off', placeholder: 'The agreed value' } });
    input.value = state.valueDrafts[`settle-${item.id}`] ?? '';
    input.addEventListener('input', () => (state.valueDrafts[`settle-${item.id}`] = input.value));
    const submit = el('button', { className: 'btn small', text: 'Enter the agreed value', attrs: { type: 'submit' } });
    const form = el('form', { className: 'value-form' }, [input, submit]);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!/\S/.test(input.value)) return toast(REFUSALS.blank_value, 'error');
      submit.disabled = true;
      try {
        await api('POST', `/demo/sim/items/${item.id}/settle`, { value: markSynthetic(input.value) });
        delete state.valueDrafts[`settle-${item.id}`];
        toast('Agreed value entered. It can be ticked now.');
      } catch (error) {
        toast(refusal(error), 'error');
      }
      state.acted = projectId;
      await rerender();
    });
    return el('li', {}, [el('p', { className: 'term-text', text: clean(item.content) }), form]);
  });
  return el('section', { className: 'demo-control sim-controls', attrs: { 'aria-label': 'Demo control' } }, [
    el('p', { className: 'eyebrow', text: 'Demo control' }),
    el('p', { className: 'caveat sim-caveat', text: 'Enter the value the two of them agreed — who enters it in the product is an open question for Cory.' }),
    el('ul', { className: 'terms sim-list' }, rows),
  ]);
}

// ---- Screens: an invitation, and how a sign-in ended ----

/**
 * An invitation link (#/i/<credential>). A browser already signed in is asked
 * before the invitation is accepted with that sign-in (it may be someone
 * else's link); otherwise the page offers the test sign-in, which starts from
 * this invitation and comes back to the brief. The credential goes only into
 * the body of those two requests.
 */
async function renderInvitation(root, credential) {
  let signedIn = false;
  try {
    await api('GET', '/session');
    signedIn = true;
  } catch (error) {
    if (error.status !== 401 && error.status !== 403) throw error;
  }
  if (signedIn) {
    const accept = async () => {
      try {
        const claimed = await api('POST', '/invitations/claim', { credential });
        location.replace(`#/brief/${claimed.projectId}`);
      } catch (error) {
        root.replaceChildren();
        if (error.status === 404) renderDeadInvitation(root);
        else if (error.status === 409) renderSignInOutcome(root, error.code === 'already_in_shoot' ? 'already-in-shoot' : 'already-claimed');
        else toast(refusal(error), 'error');
      }
    };
    root.append(
      el('section', { className: 'hero invitation', attrs: { 'data-mode': 'invitation-signed-in' } }, [
        el('p', { className: 'eyebrow', text: 'Invitation' }),
        el('h1', { text: 'You’re invited to a shoot' }),
        el('p', { className: 'lede', text: 'This browser is already signed in. Accept this invitation as yourself, or sign out if the link is for someone else.' }),
        button('Accept the invitation', accept, 'btn primary block accept-invitation'),
        button('Sign out', signOut, 'btn block sign-out'),
      ]),
      aboutLink(),
    );
    return;
  }
  const signIn = async () => {
    try {
      const started = await api('POST', '/sign-in/start', { provider: 'test', invitation: credential });
      location.assign(started.authorizationUrl);
    } catch (error) {
      if (error.status === 404) {
        root.replaceChildren();
        renderDeadInvitation(root);
        return;
      }
      toast(refusal(error), 'error');
    }
  };
  root.append(
    el('section', { className: 'hero invitation', attrs: { 'data-mode': 'invitation' } }, [
      el('p', { className: 'eyebrow', text: 'Invitation' }),
      el('h1', { text: 'You’re invited to a shoot' }),
      el('p', { className: 'lede', text: 'Sign in to see the brief and agree it. You’ll see and act only as yourself.' }),
      button('Continue with test sign-in', signIn, 'btn primary block start-sign-in'),
      el('p', { className: 'small muted', text: 'Test sign-in stands in for Google or Apple in this demo. It is not Google or Apple and checks nothing about who you are.' }),
    ]),
    aboutLink(),
  );
}

function renderDeadInvitation(root) {
  root.append(
    el('section', { className: 'card', attrs: { 'data-outcome': 'dead-link' } }, [
      el('h1', { text: 'This invitation link doesn’t work' }),
      el('p', { className: 'muted', text: 'Check that the whole link was copied. If the demo was reset, ask for a new link.' }),
    ]),
  );
}

// Proposed words for Cory's review in context (D05; package question Q6).
const OUTCOMES = {
  'already-claimed': ['This invitation has already been accepted', 'It was accepted with a different sign-in. If it’s yours, sign in the way you did the first time.'],
  'already-in-shoot': ['You’re already in this shoot', 'This sign-in already belongs to another person in this shoot, so it can’t accept this invitation too. If the link is for someone else, pass it on.'],
  failed: ['Sign-in didn’t finish', 'Nothing was changed. Open your invitation link again to try once more.'],
};

function renderSignInOutcome(root, outcome) {
  const [title, text] = OUTCOMES[outcome] ?? OUTCOMES.failed;
  root.append(
    el('section', { className: 'card', attrs: { 'data-outcome': outcome } }, [
      el('h1', { text: title }),
      el('p', { className: 'muted', text }),
      el('p', { className: 'small muted', text: 'These words are proposed, for review.' }),
    ]),
  );
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
    if ((match = /^#\/shoots\/([0-9a-f-]{36})\/as\/([0-9a-f-]{36})$/i.exec(hash))) await renderParticipant(next, match[1].toLowerCase(), simulatedRoute(match[1].toLowerCase(), match[2].toLowerCase()));
    else if ((match = /^#\/brief\/([0-9a-f-]{36})$/i.exec(hash))) await renderParticipant(next, match[1].toLowerCase(), signedInRoute(match[1].toLowerCase()));
    else if ((match = /^#\/i\/([A-Za-z0-9_-]{1,128})$/.exec(hash))) await renderInvitation(next, match[1]);
    else if ((match = /^#\/signin\/(failed|already-claimed|already-in-shoot)$/.exec(hash))) renderSignInOutcome(next, match[1]);
    else if ((match = /^#\/shoots\/([0-9a-f-]{36})$/i.exec(hash))) await renderShoot(next, match[1].toLowerCase());
    else if (hash === '#/shoots/new') renderCompose(next);
    else if (hash === '#/demo') renderDemoMenu(next);
    else if (hash === '#/about') renderAbout(next);
    else await renderWelcome(next);
  } catch (error) {
    if (error.status === 401) {
      next.replaceChildren();
      renderNoMode(next);
    } else if (error.status === 403) {
      next.replaceChildren();
      renderParticipantHome(next);
    } else {
      next.replaceChildren(
        el('section', { className: 'state error' }, [
          el('p', { text: error.status === 404 ? 'That shoot does not exist (the demo may have been reset).' : `Could not load this screen. ${refusal(error)}` }),
        ]),
        link('Back to start', '#/', 'btn block'),
      );
    }
  }
  // A late response for a screen navigated away from is dropped.
  if (mine !== generation) return;
  const y = window.scrollY;
  screen.replaceChildren(next);
  document.body.dataset.screen = hash.includes('/as/')
    ? 'participant'
    : hash.startsWith('#/brief/')
      ? 'brief'
      : hash.startsWith('#/i/')
        ? 'invitation'
        : hash.startsWith('#/signin/')
          ? 'signin'
          : hash.startsWith('#/shoots/')
            ? 'shoot'
            : hash.slice(2) || 'welcome';
  // The route this screen shows; with data-busy, tells when navigation has caught up.
  // An invitation's credential is never echoed into the page's attributes.
  document.body.dataset.route = hash.startsWith('#/i/') ? '#/i/' : hash;
  window.scrollTo(0, scrollTop ? 0 : y);
}

/** Re-render the current screen in place, keeping the scroll position (or not). */
function rerender(scrollTop = false) {
  return render(scrollTop);
}

window.addEventListener('hashchange', () => void render(true));

setEngineeringNotes(engineeringNotesOn());
await loadAnnotations();
await render(true);
