// =====================================================================
// app.js: работа с ЭКРАНОМ. Берёт ввод ученика, вызывает функции из
// logic.js и logic-school.js и показывает результат. Сама ничего не «решает».
// Экраны: приветствие -> регистрация -> главная -> 6 разделов.
// =====================================================================

const STORAGE_KEY = 'compass7-state-v2';

function freshState(lang) {
  return {
    lang: lang || 'ru',
    screen: 'welcome',  // welcome | register | home | diag | faq | route | clubs | mentor | plan
    profile: null,      // анкета после регистрации
    draft: { name: '', cls: '', interests: [], dorm: false, bed: '22:00', wake: '06:30' },
    regErrors: [],
    answers: {}, testErrors: [], testResult: null,
    asked: [], lastQuery: '', faqError: null,
    routeDay: null, routeSeen: false,
    activities: [], clubMsg: null,
    mentorId: null,
    openOthers: false, openMentors: false // раскрыты ли списки «Остальные»
  };
}
let state = freshState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      state = Object.assign(freshState(), saved, { testErrors: [], faqError: null, regErrors: [], clubMsg: null });
    }
  } catch (e) { /* хранилище недоступно: работаем без сохранения */ }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* не критично */ }
}

function t(key) { return UI[state.lang][key]; }
// Подстановка значений: tf('hello', {name: 'Айгерим'})
function tf(key, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.split('{' + k + '}').join(v), t(key));
}
function L() { return state.lang; }

// ---------------------------------------------------------------------
// h('p', {class:'x'}, 'текст'): создаёт элемент. Текст ученика вставляется
// только как текст, не как HTML, поэтому страницу нельзя «сломать» вводом.
// ---------------------------------------------------------------------
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // только для наших SVG-иконок
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function svg(markup) { return h('span', { html: markup }).firstChild; }

