// The professional toolkit screens (slices B1–B4, Track B) for the local
// synthetic demo: a private profile, a comp-card draft arranged from five
// fixture-backed slots, a portfolio draft of ordered fixture images with an
// optional short caption under each (B3) and a save that is refused, with the
// edits kept, when the draft changed elsewhere since it was opened (B4), and
// their previews. Plain browser JavaScript, no build step. Every value
// from the server or typed by a person is written with textContent, never as
// HTML.
//
// Routes: #/me (profile), #/me/card (arrange), #/me/card/preview,
// #/me/portfolio (organize), #/me/portfolio/preview.
//
// Who the owner is comes from the server's session, never from this page.
// Locally, the demo's harness signs a browser in as one of two fixed
// synthetic professionals (POST /demo/toolkit/owner). That is a demo stand-in
// for a sign-in, not one: login for professionals is not built yet.
//
// Unsaved edits are kept in memory while moving between the tabs, so a
// look at the preview does not lose them; nothing is stored in the browser.

export const SLOTS = [
  { key: 'hero', label: 'Hero', hint: 'The front of the card: your strongest image.' },
  { key: 'fullBody', label: 'Full body', hint: 'Head to toe.' },
  { key: 'profileView', label: 'Profile view', hint: 'Side on.' },
  { key: 'lifestyle', label: 'Lifestyle', hint: 'You, in a setting.' },
  { key: 'beauty', label: 'Beauty', hint: 'A close crop.' },
];

const LIMITS = { displayName: 80, profession: 60, biography: 600, tagline: 80 };

const fixtureSrc = (key) => `/media/fixtures/${encodeURIComponent(key)}.svg`;

const savedAt = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Saved' : `Saved at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