// Иконки статусов (нарисованы вручную)
const ICONS = {
  closed: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M5.5 10.5l3 3 6-6.5" fill="none" stroke="var(--ok-bg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  review: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 2a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  attention: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l9 16H1z" fill="currentColor"/><path d="M10 7v5" stroke="var(--bad-bg)" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="14.8" r="1.2" fill="var(--bad-bg)"/></svg>'
};
const STATUS_TEXT = { closed: 'stClosed', review: 'stReview', attention: 'stAttention' };
// chip('closed') -> «✓ Тема закрыта»; можно передать свой текст
function chip(status, text) {
  return h('span', { class: 'chip chip-' + status }, svg(ICONS[status]), text || t(STATUS_TEXT[status]));
}
function prioIcon(p) {
  return h('span', { class: 'prio prio-' + p, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
}
const PRIO_TEXT = { urgent: 'prUrgent', week: 'prWeek', later: 'prLater' };

// Разделы после регистрации (порядок = рекомендуемый путь)
const SECTIONS = [
  { id: 'diag', label: 'secDiag' },
  { id: 'faq', label: 'secFaq' },
  { id: 'route', label: 'secRoute' },
  { id: 'clubs', label: 'secClubs' },
  { id: 'mentor', label: 'secMentor' },
  { id: 'plan', label: 'secPlan' }
];

function go(screen) {
  state.screen = screen;
  if (screen === 'route') state.routeSeen = true;
  saveState();
  render();
  window.scrollTo({ top: 0 });
  document.getElementById('main').focus({ preventScroll: true });
}

// =====================================================================
// ОТРИСОВКА
// =====================================================================
function render() {
  document.documentElement.lang = L() === 'kz' ? 'kk' : 'ru';
  document.title = t('appName');
  document.getElementById('app-name').textContent = t('appName');
  document.getElementById('reset-btn').textContent = t('reset');
  document.getElementById('reset-btn').hidden = !state.profile;
  document.getElementById('footer-text').textContent = t('footer');
  document.getElementById('lang-group').setAttribute('aria-label', t('langLabel'));
  for (const b of document.querySelectorAll('.lang button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === L()));
  }
  // Без профиля в разделы не пускаем: сначала регистрация
  if (!state.profile && !['welcome', 'register'].includes(state.screen)) state.screen = 'welcome';
  renderNav();

  const screens = {
    welcome: renderWelcome, register: renderRegister, home: renderHome,
    diag: renderTest, faq: renderFaq, route: renderRoute,
    clubs: renderClubs, mentor: renderMentor, plan: renderPlan
  };
  document.getElementById('main').replaceChildren(screens[state.screen]());
}

function renderNav() {
  const nav = document.getElementById('nav');
  if (!state.profile) { nav.replaceChildren(); nav.hidden = true; return; }
  nav.hidden = false;
  const items = [{ id: 'home', label: 'navHome', num: '' }].concat(SECTIONS.map((s, i) => Object.assign({ num: String(i + 1) }, s)));
  nav.replaceChildren(h('ul', { class: 'tabs' }, items.map((s) =>
    h('li', {}, h('button', {
      type: 'button', 'aria-current': state.screen === s.id ? 'page' : null, onclick: () => go(s.id)
    }, s.num ? h('span', { class: 'tab-num' }, s.num) : null, t(s.label))))));
}

// ---------------------------------------------------------------------
// ПРИВЕТСТВИЕ
// ---------------------------------------------------------------------
function renderWelcome() {
  return h('section', { class: 'welcome', 'aria-labelledby': 'hello-h' },
    h('h2', { class: 'hello-big', id: 'hello-h' }, t('helloBig')),
    h('p', { class: 'lead' }, t('welcomeLead')),
    h('div', { class: 'box welcome-box' },
      h('h3', {}, t('welcomeWhat')),
      h('ol', { class: 'welcome-steps' }, t('welcomeSteps').map((s) => h('li', {}, s)))),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'start-btn', onclick: () => go(state.profile ? 'home' : 'register') }, t('start')))
  );
}

// ---------------------------------------------------------------------
// РЕГИСТРАЦИЯ
// ---------------------------------------------------------------------
function renderRegister() {
  const d = state.draft;
  const errs = {};
  for (const e of state.regErrors) errs[e.field] = e.code;
  const check = validateProfile(Object.assign({}, d, { lang: L() }));
  const warn = check.warnings[0];

  const errP = (field) => errs[field]
    ? h('p', { class: 'field-error', id: 'err-' + field }, svg(ICONS.attention), t(errs[field])) : null;
  const upd = (patch) => { Object.assign(state.draft, patch); saveState(); };

  const form = h('form', { class: 'reg-form', novalidate: true, onsubmit: onRegister },
    // Имя
    h('div', { class: 'field' },
      h('label', { for: 'f-name' }, t('fName')),
      h('span', { class: 'hint', id: 'hint-name' }, t('fNameHint')),
      h('input', { id: 'f-name', type: 'text', maxlength: '40', autocomplete: 'off', value: d.name,
        'aria-invalid': errs.name ? 'true' : null, 'aria-describedby': errs.name ? 'err-name' : 'hint-name',
        oninput: (e) => upd({ name: e.target.value }) }),
      errP('name')),
    // Класс
    h('div', { class: 'field' },
      h('label', { for: 'f-class' }, t('fClass')),
      h('select', { id: 'f-class', 'aria-invalid': errs.cls ? 'true' : null, 'aria-describedby': errs.cls ? 'err-cls' : null,
        onchange: (e) => upd({ cls: e.target.value }) },
        h('option', { value: '' }, t('fClassPick')),
        CLASSES.map((c) => h('option', { value: c, selected: d.cls === c }, c))),
      errP('cls')),
    // Интересы
    h('fieldset', { class: 'field', 'aria-describedby': errs.interests ? 'err-interests' : 'hint-int' },
      h('legend', {}, t('fInterests')),
      h('span', { class: 'hint', id: 'hint-int' }, t('fInterestsHint')),
      h('div', { class: 'check-grid' }, Object.entries(INTERESTS).map(([key, name]) =>
        h('label', { class: 'check-chip' },
          h('input', { type: 'checkbox', id: 'i-' + key, value: key, checked: d.interests.includes(key),
            onchange: (e) => {
              const set = new Set(state.draft.interests);
              if (e.target.checked) set.add(key); else set.delete(key);
              upd({ interests: [...set] });
            } }),
          h('span', {}, name[L()])))),
      errP('interests')),
    // Интернат
    h('label', { class: 'dk' },
      h('input', { type: 'checkbox', id: 'f-dorm', checked: d.dorm, onchange: (e) => upd({ dorm: e.target.checked }) }),
      t('fDorm')),
    // Сон
    h('fieldset', { class: 'field' },
      h('legend', {}, t('fSleep')),
      h('div', { class: 'time-row' },
        h('label', { for: 'f-bed' }, t('fBed'),
          h('input', { id: 'f-bed', type: 'time', value: d.bed, onchange: (e) => { upd({ bed: e.target.value }); render(); } })),
        h('label', { for: 'f-wake' }, t('fWake'),
          h('input', { id: 'f-wake', type: 'time', value: d.wake, onchange: (e) => { upd({ wake: e.target.value }); render(); } }))),
      warn ? h('p', { class: 'field-warn', role: 'status' }, svg(ICONS.review), tf('wSleep', { h: warn.hours })) : null,
      errP('sleep')),
    h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn btn-primary', id: 'save-profile' }, t('saveProfile')))
  );

  return h('section', { class: 'panel', 'aria-labelledby': 'reg-h' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'reg-h' }, t('regTitle')), h('p', {}, t('regIntro'))),
    state.regErrors.length ? h('div', { class: 'error-summary', role: 'alert', id: 'reg-summary', tabindex: '-1' },
      h('h3', {}, svg(ICONS.attention), t('regErrors')),
      h('ul', {}, state.regErrors.map((e) => h('li', {}, t(e.code))))) : null,
    h('div', { class: 'box' }, form));
}

function onRegister(ev) {
  ev.preventDefault();
  const p = Object.assign({}, state.draft, { name: state.draft.name.trim(), lang: L() });
  const { errors } = validateProfile(p);
  state.regErrors = errors;
  if (errors.length) {
    render();
    const box = document.getElementById('reg-summary');
    if (box) { box.scrollIntoView({ block: 'start' }); box.focus({ preventScroll: true }); }
    return;
  }
  state.profile = p;
  go('home');
}

// ---------------------------------------------------------------------
// ГЛАВНАЯ
// ---------------------------------------------------------------------
function sectionStatus(id) {
  const r = state.testResult;
  switch (id) {
    case 'diag': return r ? { done: true, text: t('stDone') + ': ' + r.totalCorrect + ' / ' + r.totalQuestions } : { done: false, text: t('stNotStarted') };
    case 'faq': return { done: state.asked.length > 0, text: t('stQuestions') + ': ' + state.asked.length };
    case 'route': return { done: state.routeSeen, text: state.routeSeen ? t('stDone') : t('stNotStarted') };
    case 'clubs': return { done: state.activities.length > 0, text: tf('stClubsChosen', { n: state.activities.length }) };
    case 'mentor': {
      const m = MENTORS.find((x) => x.id === state.mentorId);
      return { done: !!m, text: m ? m.name : t('stMentorNone') };
    }
    case 'plan': return r ? { done: false, text: t('summaryItems') + ': ' + currentWeekPlan().taskCount } : { done: false, text: t('stLocked') };
  }
}

function renderHome() {
  const p = state.profile;
  const next = SECTIONS.find((s) => s.id !== 'plan' && !sectionStatus(s.id).done) || SECTIONS[5];
  return h('section', { class: 'panel', 'aria-labelledby': 'home-h' },
    h('div', { class: 'panel-head' },
      h('h2', { id: 'home-h', class: 'hello' }, tf('hello', { name: p.name })),
      h('p', {}, tf('helloSub', { cls: p.cls })),
      h('button', { type: 'button', class: 'link-btn', onclick: () => { state.draft = Object.assign({}, p); go('register'); } }, t('editProfile'))),
    h('div', { class: 'home-grid' },
    renderMyDay(),
    h('ol', { class: 'sections' }, SECTIONS.map((s, i) => {
      const st = sectionStatus(s.id);
      const isNext = s.id === next.id;
      return h('li', { class: 'section-row' + (isNext ? ' is-next' : '') },
        h('span', { class: 'sec-num' }, String(i + 1)),
        h('div', { class: 'sec-body' },
          h('span', { class: 'sec-name' }, t(s.label)),
          h('span', { class: 'sec-state' }, st.done ? chip('closed', st.text) : st.text),
          isNext ? h('span', { class: 'next-tag' }, t('next')) : null),
        h('button', { type: 'button', class: 'btn ' + (isNext ? 'btn-primary' : 'btn-secondary'), onclick: () => go(s.id) }, t('open')));
    })))
  );
}

// «Твой день»: сразу после регистрации показываем уроки, кабинеты и
// учителей по классу ученика, без ручного ввода расписания
function renderMyDay() {
  const now = new Date();
  const day = nextSchoolDay(now);
  const dow = weekday(day);
  const route = buildRoute(state.profile.cls, dow);
  const isToday = day.getDate() === now.getDate();
  const dayName = DAY_NAMES[L()][dow] + ', ' + fmtDate(day);
  return h('section', { class: 'box stack my-day', 'aria-labelledby': 'myday-h' },
    h('h3', { id: 'myday-h' }, tf(isToday ? 'myDayToday' : 'myDayNext', { day: dayName })),
    h('p', { class: 'muted small flush' }, t('myDayIntro')),
    h('p', { class: 'flush' }, h('b', {}, t('curator') + ': '), CURATORS[state.profile.cls]),
    h('div', { class: 'table-scroll' }, h('table', { class: 'day-table' },
      h('thead', {}, h('tr', {}, h('th', {}, t('timeCol')), h('th', {}, t('tLessons')), h('th', {}, t('roomCol')), h('th', {}, t('teacher')))),
      h('tbody', {}, route.steps.map((s) => h('tr', {},
        h('td', { class: 'mono' }, s.start),
        h('td', {}, SUBJECTS[s.subject][L()]),
        h('td', { class: 'mono' }, (s.gym ? (L() === 'kz' ? 'Спорт зал' : s.room) : s.room) + ' · ' + s.floor),
        h('td', {}, s.teacher)))))),
    h('button', { type: 'button', class: 'link-btn', onclick: () => go('route') }, t('fullRoute')));
}

// ---------------------------------------------------------------------
// 1. ДИАГНОСТИКА
// ---------------------------------------------------------------------
function answeredCount() {
  return QUESTIONS.filter((q) => {
    const a = state.answers[q.id];
    return a && (a.dontKnow || (typeof a.value === 'string' && a.value.trim() !== ''));
  }).length;
}

function renderTest() {
  if (state.testResult) return renderTestResult();
  const errorsById = {};
  for (const e of state.testErrors) errorsById[e.id] = e.code;

  const panel = h('section', { class: 'panel', 'aria-labelledby': 'test-h' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'test-h' }, t('testTitle')), h('p', {}, t('testIntro'))));

  if (state.testErrors.length) {
    panel.append(h('div', { class: 'error-summary', role: 'alert', id: 'error-summary', tabindex: '-1' },
      h('h3', {}, svg(ICONS.attention), t('errSummary')),
      h('ul', {}, state.testErrors.map((e) => {
        const n = QUESTIONS.findIndex((q) => q.id === e.id) + 1;
        return h('li', {}, h('a', { href: '#' + e.id }, t('question') + ' ' + n),
          ': ' + (e.code === 'empty' ? t('errEmpty') : t('errNotNumber')));
      }))));
  }

  const done = answeredCount();
  panel.append(h('div', { class: 'progress' },
    h('div', { class: 'progress-label' }, h('span', {}, t('answered')), h('b', { id: 'progress-count' }, done + ' / ' + QUESTIONS.length)),
    h('div', { class: 'bar' }, h('span', { id: 'progress-bar', style: 'width:' + (done / QUESTIONS.length * 100) + '%' }))));

  const list = h('ol', { class: 'qlist' });
  QUESTIONS.forEach((q, i) => list.append(renderQuestion(q, i, errorsById[q.id])));
  panel.append(h('form', { novalidate: true, onsubmit: onTestSubmit }, list,
    h('div', { class: 'btn-row', style: 'margin-top:24px' },
      h('button', { type: 'submit', class: 'btn btn-primary', id: 'check-btn' }, t('checkAnswers')))));
  return panel;
}