export function createToolkit(h) {
  const { el, api, button, link, toast, refusal } = h;

  // Unsaved edits for the signed-in owner; dropped when the owner changes.
  const memory = { owner: undefined, profile: null, card: null, portfolio: null };

  function forOwner(owner) {
    if (memory.owner !== owner) Object.assign(memory, { owner, profile: null, card: null, portfolio: null });
  }

  async function choose(owner) {
    try {
      const chosen = await api('POST', '/demo/toolkit/owner', { owner });
      forOwner(chosen.owner);
      toast(`Now ${chosen.label}.`);
    } catch (error) {
      toast(refusal(error), 'error');
      return;
    }
    if (location.hash === '#/me') await h.rerender(true);
    else location.hash = '#/me';
  }

  // ---- Pieces ----

  function chooser(mode) {
    return el('section', { className: 'hero tk-chooser', attrs: { 'data-mode': 'toolkit-chooser' } }, [
      el('p', { className: 'eyebrow', text: 'Professional toolkit' }),
      el('h1', { text: 'Your profile, comp card and portfolio' }),
      el('p', { className: 'lede', text: 'Write a short professional profile, arrange a comp card and put a portfolio in order. It stays private: only you can see it.' }),
      button('Continue as Synthetic professional A', () => choose('a'), 'btn primary block tk-choose', { 'data-owner': 'a' }),
      button('Continue as Synthetic professional B', () => choose('b'), 'btn block tk-choose', { 'data-owner': 'b' }),
      el('p', {
        className: 'small muted',
        text: 'A demo stand-in for signing in: the two professionals are fixed and invented, and nothing about anyone is checked. Sign-in for professionals is not built yet.',
      }),
      mode === 'operator' ? el('p', { className: 'small muted', text: 'This browser is in operator mode. Choosing a professional leaves it.' }) : null,
    ]);
  }

  function band(who) {
    const other = who.owner === 'a' ? 'b' : 'a';
    return el('div', { className: 'tk-band', attrs: { 'data-owner': who.owner ?? 'account' } }, [
      el('p', { className: 'tk-private' }, [el('span', { className: 'tk-lock', attrs: { 'aria-hidden': 'true' } }), el('span', { text: 'Private draft · only you can see this' })]),
      el('div', { className: 'tk-who' }, [
        el('span', { className: 'small muted', text: 'Signed in as ' }),
        el('strong', { className: 'tk-owner', text: who.label ?? 'a signed-in test account' }),
        button(`Switch to ${other.toUpperCase()}`, () => choose(other), 'text-btn tk-switch'),
        button('Sign out', h.signOut, 'text-btn sign-out'),
      ]),
    ]);
  }

  /** The three sections, and inside the comp card and the portfolio, editing and preview. */
  function tabs(hash) {
    const section = hash.startsWith('#/me/card') ? 'card' : hash.startsWith('#/me/portfolio') ? 'portfolio' : 'profile';
    const current = (href, inSection) => (hash === href ? 'page' : inSection ? 'true' : 'false');
    const tab = (text, href, key) => el('a', { className: 'tk-tab', text, attrs: { href, 'aria-current': current(href, section === key) } });
    const nav = el('nav', { className: 'tk-tabs', attrs: { 'aria-label': 'Professional toolkit' } }, [
      tab('Profile', '#/me', 'profile'),
      tab('Comp card', '#/me/card', 'card'),
      tab('Portfolio', '#/me/portfolio', 'portfolio'),
    ]);
    if (section === 'profile') return [nav];
    const base = section === 'card' ? '#/me/card' : '#/me/portfolio';
    const sub = (text, href) => el('a', { className: 'tk-subtab', text, attrs: { href, 'aria-current': current(href, false) } });
    return [
      nav,
      el('nav', { className: 'tk-subtabs', attrs: { 'aria-label': section === 'card' ? 'Comp card' : 'Portfolio' } }, [
        sub(section === 'card' ? 'Arrange' : 'Organize', base),
        sub('Preview', `${base}/preview`),
      ]),
    ];
  }

  function counter(input, max) {
    const node = el('span', { className: 'tk-count', attrs: { 'aria-hidden': 'true' } });
    const update = () => {
      node.textContent = `${input.value.length} / ${max}`;
      node.classList.toggle('over', input.value.length > max);
    };
    input.addEventListener('input', update);
    update();
    return node;
  }

  /** A labelled field with a hint, a counter and an error line. */
  function field({ id, label, hint, value, max, multiline = false, required = false, onInput }) {
    const input = el(multiline ? 'textarea' : 'input', {
      className: 'input',
      attrs: {
        id,
        name: id,
        maxlength: String(max),
        autocomplete: 'off',
        'aria-describedby': `${id}-hint ${id}-error`,
        ...(multiline ? { rows: '6' } : { type: 'text' }),
        ...(required ? { required: '', 'aria-required': 'true' } : {}),
      },
    });
    input.value = value;
    input.addEventListener('input', () => {
      row.classList.remove('has-error');
      row.querySelector('.field-error').textContent = '';
      onInput(input.value);
    });
    const row = el('div', { className: 'field', attrs: { 'data-field': id } }, [
      el('div', { className: 'tk-label-row' }, [el('label', { text: label, attrs: { for: id } }), counter(input, max)]),
      el('p', { className: 'hint', text: hint, attrs: { id: `${id}-hint` } }),
      input,
      el('p', { className: 'field-error', attrs: { id: `${id}-error`, 'aria-live': 'polite' } }),
    ]);
    return row;
  }

  function showFieldError(form, name, message) {
    const row = form.querySelector(`[data-field="${name}"]`);
    if (!row) return false;
    row.classList.add('has-error');
    row.querySelector('.field-error').textContent = message;
    return true;
  }

  /** A save status. `extra()` makes another view of it (the comp card shows one per layout). */
  function statusLine() {
    const make = (live) => el('p', { className: 'tk-status', attrs: live ? { role: 'status', 'aria-live': 'polite' } : {} });
    const nodes = [make(true)];
    let current = ['', ''];
    const paint = (node) => {
      node.dataset.state = current[0];
      node.textContent = current[1];
    };
    return {
      node: nodes[0],
      extra() {
        const node = make(true);
        nodes.push(node);
        paint(node);
        return node;
      },
      set(stateName, text) {
        current = [stateName, text];
        nodes.forEach(paint);
      },
    };
  }

  /** Maps a 400's issues onto the form's fields; true if any landed. */
  function applyIssues(form, error, fieldFor) {
    let placed = false;
    for (const issue of error.issues ?? []) {
      const name = fieldFor(issue.path ?? '');
      if (name && showFieldError(form, name, issue.message || 'Check this.')) placed = true;
    }
    form.querySelector('.field.has-error .input')?.focus();
    return placed;
  }

  // ---- The comp card itself (editor preview and the preview screen) ----

  function compCard({ profile, draft, fixtures }, size = 'compact') {
    const labelOf = (key) => fixtures.find((f) => f.key === key)?.label ?? 'Fixture';
    const image = (slot) =>
      el('img', {
        attrs: {
          src: fixtureSrc(draft.slots[slot.key]),
          alt: `${slot.label}: ${labelOf(draft.slots[slot.key])} (synthetic fixture)`,
          width: '400',
          height: '500',
          decoding: 'async',
        },
      });
    const name = profile?.displayName || 'Your name';
    const back = SLOTS.slice(1);
    return el('div', { className: `cc-card ${size}`, attrs: { 'data-preview': '' } }, [
      el('article', { className: 'cc-side cc-front', attrs: { 'aria-label': 'Comp card, front' } }, [
        el('figure', { className: 'cc-hero', attrs: { 'data-slot': 'hero' } }, [image(SLOTS[0])]),
        el('div', { className: 'cc-nameplate' }, [
          el('h2', { className: 'cc-name', text: name }),
          profile?.profession ? el('p', { className: 'cc-profession', text: profile.profession }) : null,
        ]),
      ]),
      el('article', { className: 'cc-side cc-back', attrs: { 'aria-label': 'Comp card, back' } }, [
        el(
          'div',
          { className: 'cc-grid' },
          back.map((slot) => el('figure', { attrs: { 'data-slot': slot.key } }, [image(slot), el('figcaption', { text: slot.label })])),
        ),
        el('div', { className: 'cc-meta' }, [
          el('p', { className: 'cc-name-small', text: name }),
          draft.tagline ? el('p', { className: 'cc-tagline', text: draft.tagline }) : null,
          profile?.biography ? el('p', { className: 'cc-bio', text: profile.biography }) : null,
        ]),
        el('p', { className: 'cc-foot', text: 'Private draft · synthetic fixture images' }),
      ]),
    ]);
  }

  // ---- Screen: profile ----

  async function renderProfile(root) {
    const { profile } = await api('GET', '/me/profile');
    let saved = profile ? { displayName: profile.displayName, profession: profile.profession, biography: profile.biography } : null;
    const values = memory.profile ?? { ...(saved ?? { displayName: '', profession: '', biography: '' }) };
    const status = statusLine();
    const same = (a, b) => a !== null && b !== null && a.displayName === b.displayName && a.profession === b.profession && a.biography === b.biography;
    let savedTime = profile?.updatedAt ?? null;
    const refresh = () => {
      const dirty = !same(values, saved);
      memory.profile = dirty ? { ...values } : null;
      if (!saved) status.set('new', 'Not saved yet');
      else if (dirty) status.set('dirty', 'Unsaved changes');
      else status.set('saved', savedAt(savedTime));
    };
    const onInput = (key) => (value) => {
      values[key] = value;
      refresh();
    };

    const heading = el('h1', { text: saved?.displayName || 'Set up your profile' });
    const next = el('p', { className: 'tk-next' }, [link('Next: arrange your comp card ›', '#/me/card', 'link')]);
    next.hidden = !saved;

    const form = el('form', { className: 'section-card tk-form tk-profile', attrs: { novalidate: '', 'aria-label': 'Profile' } }, [
      field({ id: 'displayName', label: 'Display name', hint: 'How your name appears on your card.', value: values.displayName, max: LIMITS.displayName, required: true, onInput: onInput('displayName') }),
      field({ id: 'profession', label: 'Profession', hint: 'For example: Model, Photographer, Makeup artist.', value: values.profession, max: LIMITS.profession, onInput: onInput('profession') }),
      field({ id: 'biography', label: 'Short biography', hint: 'A few sentences in your own words. Plain text.', value: values.biography, max: LIMITS.biography, multiline: true, onInput: onInput('biography') }),
      el('div', { className: 'tk-actions' }, [
        status.node,
        el('button', { className: 'btn primary tk-save', text: 'Save profile', attrs: { type: 'submit' } }),
      ]),
    ]);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const save = form.querySelector('.tk-save');
      if (save.disabled) return;
      if (values.displayName.trim() === '') {
        showFieldError(form, 'displayName', 'Enter a display name.');
        form.querySelector('#displayName').focus();
        status.set('error', 'Not saved. Check the highlighted field.');
        return;
      }
      save.disabled = true;
      save.setAttribute('aria-busy', 'true');
      try {
        const result = await api('POST', '/me/profile', { displayName: values.displayName, profession: values.profession, biography: values.biography });
        const first = saved === null;
        saved = { displayName: result.profile.displayName, profession: result.profile.profession, biography: result.profile.biography };
        // The server trims; show what was kept.
        Object.assign(values, saved);
        for (const key of Object.keys(saved)) form.querySelector(`#${key}`).value = saved[key];
        form.querySelectorAll('.input').forEach((input) => input.dispatchEvent(new Event('input')));
        savedTime = result.profile.updatedAt;
        refresh();
        heading.textContent = saved.displayName;
        next.hidden = false;
        toast(first ? 'Profile created.' : 'Profile saved.');
      } catch (error) {
        if (error.status === 400 && applyIssues(form, error, (path) => path.split('.')[0])) status.set('error', 'Not saved. Check the highlighted fields.');
        else status.set('error', `Not saved. ${error.status ? refusal(error) : 'Check the connection and try again.'}`);
      } finally {
        save.disabled = false;
        save.removeAttribute('aria-busy');
      }
    });

    refresh();

    root.append(
      el('header', { className: 'page-head' }, [
        el('p', { className: 'eyebrow', text: 'Your professional profile' }),
        heading,
        el('p', { className: 'muted', text: 'The essentials a collaborator reads first. Your comp card uses your name and profession.' }),
      ]),
      form,
      next,
    );
  }

  // ---- Screen: arrange the comp card ----

  function noProfileYet(root, what = 'comp card') {
    root.append(
      el('section', { className: 'state tk-empty', attrs: { 'data-empty': 'no-profile' } }, [
        el('h2', { text: 'Start with your profile' }),
        el('p', { text: `Your ${what} shows your name and profession, so save your profile first.` }),
        link('Go to your profile', '#/me', 'btn primary block'),
      ]),
    );
  }

  async function renderCard(root) {
    const view = await api('GET', '/me/comp-card');
    root.append(
      el('header', { className: 'page-head' }, [
        el('p', { className: 'eyebrow', text: 'Comp card draft' }),
        el('h1', { text: 'Arrange your comp card' }),
        el('p', { className: 'muted', text: 'Choose an image for each slot. The preview follows along; Save keeps it.' }),
      ]),
    );
    if (!view.profile) return noProfileYet(root);

    let saved = { tagline: view.draft.tagline, slots: { ...view.draft.slots } };
    const values = memory.card ? { tagline: memory.card.tagline, slots: { ...memory.card.slots } } : { tagline: saved.tagline, slots: { ...saved.slots } };
    const status = statusLine();
    const previewHolder = el('div', { className: 'tk-preview-holder' });
    const same = (a, b) => a.tagline === b.tagline && SLOTS.every((s) => a.slots[s.key] === b.slots[s.key]);
    const paint = () => previewHolder.replaceChildren(compCard({ profile: view.profile, draft: values, fixtures: view.fixtures }));
    const refresh = () => {
      const changed = !same(values, saved);
      memory.card = changed ? { tagline: values.tagline, slots: { ...values.slots } } : null;
      if (changed) status.set('dirty', 'Unsaved changes');
      else if (view.draft.updatedAt === null) status.set('new', 'Not saved yet · a suggested arrangement');
      else status.set('saved', savedAt(view.draft.updatedAt));
      paint();
    };

    const form = el('form', { className: 'tk-form tk-card', attrs: { id: 'tk-card-form', novalidate: '', 'aria-label': 'Comp card' } });

    const slotSet = (slot) => {
      const strip = el('div', { className: 'tk-strip' });
      for (const fixture of view.fixtures) {
        const id = `slot-${slot.key}-${fixture.key}`;
        const input = el('input', { attrs: { type: 'radio', name: `slot-${slot.key}`, id, value: fixture.key } });
        input.checked = values.slots[slot.key] === fixture.key;
        input.addEventListener('change', () => {
          if (!input.checked) return;
          const previous = values.slots[slot.key];
          const holder = SLOTS.find((s) => s.key !== slot.key && values.slots[s.key] === fixture.key);
          values.slots[slot.key] = fixture.key;
          if (holder) {
            // One image per slot: the slot that had it takes this slot's old image.
            values.slots[holder.key] = previous;
            const swapped = form.querySelector(`input[name="slot-${holder.key}"][value="${previous}"]`);
            if (swapped) swapped.checked = true;
            toast(`Swapped with ${holder.label}.`);
          }
          form.querySelectorAll('.tk-slot').forEach((set) => set.dispatchEvent(new Event('sync')));
          refresh();
        });
        strip.append(
          el('label', { className: 'tk-thumb', attrs: { for: id, title: fixture.label } }, [
            input,
            el('img', { attrs: { src: fixtureSrc(fixture.key), alt: '', width: '400', height: '500', loading: 'lazy', decoding: 'async' } }),
            el('span', { className: 'visually-hidden', text: fixture.label }),
          ]),
        );
      }
      const current = el('span', { className: 'tk-current' });
      const set = el('fieldset', { className: 'tk-slot', attrs: { 'data-slot': slot.key } }, [
        el('legend', {}, [el('strong', { text: slot.label }), el('span', { className: 'small muted', text: ` · ${slot.hint}` })]),
        current,
        strip,
      ]);
      set.addEventListener('sync', () => {
        current.textContent = view.fixtures.find((f) => f.key === values.slots[slot.key])?.label ?? '';
      });
      set.dispatchEvent(new Event('sync'));
      return set;
    };

    const tagline = field({
      id: 'tagline',
      label: 'Tagline',
      hint: 'Optional. One line on the back of the card.',
      value: values.tagline,
      max: LIMITS.tagline,
      onInput: (value) => {
        values.tagline = value;
        refresh();
      },
    });

    // One save control per layout (the phone's sticky footer, the desktop's preview column); CSS shows one.
    const save = el('button', { className: 'btn primary tk-save', text: 'Save comp card', attrs: { type: 'submit' } });
    const asideSave = el('button', { className: 'btn primary block tk-save', text: 'Save comp card', attrs: { type: 'submit', form: 'tk-card-form' } });
    const saves = [save, asideSave];
    form.append(
      el('section', { className: 'section-card tk-slots' }, [el('header', {}, [el('h2', { text: 'Images' }), el('p', { text: 'Synthetic fixture images stand in for your own work. Each image fills one slot.' })]), ...SLOTS.map(slotSet)]),
      el('section', { className: 'section-card' }, [tagline]),
      el('div', { className: 'sticky-footer tk-footer' }, [el('div', { className: 'tk-actions' }, [status.node, save])]),
    );

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (save.disabled) return;
      saves.forEach((b) => {
        b.disabled = true;
        b.setAttribute('aria-busy', 'true');
      });
      try {
        const result = await api('POST', '/me/comp-card', { tagline: values.tagline, slots: { ...values.slots } });
        view.draft = result.draft;
        saved = { tagline: result.draft.tagline, slots: { ...result.draft.slots } };
        values.tagline = saved.tagline;
        form.querySelector('#tagline').value = saved.tagline;
        refresh();
        toast('Comp card saved.');
      } catch (error) {
        if (error.status === 409) status.set('error', 'Not saved. Save your profile first.');
        else if (error.status === 400 && applyIssues(form, error, (path) => (path.startsWith('tagline') ? 'tagline' : null))) status.set('error', 'Not saved. Check the highlighted field.');
        else status.set('error', `Not saved. ${error.status ? refusal(error) : 'Check the connection and try again.'}`);
      } finally {
        saves.forEach((b) => {
          b.disabled = false;
          b.removeAttribute('aria-busy');
        });
      }
    });

    refresh();

    root.append(
      el('div', { className: 'tk-workspace' }, [
        form,
        el('aside', { className: 'tk-aside', attrs: { 'aria-label': 'Live preview' } }, [
          el('p', { className: 'eyebrow', text: 'Live preview' }),
          previewHolder,
          el('div', { className: 'tk-aside-actions' }, [status.extra(), asideSave]),
          link('Open the full preview', '#/me/card/preview', 'link'),
        ]),
      ]),
    );
    // On a phone each strip scrolls sideways: bring its chosen image into view once on screen.
    requestAnimationFrame(() => {
      for (const strip of form.querySelectorAll('.tk-strip')) {
        const chosen = strip.querySelector('input:checked')?.parentElement;
        if (chosen) strip.scrollLeft = Math.max(0, chosen.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft - 4);
      }
    });
  }

  // ---- Screen: preview ----

  async function renderPreview(root) {
    const view = await api('GET', '/me/comp-card');
    root.append(
      el('header', { className: 'page-head' }, [
        el('p', { className: 'eyebrow', text: 'Preview' }),
        el('h1', { text: 'Your comp card' }),
        el('p', { className: 'muted', text: 'Front and back, as your draft stands. Private: only you can see it.' }),
      ]),
    );
    if (!view.profile) return noProfileYet(root);
    const draft = memory.card ?? view.draft;
    if (memory.card || memory.profile) {
      root.append(
        el('p', { className: 'tk-notice', attrs: { 'data-unsaved': '' } }, [
          el('span', { text: memory.card ? 'Showing unsaved changes to your card. ' : 'Your profile has unsaved changes, not shown here. ' }),
          link(memory.card ? 'Back to save them' : 'Back to your profile', memory.card ? '#/me/card' : '#/me', 'link'),
        ]),
      );
    } else if (view.draft.updatedAt === null) {
      root.append(el('p', { className: 'tk-notice' }, [el('span', { text: 'This is the suggested arrangement; it isn’t saved yet. ' }), link('Arrange and save it', '#/me/card', 'link')]));
    }
    root.append(compCard({ profile: view.profile, draft, fixtures: view.fixtures }, 'full'), link('Back to editing', '#/me/card', 'btn block tk-back'));
  }

  // ---- The portfolio itself (editor preview and the preview screen) ----

  function portfolioSheet({ profile, items, captions = {}, fixtures }, size = 'compact') {
    const labelOf = (key) => fixtures.find((f) => f.key === key)?.label ?? 'Fixture';
    const number = (i) => String(i + 1).padStart(2, '0');
    return el('div', { className: `pf-sheet ${size}`, attrs: { 'data-portfolio-preview': '' } }, [
      el('header', { className: 'pf-head' }, [
        el('p', { className: 'pf-kicker', text: 'Portfolio' }),
        el('h2', { className: 'pf-name', text: profile?.displayName || 'Your name' }),
        profile?.profession ? el('p', { className: 'pf-profession', text: profile.profession }) : null,
      ]),
      items.length === 0
        ? el('p', { className: 'pf-blank', attrs: { 'data-empty': 'portfolio' }, text: 'No images yet' })
        : el(
            'ol',
            { className: 'pf-grid' },
            items.map((key, i) => {
              const caption = (captions[key] ?? '').trim();
              return el('li', { attrs: { 'data-key': key } }, [
                el('figure', {}, [
                  el('div', { className: 'pf-frame' }, [
                    el('img', { attrs: { src: fixtureSrc(key), alt: `${i + 1}. ${labelOf(key)} (synthetic fixture)`, width: '400', height: '500', decoding: 'async' } }),
                    el('span', { className: 'pf-num', attrs: { 'aria-hidden': 'true' }, text: number(i) }),
                  ]),
                  // The caption is the owner's own text, written as text only (never markup).
                  caption ? el('figcaption', { className: 'pf-cap', text: caption }) : null,
                ]),
              ]);
            }),
          ),
      el('p', { className: 'pf-foot', text: 'Private draft · synthetic fixture images' }),
    ]);
  }

  // ---- Screen: organize the portfolio ----

  async function renderPortfolio(root) {
    const view = await api('GET', '/me/portfolio');
    const max = view.maxItems;
    root.append(
      el('header', { className: 'page-head' }, [
        el('p', { className: 'eyebrow', text: 'Portfolio draft' }),
        el('h1', { text: 'Organize your portfolio' }),
        el('p', { className: 'muted', text: `Choose up to ${max} images, put them in order and add a short caption to any of them. The first leads. Save keeps it.` }),
      ]),
    );
    if (!view.profile) return noProfileYet(root, 'portfolio');

    let saved = [...view.draft.items];
    let savedCaptions = { ...view.draft.captions };
    const items = memory.portfolio ? [...memory.portfolio.items] : [...saved];
    // Captions by fixture key, as typed; only the selected keys are kept and sent.
    const captions = memory.portfolio ? { ...memory.portfolio.captions } : { ...savedCaptions };
    const captionMax = view.maxCaptionLength;
    const labelOf = (key) => view.fixtures.find((f) => f.key === key)?.label ?? 'Fixture';
    const status = statusLine();
    const previewHolder = el('div', { className: 'tk-preview-holder' });
    // B4: shown only after a save was refused because the draft changed
    // elsewhere. The edits on this screen are kept as they are; nothing is
    // reloaded, discarded or overwritten until the person says so.
    const conflict = el('section', { className: 'pf-conflict', attrs: { 'data-conflict': '', role: 'alert', 'aria-label': 'Save refused', hidden: '' } });
    const count = el('p', { className: 'pf-count', attrs: { 'aria-live': 'polite' } });
    const order = el('ol', { className: 'pf-order', attrs: { 'aria-label': 'Your selection, in order' } });
    const emptyNote = el('p', { className: 'pf-note', attrs: { 'data-empty': 'selection' }, text: 'Nothing selected yet. Add images from the fixtures below.' });
    const fullNote = el('p', { className: 'pf-note', attrs: { 'data-full': '' }, text: `Your portfolio is full. Remove an image to add another.` });
    const catalogue = el('ul', { className: 'pf-catalogue' });

    const captionOf = (key) => (captions[key] ?? '').trim();
    const same = () => items.length === saved.length && items.every((k, i) => k === saved[i] && captionOf(k) === (savedCaptions[k] ?? ''));
    /** Takes a saved draft from the server as the one this screen is based on. */
    const adopt = (draft) => {
      view.draft = draft;
      saved = [...draft.items];
      savedCaptions = { ...draft.captions };
    };
    /** Replaces the edits on this screen with the saved draft; only ever on an explicit action. */
    const load = (draft) => {
      adopt(draft);
      items.splice(0, items.length, ...saved);
      Object.keys(captions).forEach((key) => delete captions[key]);
      Object.assign(captions, savedCaptions);
    };
    const hideConflict = () => {
      conflict.hidden = true;
      conflict.replaceChildren();
    };
    /** The warning after a refused save: what happened, that nothing was lost, and the deliberate ways on. */
    const showConflict = () => {
      const latest = el('div', { className: 'pf-conflict-latest', attrs: { 'data-conflict-latest': '' } });
      const review = el('button', { className: 'btn pf-conflict-review', text: 'Review the saved version', attrs: { type: 'button', 'data-action': 'review' } });
      conflict.replaceChildren(
        el('h2', { text: 'Not saved: this portfolio changed elsewhere' }),
        el('p', {
          text: 'It was saved from another tab or window after you opened it here. Your edits on this screen are kept and nothing has been overwritten. Review the saved version before deciding what to keep.',
        }),
        el('div', { className: 'pf-conflict-actions' }, [review]),
        latest,
      );
      review.addEventListener('click', async () => {
        review.disabled = true;
        let fresh;
        try {
          fresh = await api('GET', '/me/portfolio');
        } catch (error) {
          review.disabled = false;
          status.set('error', `Could not load the saved version. ${error.status ? refusal(error) : 'Check the connection and try again.'}`);
          return;
        }
        // From here on, Save replaces the version just reviewed with the edits on this screen: a deliberate choice, named as such.
        adopt(fresh.draft);
        const list = el('ol', { className: 'pf-conflict-list' }, fresh.draft.items.map((key) => el('li', { attrs: { 'data-key': key } }, [el('span', { text: labelOf(key) }), ...(fresh.draft.captions[key] ? [el('span', { className: 'pf-conflict-cap', text: fresh.draft.captions[key] })] : [])])));
        const useSaved = el('button', { className: 'btn pf-conflict-load', text: 'Replace my edits with the saved version', attrs: { type: 'button', 'data-action': 'load' } });
        useSaved.addEventListener('click', () => {
          load(fresh.draft);
          hideConflict();
          paint();
          toast('Showing the saved version. Your edits here were set aside.');
        });
        latest.replaceChildren(
          el('h3', { text: fresh.draft.items.length ? `Saved version (${fresh.draft.items.length} ${fresh.draft.items.length === 1 ? 'image' : 'images'}, ${savedAt(fresh.draft.updatedAt).toLowerCase()})` : `Saved version (no images, ${savedAt(fresh.draft.updatedAt).toLowerCase()})` }),
          ...(fresh.draft.items.length ? [list] : []),
          el('p', { text: 'Keep your edits and press Save to replace the saved version with them, or:' }),
          el('div', { className: 'pf-conflict-actions' }, [useSaved]),
        );
        review.hidden = true;
        refresh();
        useSaved.focus();
      });
      conflict.hidden = false;
      conflict.scrollIntoView?.({ block: 'nearest' });
    };
    const refresh = () => {
      const changed = !same();
      memory.portfolio = changed ? { items: [...items], captions: { ...captions } } : null;
      if (!conflict.hidden && changed) status.set('error', 'Not saved. See the warning above.');
      else if (changed) status.set('dirty', 'Unsaved changes');
      else if (view.draft.updatedAt === null) status.set('new', 'Not saved yet');
      else status.set('saved', savedAt(view.draft.updatedAt));
      previewHolder.replaceChildren(portfolioSheet({ profile: view.profile, items, captions, fixtures: view.fixtures }));
    };

    /** Redraws the ordered list and the catalogue; `focus` names a control to return focus to. */
    const paint = (focus) => {
      count.textContent = `${items.length} of ${max} selected`;
      emptyNote.hidden = items.length > 0;
      fullNote.hidden = items.length < max;
      order.replaceChildren(
        ...items.map((key, i) => {
          const label = labelOf(key);
          const control = (text, action, aria, disabled) =>
            el('button', { className: `pf-move`, text, attrs: { type: 'button', 'data-action': action, 'aria-label': aria, ...(disabled ? { disabled: '' } : {}) } });
          const captionInput = el('input', {
            className: 'input pf-caption',
            attrs: {
              type: 'text',
              name: `caption-${key}`,
              maxlength: String(captionMax),
              autocomplete: 'off',
              placeholder: 'Caption (optional)',
              'aria-label': `Caption for ${label}`,
            },
          });
          captionInput.value = captions[key] ?? '';
          captionInput.addEventListener('input', () => {
            captions[key] = captionInput.value;
            refresh();
          });
          return el('li', { className: 'pf-item', attrs: { 'data-key': key } }, [
            el('img', { attrs: { src: fixtureSrc(key), alt: '', width: '400', height: '500', decoding: 'async' } }),
            el('span', { className: 'pf-pos', attrs: { 'aria-hidden': 'true' }, text: String(i + 1) }),
            el('span', { className: 'pf-label', text: label }),
            el('span', { className: 'pf-controls' }, [
              control('↑', 'up', `Move ${label} earlier`, i === 0),
              control('↓', 'down', `Move ${label} later`, i === items.length - 1),
              control('Remove', 'remove', `Remove ${label}`, false),
            ]),
            captionInput,
          ]);
        }),
      );
      catalogue.replaceChildren(
        ...view.fixtures.map((fixture) => {
          const at = items.indexOf(fixture.key);
          const picked = at >= 0;
          const pick = el(
            'button',
            {
              className: 'pf-pick',
              attrs: {
                type: 'button',
                'data-key': fixture.key,
                'aria-pressed': String(picked),
                ...(!picked && items.length >= max ? { disabled: '' } : {}),
              },
            },
            [
              el('img', { attrs: { src: fixtureSrc(fixture.key), alt: '', width: '400', height: '500', loading: 'lazy', decoding: 'async' } }),
              el('span', { className: 'pf-pick-label', text: fixture.label }),
              el('span', { className: 'pf-pick-state', text: picked ? `Added · ${at + 1}` : 'Add' }),
            ],
          );
          return el('li', {}, [pick]);
        }),
      );
      if (focus) {
        const target =
          focus.action === 'pick'
            ? catalogue.querySelector(`.pf-pick[data-key="${focus.key}"]`)
            : order.querySelector(`.pf-item[data-key="${focus.key}"] [data-action="${focus.action}"]:not([disabled])`) ??
              order.querySelector(`.pf-item[data-key="${focus.key}"] .pf-move:not([disabled])`);
        (target ?? order.querySelector('.pf-move') ?? catalogue.querySelector('.pf-pick:not([disabled])'))?.focus();
      }
      refresh();
    };

    order.addEventListener('click', (event) => {
      const control = event.target.closest('.pf-move');
      if (!control || control.disabled) return;
      const key = control.closest('.pf-item').dataset.key;
      const at = items.indexOf(key);
      const action = control.dataset.action;
      if (action === 'remove') {
        items.splice(at, 1);
        delete captions[key]; // an image taken out loses its caption; added again, it starts blank
        toast(`Removed ${labelOf(key)}.`);
        // Focus moves to the item that took its place, or the one before it.
        const next = items[Math.min(at, items.length - 1)];
        return paint(next ? { key: next, action: 'remove' } : { action: 'pick', key });
      }
      const to = action === 'up' ? at - 1 : at + 1;
      [items[at], items[to]] = [items[to], items[at]];
      paint({ key, action });
    });

    catalogue.addEventListener('click', (event) => {
      const pick = event.target.closest('.pf-pick');
      if (!pick || pick.disabled) return;
      const key = pick.dataset.key;
      const at = items.indexOf(key);
      if (at >= 0) {
        items.splice(at, 1);
        delete captions[key];
      } else items.push(key);
      paint({ key, action: 'pick' });
    });

    const save = el('button', { className: 'btn primary tk-save', text: 'Save portfolio', attrs: { type: 'submit' } });
    const asideSave = el('button', { className: 'btn primary block tk-save', text: 'Save portfolio', attrs: { type: 'submit', form: 'tk-portfolio-form' } });
    const saves = [save, asideSave];
    const form = el('form', { className: 'tk-form tk-portfolio', attrs: { id: 'tk-portfolio-form', novalidate: '', 'aria-label': 'Portfolio' } }, [
      conflict,
      el('section', { className: 'section-card pf-selection' }, [
        el('header', { className: 'pf-section-head' }, [el('h2', { text: 'Your selection' }), count]),
        emptyNote,
        fullNote,
        order,
      ]),
      el('section', { className: 'section-card pf-add' }, [
        el('header', {}, [el('h2', { text: 'Add images' }), el('p', { text: `Synthetic fixture images stand in for your own work. Each can appear once, with a caption of up to ${captionMax} characters.` })]),
        catalogue,
      ]),
      el('div', { className: 'sticky-footer tk-footer' }, [el('div', { className: 'tk-actions' }, [status.node, save])]),
    ]);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (save.disabled) return;
      saves.forEach((b) => {
        b.disabled = true;
        b.setAttribute('aria-busy', 'true');
      });
      try {
        const sent = Object.fromEntries(items.flatMap((key) => (captionOf(key) ? [[key, captionOf(key)]] : [])));
        // B4: the save names the revision this screen is based on; the server refuses it if the draft moved on.
        const result = await api('POST', '/me/portfolio', { items: [...items], captions: sent, expectedRevision: view.draft.revision });
        load(result.draft);
        hideConflict();
        paint();
        toast('Portfolio saved.');
      } catch (error) {
        if (error.status === 409 && error.code === 'stale_revision') {
          showConflict();
          refresh();
        } else if (error.status === 409) status.set('error', 'Not saved. Save your profile first.');
        else status.set('error', `Not saved. ${error.status ? refusal(error) : 'Check the connection and try again.'}`);
      } finally {
        saves.forEach((b) => {
          b.disabled = false;
          b.removeAttribute('aria-busy');
        });
      }
    });

    paint();

    root.append(
      el('div', { className: 'tk-workspace' }, [
        form,
        el('aside', { className: 'tk-aside', attrs: { 'aria-label': 'Live preview' } }, [
          el('p', { className: 'eyebrow', text: 'Live preview' }),
          previewHolder,
          el('div', { className: 'tk-aside-actions' }, [status.extra(), asideSave]),
          link('Open the full preview', '#/me/portfolio/preview', 'link'),
        ]),
      ]),
    );
  }

  // ---- Screen: portfolio preview ----

  async function renderPortfolioPreview(root) {
    const view = await api('GET', '/me/portfolio');
    root.append(
      el('header', { className: 'page-head' }, [
        el('p', { className: 'eyebrow', text: 'Preview' }),
        el('h1', { text: 'Your portfolio' }),
        el('p', { className: 'muted', text: 'In order, as your draft stands. Private: only you can see it.' }),
      ]),
    );
    if (!view.profile) return noProfileYet(root, 'portfolio');
    const items = memory.portfolio ? memory.portfolio.items : view.draft.items;
    const captions = memory.portfolio ? memory.portfolio.captions : view.draft.captions;
    if (memory.portfolio || memory.profile) {
      root.append(
        el('p', { className: 'tk-notice', attrs: { 'data-unsaved': '' } }, [
          el('span', { text: memory.portfolio ? 'Showing unsaved changes to your portfolio. ' : 'Your profile has unsaved changes, not shown here. ' }),
          link(memory.portfolio ? 'Back to save them' : 'Back to your profile', memory.portfolio ? '#/me/portfolio' : '#/me', 'link'),
        ]),
      );
    } else if (items.length === 0) {
      root.append(el('p', { className: 'tk-notice' }, [el('span', { text: 'Your portfolio has no images yet. ' }), link('Choose some', '#/me/portfolio', 'link')]));
    } else if (view.draft.updatedAt === null) {
      root.append(el('p', { className: 'tk-notice' }, [el('span', { text: 'This portfolio isn’t saved yet. ' }), link('Save it', '#/me/portfolio', 'link')]));
    }
    root.append(portfolioSheet({ profile: view.profile, items, captions, fixtures: view.fixtures }, 'full'), link('Back to editing', '#/me/portfolio', 'btn block tk-back'));
  }

  // ---- Router entry ----

  async function render(root, hash) {
    if (h.onStaging()) {
      root.append(el('section', { className: 'state' }, [el('p', { text: 'The professional toolkit is part of the local demo only, not synthetic staging.' })]), link('Back to start', '#/', 'btn block'));
      return;
    }
    const who = await api('GET', '/demo/toolkit/owner');
    if (who.mode !== 'account') {
      forOwner(undefined);
      root.append(chooser(who.mode));
      return;
    }
    forOwner(who.owner ?? 'account');
    root.append(band(who), ...tabs(hash));
    if (hash === '#/me') await renderProfile(root);
    else if (hash === '#/me/card') await renderCard(root);
    else if (hash === '#/me/card/preview') await renderPreview(root);
    else if (hash === '#/me/portfolio') await renderPortfolio(root);
    else if (hash === '#/me/portfolio/preview') await renderPortfolioPreview(root);
    else root.append(el('section', { className: 'state' }, [el('p', { text: 'There is no such page in your toolkit.' })]), link('Your profile', '#/me', 'btn block'));
  }

  /** A quiet entry to the toolkit for other screens (local demo only). */
  function teaser() {
    if (h.onStaging()) return null;
    return el('section', { className: 'quiet-card tk-teaser' }, [
      el('p', { className: 'eyebrow', text: 'Professional toolkit' }),
      el('h2', { text: 'Your profile, comp card and portfolio' }),
      el('p', { className: 'muted', text: 'A private profile, a comp card and a portfolio you arrange and preview. Only you can see them.' }),
      link('Open your toolkit', '#/me', 'link tk-open'),
    ]);
  }

  return { render, teaser };
}