function renderQuestion(q, i, errCode) {
  const a = state.answers[q.id] || {};
  const dk = !!a.dontKnow;
  const errId = q.id + '-err';
  const li = h('li', { class: 'q', id: q.id, 'data-invalid': errCode ? 'true' : null },
    h('div', { class: 'q-meta' },
      h('span', { class: 'num' }, t('question') + ' ' + (i + 1) + ' ' + t('of') + ' ' + QUESTIONS.length),
      h('span', {}, TOPICS[q.topic].name[L()])),
    h('p', { class: 'q-text', id: q.id + '-text' }, q.text[L()]));

  if (q.type === 'choice') {
    li.append(h('fieldset', { class: 'options', 'aria-labelledby': q.id + '-text', 'aria-describedby': errCode ? errId : null },
      q.options[L()].map((opt, k) => h('label', { class: 'opt' },
        h('input', { type: 'radio', name: q.id, value: String(k), id: q.id + '-o' + k,
          checked: a.value === String(k), disabled: dk, onchange: () => setAnswer(q.id, { value: String(k) }) }),
        h('span', {}, opt)))));
  } else {
    li.append(h('input', {
      class: 'num-input', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      id: q.id + '-input', 'aria-labelledby': q.id + '-text', placeholder: t('numberPlaceholder'),
      value: a.value || '', disabled: dk,
      'aria-invalid': errCode ? 'true' : null, 'aria-describedby': errCode ? errId : null,
      oninput: (ev) => setAnswer(q.id, { value: ev.target.value })
    }));
  }

  li.append(h('label', { class: 'dk' },
    h('input', { type: 'checkbox', id: q.id + '-dk', checked: dk, onchange: (ev) => {
      setAnswer(q.id, ev.target.checked ? { dontKnow: true } : {});
      const fresh = renderQuestion(q, i, null); // перерисовываем только этот вопрос
      li.replaceWith(fresh);
      fresh.querySelector('#' + q.id + '-dk').focus();
    } }),
    t('dontKnow')));

  if (errCode) {
    li.append(h('p', { class: 'field-error', id: errId }, svg(ICONS.attention),
      errCode === 'empty' ? t('errEmpty') : t('errNotNumber')));
  }
  return li;
}

function setAnswer(id, answer) {
  state.answers[id] = answer;
  saveState();
  const done = answeredCount();
  const count = document.getElementById('progress-count');
  const bar = document.getElementById('progress-bar');
  if (count) count.textContent = done + ' / ' + QUESTIONS.length;
  if (bar) bar.style.width = (done / QUESTIONS.length * 100) + '%';
}

function onTestSubmit(ev) {
  ev.preventDefault();
  state.testErrors = validateAnswers(state.answers);   // 1) валидация
  if (state.testErrors.length) {
    render();
    const box = document.getElementById('error-summary');
    if (box) { box.scrollIntoView({ block: 'start' }); box.focus({ preventScroll: true }); }
    return;
  }
  state.testResult = gradeTest(state.answers);          // 2) подсчёт по подтемам
  saveState();
  render();
  window.scrollTo({ top: 0 });
}

function renderTestResult() {
  const r = state.testResult;
  const rows = Object.entries(r.topics).map(([key, tp]) => h('tr', {},
    h('td', {}, TOPICS[key].name[L()]),
    h('td', { class: 'score' }, tp.correct + ' / ' + tp.total),
    h('td', {}, chip(tp.status))));

  const review = h('ul', { class: 'review-list' }, r.details.map((d, i) => {
    const q = QUESTIONS.find((x) => x.id === d.id);
    const your = d.dontKnow ? t('notKnown') : q.type === 'choice' ? q.options[L()][Number(d.value)] : d.value;
    const right = q.type === 'choice' ? q.options[L()][q.answerIndex] : String(q.answer);
    return h('li', {},
      h('span', { class: 'mark ' + (d.correct ? 'ok' : 'no'), 'aria-label': d.correct ? '+' : '−' }, d.correct ? '✓' : '✗'),
      h('div', {}, h('div', {}, (i + 1) + '. ' + q.text[L()]),
        h('div', { class: 'muted small' }, t('yourAnswer') + ': ' + your + (d.correct ? '' : '  ·  ' + t('correctAnswer') + ': ' + right))));
  }));

  return h('section', { class: 'panel', 'aria-labelledby': 'res-h' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'res-h' }, t('resultTitle'))),
    h('div', { class: 'box stack' },
      h('div', { class: 'big-score' }, h('b', {}, r.totalCorrect + ' / ' + r.totalQuestions),
        h('span', { class: 'muted' }, t('resultScore') + ', ' + r.percent + '%')),
      h('div', { class: 'table-scroll' }, h('table', { class: 'topic-table' },
        h('thead', {}, h('tr', {}, h('th', {}, t('summaryTopics')), h('th', {}, t('resultScore')), h('th', {}, ''))),
        h('tbody', {}, rows)))),
    h('details', { class: 'box review' }, h('summary', {}, t('reviewTitle')), review),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('faq') }, t('goFaq')),
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => {
        state.testResult = null; state.answers = {}; state.testErrors = []; saveState(); render();
      } }, t('retakeTest'))));
}

// ---------------------------------------------------------------------
// 2. FAQ-ПОМОЩНИК
// ---------------------------------------------------------------------
function askQuestion(text) {
  const result = searchFaq(text);
  if (result.error) {
    state.faqError = result.error;
    state.lastQuery = '';
  } else {
    state.faqError = null;
    state.lastQuery = text.trim();
    state.asked.push({ text: text.trim(), entryId: result.found ? result.best.entry.id : null });
  }
  saveState();
  render();
  const target = document.getElementById(state.faqError ? 'faq-input' : 'answer-box');
  if (target) target.focus();
}
const FAQ_ERR = { empty: 'errQEmpty', tooShort: 'errQShort', tooLong: 'errQLong', noWords: 'errQNoWords' };

function renderFaq() {
  const input = h('input', { id: 'faq-input', type: 'text', maxlength: '400', autocomplete: 'off',
    placeholder: t('faqPlaceholder'), 'aria-invalid': state.faqError ? 'true' : null,
    'aria-describedby': state.faqError ? 'faq-err' : null });

  const form = h('form', { class: 'ask-form', novalidate: true, onsubmit: (ev) => { ev.preventDefault(); askQuestion(input.value); } },
    h('label', { for: 'faq-input' }, t('faqLabel')),
    h('div', { class: 'ask-row' }, input, h('button', { type: 'submit', class: 'btn btn-primary', id: 'ask-btn' }, t('ask'))),
    state.faqError ? h('p', { class: 'field-error', id: 'faq-err', role: 'alert' }, svg(ICONS.attention), t(FAQ_ERR[state.faqError])) : null,
    h('div', { class: 'examples' }, h('span', {}, t('examples') + ':'),
      FAQ_EXAMPLES[L()].map((ex) => h('button', { type: 'button', class: 'pill-btn', onclick: () => askQuestion(ex) }, ex))));

  // На широком экране: слева вопрос и ответ, справа история вопросов
  const main = h('div', { class: 'faq-main' }, h('div', { class: 'box' }, form));
  if (state.lastQuery) main.append(renderAnswer(state.lastQuery));
  const grid = h('div', { class: 'faq-grid' }, main);
  const panel = h('section', { class: 'panel', 'aria-labelledby': 'faq-h' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'faq-h' }, t('faqTitle')), h('p', {}, t('faqIntro'))),
    grid);

  grid.append(h('div', { class: 'box stack faq-history' },
    h('h3', {}, t('history') + ' (' + state.asked.length + ')'),
    state.asked.length === 0 ? h('p', { class: 'muted flush' }, t('historyEmpty')) :
      h('ul', { class: 'history' }, state.asked.map((q) => {
        const e = FAQ.find((x) => x.id === q.entryId);
        return h('li', {}, h('span', {}, '«' + q.text + '»'), h('span', { class: 'res' }, '→ ' + (e ? e.q[L()] : t('noAnswer'))));
      }))));
  panel.append(h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('route') }, t('secRoute'))));
  return panel;
}

function renderAnswer(query) {
  const r = searchFaq(query);
  if (!r.found) {
    return h('div', { class: 'box nomatch answer', id: 'answer-box', tabindex: '-1', role: 'status' },
      h('p', { class: 'q-asked' }, '«' + query + '»'),
      h('h3', {}, t('noMatchTitle')),
      h('p', { class: 'body' }, t('noMatchText')),
      h('p', { class: 'body small muted' }, t('noMatchTopics') + ': ' + Object.values(FAQ_TOPICS).map((x) => x[L()]).join(', ') + '.'));
  }
  const e = r.best.entry;
  const box = h('div', { class: 'box answer', id: 'answer-box', tabindex: '-1', role: 'status' },
    h('p', { class: 'q-asked' }, '«' + query + '»'),
    h('h3', {}, e.q[L()]),
    h('p', { class: 'body' }, e.a[L()]),
    h('div', { class: 'why' }, h('b', {}, t('matched')),
      h('span', {}, t('matchedWords') + ': ', r.best.matchedWords.map((w, i) => [i ? ' ' : '', h('span', { class: 'kw' }, w)])),
      h('span', { class: 'muted small' }, t('source') + ' · ' + FAQ_TOPICS[e.topic][L()])));
  if (r.others.length) {
    box.append(h('div', { class: 'examples' }, h('span', {}, t('similar') + ':'),
      r.others.map((o) => h('button', { type: 'button', class: 'pill-btn', onclick: () => askQuestion(o.entry.q[L()]) }, o.entry.q[L()]))));
  }
  return box;
}

// ---------------------------------------------------------------------
// 3. РАСПИСАНИЕ И МАРШРУТ
// ---------------------------------------------------------------------
function renderRoute() {
  const todayDow = weekday(new Date());
  if (state.routeDay === null) state.routeDay = todayDow <= 4 ? todayDow : 0;
  const day = state.routeDay;
  const route = buildRoute(state.profile.cls, day);

  const moveText = (s) => {
    if (s.first) {
      return t('rFromEntrance') + (s.floorsDiff ? ': ' + tf(s.move === 'up' ? 'rUp' : 'rDown', { n: s.floorsDiff }) : '');
    }
    if (s.move === 'sameRoom') return t('rSameRoom');
    if (s.move === 'same') return t('rSame');
    return tf(s.move === 'up' ? 'rUp' : 'rDown', { n: s.floorsDiff });
  };

  return h('section', { class: 'panel', 'aria-labelledby': 'route-h' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'route-h' }, t('routeTitle') + ' · ' + state.profile.cls), h('p', {}, t('routeIntro'))),
    h('div', { class: 'seg', role: 'group', 'aria-label': t('routeDay') },
      [0, 1, 2, 3, 4].map((d) => h('button', { type: 'button', 'aria-pressed': String(d === day),
        onclick: () => { state.routeDay = d; saveState(); render(); } }, DAY_SHORT[L()][d]))),
    h('div', { class: 'box stack' },
      h('h3', {}, DAY_NAMES[L()][day]),
      h('p', { class: 'muted flush' }, tf('rSummary', { lessons: route.steps.length, floors: route.floors, far: route.far }) + ' · ' + tf('lessonsEnd', { t: route.endsAt })),
      h('ol', { class: 'route' }, route.steps.map((s) => h('li', { class: 'route-step' },
        h('span', { class: 'r-time' }, s.start),
        h('div', { class: 'r-body' },
          h('span', { class: 'r-subj' }, SUBJECTS[s.subject][L()]),
          h('span', { class: 'r-room' }, (s.gym && L() === 'kz' ? 'Спорт зал' : s.room) + ' · ' + tf('rFloor', { n: s.floor })),
          h('span', { class: 'r-teacher' }, s.teacher),
          h('span', { class: 'r-move' }, moveText(s))),
        h('div', { class: 'r-flags' },
          s.far ? chip('attention', t('rFar')) : null,
          s.gym ? chip('review', t('rGym')) : null,
          !s.far && !s.gym && !s.first ? chip('closed', t('rOk')) : null))))),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('clubs') }, t('secClubs'))));
}

// ---------------------------------------------------------------------
// 4. КЛУБЫ И ОЛИМПИАДЫ
// ---------------------------------------------------------------------
function toggleActivity(id) {
  if (state.activities.includes(id)) {
    state.activities = state.activities.filter((x) => x !== id);
    state.clubMsg = null;
  } else {
    const problem = checkActivityAdd(state.activities, id);   // лимит и пересечения
    if (problem) {
      state.clubMsg = { id, problem };
    } else {
      state.activities.push(id);
      state.clubMsg = null;
    }
  }
  saveState();
  render();
  const btn = document.getElementById('act-' + id);
  if (btn) btn.focus();
}

function activityCard(rec) {
  const a = rec.activity;
  const on = state.activities.includes(a.id);
  const deadline = fmtDate(addDays(new Date(), a.deadlineDays));
  const msg = state.clubMsg && state.clubMsg.id === a.id ? state.clubMsg.problem : null;
  let msgText = null;
  if (msg) {
    msgText = msg.code === 'eClash'
      ? tf('eClash', { other: msg.other.name[L()], day: DAY_SHORT[L()][msg.other.day], time: msg.other.start + '–' + msg.other.end })
      : t(msg.code);
  }
  return h('li', { class: 'act' + (on ? ' is-on' : '') },
    h('div', { class: 'act-body' },
      h('span', { class: 'act-kind' }, a.kind === 'club' ? t('kindClub') : t('kindOlymp')),
      h('span', { class: 'act-name' }, a.name[L()]),
      a.kind === 'club' ? h('span', { class: 'muted small' }, DAY_NAMES[L()][a.day] + ', ' + a.start + '–' + a.end) : null,
      h('span', { class: 'small' }, tf('registerBy', { date: deadline, n: a.deadlineDays })),
      rec.matched.length ? h('span', { class: 'small' }, t('why') + ': ', rec.matched.map((m, i) => [i ? ' ' : '', h('span', { class: 'kw' }, INTERESTS[m][L()])])) : null,
      msgText ? h('p', { class: 'field-error', role: 'alert' }, svg(ICONS.attention), msgText) : null),
    h('div', { class: 'act-side' },
      on ? chip('closed', t('added')) : null,
      h('button', { type: 'button', id: 'act-' + a.id, class: 'btn ' + (on ? 'btn-secondary' : 'btn-primary'),
        onclick: () => toggleActivity(a.id) }, on ? t('remove') : t('add'))));
}

function renderClubs() {
  const recs = recommendClubs(state.profile.interests);
  const good = recs.filter((r) => r.score > 0);
  const rest = recs.filter((r) => r.score === 0);
  return h('section', { class: 'panel', 'aria-labelledby': 'clubs-h' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'clubs-h' }, t('clubsTitle')), h('p', {}, t('clubsIntro'))),
    h('div', { class: 'group' },
      h('h3', {}, t('recommended') + ' (' + good.length + ')'),
      good.length ? h('ul', { class: 'acts' }, good.map(activityCard)) : h('p', { class: 'box flush' }, t('noRecommend'))),
    rest.length ? h('details', { class: 'box', open: state.openOthers,
      ontoggle: (e) => { state.openOthers = e.target.open; } }, h('summary', {}, t('others') + ' (' + rest.length + ')'),
      h('ul', { class: 'acts', style: 'margin-top:12px' }, rest.map(activityCard))) : null,
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('mentor') }, t('secMentor'))));
}

// ---------------------------------------------------------------------
// 5. МЕНТОР
// ---------------------------------------------------------------------
function mentorReasons(r) {
  const out = [];
  if (r.common.length) out.push(tf('mReasonInterest', { list: r.common.map((i) => INTERESTS[i][L()]).join(', ') }));
  if (r.helps.length) out.push(tf('mReasonTopic', { list: r.helps.map((k) => TOPICS[k].name[L()]).join(', ') }));
  if (r.dorm) out.push(t('mReasonDorm'));
  if (r.lang) out.push(t('mReasonLang'));
  return out;
}

function mentorCard(r, big) {
  const m = r.mentor;
  const chosen = state.mentorId === m.id;
  return h('li', { class: 'mentor' + (big ? ' mentor-big' : '') },
    h('div', { class: 'mentor-avatar', 'aria-hidden': 'true' }, m.name[0]),
    h('div', { class: 'act-body' },
      h('span', { class: 'act-name' }, m.name + ', ' + tf('mGrade', { n: m.grade })),
      h('span', { class: 'small mono' }, tf('mScore', { n: r.score })),
      h('ul', { class: 'reasons' }, mentorReasons(r).map((x) => h('li', {}, x))),
      h('span', { class: 'muted small' }, tf('mDay', { day: DAY_NAMES[L()][m.day] }))),
    h('div', { class: 'act-side' },
      chosen ? chip('closed', t('mentorChosen')) :
        h('button', { type: 'button', class: 'btn ' + (big ? 'btn-primary' : 'btn-secondary'), id: 'mentor-' + m.id,
          onclick: () => { state.mentorId = m.id; saveState(); render(); } }, t('chooseMentor'))));
}

function renderMentor() {
  const list = matchMentors(state.profile, state.testResult);
  return h('section', { class: 'panel', 'aria-labelledby': 'mentor-h' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'mentor-h' }, t('mentorTitle')), h('p', {}, t('mentorIntro'))),
    state.testResult ? null : h('p', { class: 'box nomatch flush', role: 'status' }, t('mNeedDiag')),
    h('div', { class: 'group' }, h('h3', {}, t('mentorBest')), h('ul', { class: 'acts' }, mentorCard(list[0], true))),
    h('details', { class: 'box', open: state.openMentors,
      ontoggle: (e) => { state.openMentors = e.target.open; } }, h('summary', {}, t('mentorOthers') + ' (' + (list.length - 1) + ')'),
      h('ul', { class: 'acts', style: 'margin-top:12px' }, list.slice(1).map((r) => mentorCard(r, false)))),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('plan') }, t('secPlan'))));
}

// ---------------------------------------------------------------------
// 6. МОЙ ПЛАН: приоритеты + неделя по часам
// ---------------------------------------------------------------------
function currentWeekPlan() {
  return buildWeekPlan({
    profile: Object.assign({}, state.profile, { lang: L() }),
    testResult: state.testResult, asked: state.asked,
    activities: state.activities, mentorId: state.mentorId, today: new Date()
  });
}

const TAG = { lessons: 'tLessons', rest: 'tRest', homework: 'tHomework', study: 'tagStudy', school: 'tagSchool',
  faq: 'tagFaq', club: 'tagClub', mentor: 'tagMentor', winddown: 'tWindTag', sleep: 'tSleep' };

function renderPlan() {
  const head = h('div', { class: 'panel-head' }, h('h2', { id: 'plan-h' }, t('planTitle')));
  const prio = buildPlan(state.testResult, state.asked, L());
  if (prio.error === 'noTest') {
    return h('section', { class: 'panel', 'aria-labelledby': 'plan-h' }, head,
      h('div', { class: 'box nomatch stack', role: 'status' },
        h('p', { class: 'flush' }, t('planNoTest')),
        h('div', {}, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('diag') }, t('goTest')))));
  }
  head.append(h('p', {}, t('planWeekIntro')));
  const week = currentWeekPlan();
  const r = state.testResult;
  const panel = h('section', { class: 'panel', 'aria-labelledby': 'plan-h' }, head);

  // Сводка
  panel.append(h('div', { class: 'box plan-summary' },
    h('div', { class: 'chips' }, Object.entries(r.topics).map(([k, tp]) =>
      h('span', { class: 'chip-pair' }, h('span', { class: 'small' }, TOPICS[k].name[L()] + ':'), chip(tp.status)))),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('span', { class: 'label' }, t('summaryTopics')), h('span', { class: 'value' }, r.totalCorrect + ' / ' + r.totalQuestions)),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, t('stQuestions')), h('span', { class: 'value' }, String(state.asked.length))),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, t('summaryItems')), h('span', { class: 'value' }, String(week.taskCount))))));

  // Сон
  if (!week.sleep.ok) {
    panel.append(h('p', { class: 'field-warn box flush', role: 'status' }, svg(ICONS.review),
      tf('wSleepPlan', { h: week.sleep.hours, t: week.sleep.suggestBed })));
  }

  // Напоминания
  panel.append(h('div', { class: 'box stack reminders', role: 'status' },
    h('h3', {}, t('reminders')),
    week.reminders.length ? h('ul', { class: 'rem-list' }, week.reminders.map((x) =>
      h('li', {}, x.kind === 'today' ? chip('review', t('remToday')) : chip('attention', x.kind === 'sa' ? t('saDeadline') : t('reminders')), h('span', {}, x.text))))
      : h('p', { class: 'flush muted' }, t('remNone'))));

  // Неделя
  panel.append(h('h3', { class: 'week-h' }, t('planWeek')));
  panel.append(h('ol', { class: 'week' }, week.days.map((d) => h('li', { class: 'day' + (d.offset === 0 ? ' is-today' : '') },
    h('h4', {}, DAY_NAMES[L()][d.dow] + ', ' + fmtDate(d.date) + (d.offset === 0 ? ' · ' + t('today') : '')),
    h('ul', { class: 'slots' }, d.items.map((it) => h('li', { class: 'slot slot-' + it.kind },
      h('span', { class: 'slot-time' }, it.start + '–' + it.end),
      h('span', { class: 'slot-tag' }, t(TAG[it.kind])),
      h('span', { class: 'slot-title' }, it.title))))))));

  if (week.unscheduled.length) {
    panel.append(h('div', { class: 'box nomatch stack', role: 'alert' },
      h('h3', {}, t('unscheduled') + ' (' + week.unscheduled.length + ')'),
      h('ul', {}, week.unscheduled.map((x) => h('li', {}, x.title))),
      h('p', { class: 'flush small' }, t('unscheduledHint'))));
  }

  // Приоритеты (как и раньше)
  const srcText = { test: 'fromTest', faq: 'fromFaq', unanswered: 'fromUnanswered' };
  const pr = h('details', { class: 'box' }, h('summary', {}, t('priorities') + ' (' + prio.items.length + ')'));
  if (prio.items.length === 0) pr.append(h('p', {}, t('planEmptyAll')));
  for (const p of ['urgent', 'week', 'later']) {
    const group = prio.items.filter((i) => i.priority === p);
    if (!group.length) continue;
    pr.append(h('section', { class: 'group', style: 'margin-top:16px' },
      h('div', { class: 'group-head' }, prioIcon(p), h('h3', {}, t(PRIO_TEXT[p])), h('span', { class: 'count' }, '(' + group.length + ')')),
      h('ol', { class: 'items' }, group.map((item) => h('li', { class: 'item' },
        h('span', { class: 'item-src' }, t(srcText[item.source])),
        h('span', { class: 'item-title' }, item.title),
        item.detail ? h('p', { class: 'item-detail' }, item.detail) : null)))));
  }
  panel.append(pr);

  // Экспорт
  const toast = h('span', { class: 'toast', role: 'status' });
  const inArtifact = !!window.claude; // на claude.ai печать недоступна
  panel.append(h('div', { class: 'btn-row no-print' },
    h('button', { type: 'button', class: 'btn btn-primary', onclick: () => downloadPlan(prio, week, toast) }, t('download')),
    inArtifact ? null : h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => window.print() }, t('print')),
    h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => copyPlan(prio, week, toast) }, t('copy')),
    toast));
  return panel;
}

function planText(prio, week) {
  const lines = [planToText(prio, state.testResult, L(), new Date().toLocaleDateString('ru-RU')), '', t('planWeek').toUpperCase()];
  for (const d of week.days) {
    lines.push('', DAY_NAMES[L()][d.dow] + ', ' + fmtDate(d.date));
    for (const it of d.items) lines.push('  ' + it.start + '–' + it.end + '  ' + it.title);
  }
  return lines.join('\n');
}

async function downloadPlan(prio, week, toast) {
  const text = planText(prio, week);
  const filename = L() === 'kz' ? 'zhospar.txt' : 'plan.txt';
  if (window.claude) { // на claude.ai скачивание идёт через функцию площадки
    try {
      const downloads = await window.claude.use('downloads');
      if (downloads) { await downloads.save({ filename, data: text }); toast.className = 'toast'; toast.textContent = t('saved'); return; }
    } catch (e) { return; }
  }
  // Обычный браузер: создаём файл в памяти и «нажимаем» ссылку на него
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  toast.className = 'toast'; toast.textContent = t('saved');
}

async function copyPlan(prio, week, toast) {
  try {
    await navigator.clipboard.writeText(planText(prio, week));
    toast.className = 'toast'; toast.textContent = t('copied');
  } catch (e) {
    toast.className = 'toast err'; toast.textContent = t('copyFail');
  }
}

// ---------------------------------------------------------------------
// Шапка: язык и сброс
// ---------------------------------------------------------------------
for (const b of document.querySelectorAll('.lang button')) {
  b.addEventListener('click', () => {
    state.lang = b.dataset.lang;
    if (state.profile) state.profile.lang = state.lang;
    saveState(); render();
  });
}
document.getElementById('brand-btn').addEventListener('click', () => go(state.profile ? 'home' : 'welcome'));

document.getElementById('reset-btn').addEventListener('click', () => {
  const slot = document.getElementById('confirm-slot');
  if (slot.firstChild) return;
  slot.append(h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': t('reset') },
    h('span', {}, t('resetConfirm')),
    h('button', { type: 'button', class: 'btn btn-primary', id: 'reset-yes', onclick: () => {
      state = freshState(state.lang); saveState(); slot.replaceChildren(); render();
    } }, t('resetYes')),
    h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => slot.replaceChildren() }, t('resetNo'))));
  document.getElementById('reset-yes').focus();
});

loadState();
render();
