// =====================================================================
// app.js: работа с ЭКРАНОМ. Берёт ввод ученика, вызывает функции из
// logic.js и показывает результат. Сама ничего не «решает».
// =====================================================================

// ---------------------------------------------------------------------
// Состояние приложения: всё, что ученик сделал за сессию.
// Сохраняется в localStorage, чтобы не потерять при перезагрузке.
// ---------------------------------------------------------------------
const STORAGE_KEY = 'compass7-state';

let state = {
  lang: 'ru',
  step: 1,            // 1 диагностика, 2 помощник, 3 план
  answers: {},        // ответы теста: { q1: {value:'1'}, q5: {dontKnow:true} }
  testErrors: [],     // ошибки валидации теста
  testResult: null,   // результат gradeTest()
  asked: [],          // вопросы помощнику: [{ text, entryId }]
  lastQuery: '',      // последний вопрос (чтобы показать ответ)
  faqError: null      // код ошибки ввода вопроса
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') state = Object.assign(state, saved, { testErrors: [], faqError: null });
  } catch (e) { /* хранилище недоступно: работаем без сохранения */ }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* не критично */ }
}

// Текст интерфейса на выбранном языке
function t(key) { return UI[state.lang][key]; }

// ---------------------------------------------------------------------
// Помощник для создания элементов: h('p', {class:'x'}, 'текст').
// Текст ученика вставляем только как текст (textContent), не как HTML:
// так нельзя «сломать» страницу, написав в вопросе теги.
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

// Иконки статусов (нарисованы вручную, без внешних библиотек)
const ICONS = {
  closed: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M5.5 10.5l3 3 6-6.5" fill="none" stroke="var(--ok-bg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  review: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 2a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  attention: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l9 16H1z" fill="currentColor"/><path d="M10 7v5" stroke="var(--bad-bg)" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="14.8" r="1.2" fill="var(--bad-bg)"/></svg>'
};
const STATUS_TEXT = { closed: 'stClosed', review: 'stReview', attention: 'stAttention' };

function statusChip(status) {
  return h('span', { class: 'chip chip-' + status },
    h('span', { html: ICONS[status] }).firstChild, t(STATUS_TEXT[status]));
}

// Значок приоритета: 3 полоски (срочно), 2 (на неделе), 1 (позже)
function prioIcon(p) {
  return h('span', { class: 'prio prio-' + p, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
}
const PRIO_TEXT = { urgent: 'prUrgent', week: 'prWeek', later: 'prLater' };

// =====================================================================
// ОТРИСОВКА
// =====================================================================
function render() {
  document.documentElement.lang = state.lang === 'kz' ? 'kk' : 'ru';
  document.getElementById('app-name').textContent = t('appName');
  document.getElementById('app-sub').textContent = t('appSub');
  document.getElementById('reset-btn').textContent = t('reset');
  document.getElementById('footer-text').textContent = t('footer');
  document.getElementById('lang-group').setAttribute('aria-label', t('langLabel'));
  for (const b of document.querySelectorAll('.lang button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
  }
  renderSteps();
  const main = document.getElementById('main');
  main.replaceChildren(
    state.step === 1 ? renderTest() : state.step === 2 ? renderFaq() : renderPlan()
  );
}

function renderSteps() {
  const r = state.testResult;
  const plan = r ? buildPlan(r, state.asked, state.lang) : null;
  const info = [
    [t('step1'), r ? t('stDone') + ': ' + r.totalCorrect + ' ' + t('of') + ' ' + r.totalQuestions : t('stNotStarted')],
    [t('step2'), t('stQuestions') + ': ' + state.asked.length],
    [t('step3'), plan ? t('summaryItems') + ': ' + plan.items.length : t('stLocked')]
  ];
  const list = document.getElementById('steps');
  list.replaceChildren(...info.map(([name, st], i) =>
    h('li', {},
      h('button', {
        type: 'button',
        'aria-current': state.step === i + 1 ? 'step' : null,
        onclick: () => goStep(i + 1)
      },
        h('span', { class: 'step-num' }, (i + 1) + ' / 3'),
        h('span', { class: 'step-name' }, name),
        h('span', { class: 'step-state' }, st)
      )
    )
  ));
}

function goStep(n) {
  state.step = n;
  saveState();
  render();
  window.scrollTo({ top: 0 });
  document.getElementById('main').focus({ preventScroll: true });
}

// ---------------------------------------------------------------------
// ШАГ 1. ДИАГНОСТИКА
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
    h('div', { class: 'panel-head' },
      h('h2', { id: 'test-h' }, t('testTitle')),
      h('p', {}, t('testIntro'))
    )
  );

  // Сводка ошибок сверху (появляется только после неудачной проверки)
  if (state.testErrors.length) {
    panel.append(h('div', { class: 'error-summary', role: 'alert', id: 'error-summary', tabindex: '-1' },
      h('h3', {}, h('span', { html: ICONS.attention }).firstChild, t('errSummary')),
      h('ul', {}, state.testErrors.map((e) => {
        const n = QUESTIONS.findIndex((q) => q.id === e.id) + 1;
        return h('li', {}, h('a', { href: '#' + e.id }, t('question') + ' ' + n),
          ': ' + (e.code === 'empty' ? t('errEmpty') : t('errNotNumber')));
      }))
    ));
  }

  // Прогресс
  const done = answeredCount();
  const progress = h('div', { class: 'progress' },
    h('div', { class: 'progress-label' },
      h('span', {}, t('answered')), h('b', { id: 'progress-count' }, done + ' / ' + QUESTIONS.length)),
    h('div', { class: 'bar' }, h('span', { id: 'progress-bar', style: 'width:' + (done / QUESTIONS.length * 100) + '%' }))
  );
  panel.append(progress);

  const form = h('form', { novalidate: true, onsubmit: onTestSubmit });
  const list = h('ol', { class: 'qlist' });
  QUESTIONS.forEach((q, i) => list.append(renderQuestion(q, i, errorsById[q.id])));
  form.append(list, h('div', { class: 'btn-row', style: 'margin-top:24px' },
    h('button', { type: 'submit', class: 'btn btn-primary', id: 'check-btn' }, t('checkAnswers'))));
  panel.append(form);
  return panel;
}

function renderQuestion(q, i, errCode) {
  const a = state.answers[q.id] || {};
  const dk = !!a.dontKnow;
  const errId = q.id + '-err';
  const li = h('li', { class: 'q', id: q.id, 'data-invalid': errCode ? 'true' : null },
    h('div', { class: 'q-meta' },
      h('span', { class: 'num' }, t('question') + ' ' + (i + 1) + ' ' + t('of') + ' ' + QUESTIONS.length),
      h('span', {}, TOPICS[q.topic].name[state.lang])
    ),
    h('p', { class: 'q-text', id: q.id + '-text' }, q.text[state.lang])
  );

  if (q.type === 'choice') {
    const fs = h('fieldset', { class: 'options', 'aria-labelledby': q.id + '-text', 'aria-describedby': errCode ? errId : null });
    q.options[state.lang].forEach((opt, k) => {
      fs.append(h('label', { class: 'opt' },
        h('input', {
          type: 'radio', name: q.id, value: String(k), id: q.id + '-o' + k,
          checked: a.value === String(k), disabled: dk,
          onchange: () => setAnswer(q.id, { value: String(k) })
        }),
        h('span', {}, opt)));
    });
    li.append(fs);
  } else {
    li.append(h('input', {
      class: 'num-input', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      id: q.id + '-input', 'aria-labelledby': q.id + '-text',
      placeholder: t('numberPlaceholder'), value: a.value || '', disabled: dk,
      'aria-invalid': errCode ? 'true' : null, 'aria-describedby': errCode ? errId : null,
      oninput: (ev) => setAnswer(q.id, { value: ev.target.value })
    }));
  }

  li.append(h('label', { class: 'dk' },
    h('input', {
      type: 'checkbox', id: q.id + '-dk', checked: dk,
      onchange: (ev) => {
        setAnswer(q.id, ev.target.checked ? { dontKnow: true } : {});
        // Переотрисовываем только этот вопрос (включить/выключить поле ввода)
        const fresh = renderQuestion(q, i, null);
        li.replaceWith(fresh);
        fresh.querySelector('#' + q.id + '-dk').focus();
      }
    }),
    t('dontKnow')));

  if (errCode) {
    li.append(h('p', { class: 'field-error', id: errId },
      h('span', { html: ICONS.attention }).firstChild,
      errCode === 'empty' ? t('errEmpty') : t('errNotNumber')));
  }
  return li;
}

// Сохраняем ответ и обновляем полосу прогресса (без перерисовки всей формы)
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
  // 1) Валидация: пустые ответы и «не числа»
  state.testErrors = validateAnswers(state.answers);
  if (state.testErrors.length) {
    render();
    const box = document.getElementById('error-summary');
    if (box) { box.scrollIntoView({ block: 'start' }); box.focus({ preventScroll: true }); }
    return;
  }
  // 2) Проверка и подсчёт по подтемам
  state.testResult = gradeTest(state.answers);
  saveState();
  render();
  window.scrollTo({ top: 0 });
}

function renderTestResult() {
  const r = state.testResult;
  const L = state.lang;

  const rows = Object.entries(r.topics).map(([key, tp]) =>
    h('tr', {},
      h('td', {}, TOPICS[key].name[L]),
      h('td', { class: 'score' }, tp.correct + ' / ' + tp.total),
      h('td', {}, statusChip(tp.status))
    ));

  const review = h('ul', { class: 'review-list' }, r.details.map((d, i) => {
    const q = QUESTIONS.find((x) => x.id === d.id);
    const your = d.dontKnow ? t('notKnown') : q.type === 'choice' ? q.options[L][Number(d.value)] : d.value;
    const right = q.type === 'choice' ? q.options[L][q.answerIndex] : String(q.answer);
    return h('li', {},
      h('span', { class: 'mark ' + (d.correct ? 'ok' : 'no'), 'aria-label': d.correct ? '+' : '−' }, d.correct ? '✓' : '✗'),
      h('div', {},
        h('div', {}, (i + 1) + '. ' + q.text[L]),
        h('div', { class: 'muted small' }, t('yourAnswer') + ': ' + your + (d.correct ? '' : '  ·  ' + t('correctAnswer') + ': ' + right))));
  }));

  return h('section', { class: 'panel', 'aria-labelledby': 'res-h' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'res-h' }, t('resultTitle'))),
    h('div', { class: 'box', style: 'display:grid;gap:16px' },
      h('div', { class: 'big-score' },
        h('b', {}, r.totalCorrect + ' / ' + r.totalQuestions),
        h('span', { class: 'muted' }, t('resultScore') + ', ' + r.percent + '%')),
      h('div', { class: 'table-scroll' },
        h('table', { class: 'topic-table' },
          h('thead', {}, h('tr', {}, h('th', {}, t('summaryTopics')), h('th', {}, t('resultScore')), h('th', {}, ''))),
          h('tbody', {}, rows)))
    ),
    h('details', { class: 'box review' }, h('summary', {}, t('reviewTitle')), review),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goStep(2) }, t('goFaq')),
      h('button', {
        type: 'button', class: 'btn btn-secondary',
        onclick: () => { state.testResult = null; state.answers = {}; state.testErrors = []; saveState(); render(); }
      }, t('retakeTest'))
    )
  );
}

// ---------------------------------------------------------------------
// ШАГ 2. FAQ-ПОМОЩНИК
// ---------------------------------------------------------------------
function askQuestion(text) {
  const result = searchFaq(text);
  if (result.error) {
    state.faqError = result.error;
    state.lastQuery = '';
  } else {
    state.faqError = null;
    state.lastQuery = text.trim();
    // Каждый вопрос сохраняем: он попадёт в персональный план
    state.asked.push({ text: text.trim(), entryId: result.found ? result.best.entry.id : null });
  }
  saveState();
  render();
  const target = document.getElementById(state.faqError ? 'faq-input' : 'answer-box');
  if (target) target.focus();
}

const FAQ_ERR = { empty: 'errQEmpty', tooShort: 'errQShort', tooLong: 'errQLong', noWords: 'errQNoWords' };

function renderFaq() {
  const L = state.lang;
  const errId = 'faq-err';
  const input = h('input', {
    id: 'faq-input', type: 'text', maxlength: '400', autocomplete: 'off',
    placeholder: t('faqPlaceholder'),
    'aria-invalid': state.faqError ? 'true' : null,
    'aria-describedby': state.faqError ? errId : null
  });

  const form = h('form', {
    class: 'ask-form', novalidate: true,
    onsubmit: (ev) => { ev.preventDefault(); askQuestion(input.value); }
  },
    h('label', { for: 'faq-input' }, t('faqLabel')),
    h('div', { class: 'ask-row' }, input, h('button', { type: 'submit', class: 'btn btn-primary', id: 'ask-btn' }, t('ask'))),
    state.faqError ? h('p', { class: 'field-error', id: errId, role: 'alert' },
      h('span', { html: ICONS.attention }).firstChild, t(FAQ_ERR[state.faqError])) : null,
    h('div', { class: 'examples' },
      h('span', {}, t('examples') + ':'),
      FAQ_EXAMPLES[L].map((ex) => h('button', { type: 'button', class: 'pill-btn', onclick: () => askQuestion(ex) }, ex)))
  );

  const panel = h('section', { class: 'panel', 'aria-labelledby': 'faq-h' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'faq-h' }, t('faqTitle')), h('p', {}, t('faqIntro'))),
    h('div', { class: 'box' }, form)
  );

  // Ответ на последний вопрос (пересчитываем поиск, поэтому он всегда на текущем языке)
  if (state.lastQuery) panel.append(renderAnswer(state.lastQuery));

  // История вопросов
  panel.append(h('div', { class: 'box', style: 'display:grid;gap:12px' },
    h('h3', {}, t('history') + ' (' + state.asked.length + ')'),
    state.asked.length === 0 ? h('p', { class: 'muted', style: 'margin:0' }, t('historyEmpty')) :
      h('ul', { class: 'history' }, state.asked.map((q) => {
        const e = FAQ.find((x) => x.id === q.entryId);
        return h('li', {}, h('span', {}, '«' + q.text + '»'),
          h('span', { class: 'res' }, e ? '→ ' + e.q[L] : '→ ' + t('noAnswer')));
      }))
  ));

  panel.append(h('div', { class: 'btn-row' },
    h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goStep(3) }, t('goPlan'))));
  return panel;
}

function renderAnswer(query) {
  const L = state.lang;
  const r = searchFaq(query);

  if (!r.found) {
    return h('div', { class: 'box nomatch answer', id: 'answer-box', tabindex: '-1', role: 'status' },
      h('p', { class: 'q-asked' }, '«' + query + '»'),
      h('h3', {}, t('noMatchTitle')),
      h('p', { class: 'body' }, t('noMatchText')),
      h('p', { class: 'body small muted' }, t('noMatchTopics') + ': ' + Object.values(FAQ_TOPICS).map((x) => x[L]).join(', ') + '.'));
  }

  const e = r.best.entry;
  const box = h('div', { class: 'box answer', id: 'answer-box', tabindex: '-1', role: 'status' },
    h('p', { class: 'q-asked' }, '«' + query + '»'),
    h('h3', {}, e.q[L]),
    h('p', { class: 'body' }, e.a[L]),
    h('div', { class: 'why' },
      h('b', {}, t('matched')),
      h('span', {}, t('matchedWords') + ': ', r.best.matchedWords.map((w, i) => [i ? ' ' : '', h('span', { class: 'kw' }, w)])),
      h('span', { class: 'muted small' }, t('source') + ' · ' + FAQ_TOPICS[e.topic][L]))
  );
  if (r.others.length) {
    box.append(h('div', { class: 'examples' },
      h('span', {}, t('similar') + ':'),
      r.others.map((o) => h('button', { type: 'button', class: 'pill-btn', onclick: () => askQuestion(o.entry.q[L]) }, o.entry.q[L]))));
  }
  return box;
}

// ---------------------------------------------------------------------
// ШАГ 3. ПЕРСОНАЛЬНЫЙ ПЛАН
// ---------------------------------------------------------------------
function renderPlan() {
  const L = state.lang;
  const head = h('div', { class: 'panel-head' }, h('h2', { id: 'plan-h' }, t('planTitle')));
  const plan = buildPlan(state.testResult, state.asked, L);

  // Ошибочная ситуация: план без диагностики не собрать
  if (plan.error === 'noTest') {
    return h('section', { class: 'panel', 'aria-labelledby': 'plan-h' }, head,
      h('div', { class: 'box nomatch', role: 'status', style: 'display:grid;gap:12px' },
        h('p', { style: 'margin:0' }, t('planNoTest')),
        h('div', {}, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goStep(1) }, t('goTest')))));
  }

  head.append(h('p', {}, t('planIntro')));
  const r = state.testResult;

  const summary = h('div', { class: 'box plan-summary' },
    h('div', { class: 'chips' }, Object.entries(r.topics).map(([k, tp]) =>
      h('span', { style: 'display:inline-flex;gap:6px;align-items:center' },
        h('span', { class: 'small' }, TOPICS[k].name[L] + ':'), statusChip(tp.status)))),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('span', { class: 'label' }, t('summaryTopics')), h('span', { class: 'value' }, r.totalCorrect + ' / ' + r.totalQuestions)),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, t('stQuestions')), h('span', { class: 'value' }, String(state.asked.length))),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, t('summaryItems')), h('span', { class: 'value' }, String(plan.items.length))))
  );

  const panel = h('section', { class: 'panel', 'aria-labelledby': 'plan-h' }, head, summary);

  if (plan.items.length === 0) {
    panel.append(h('div', { class: 'box', role: 'status' }, h('p', { style: 'margin:0' }, t('planEmptyAll'))));
  }

  const srcText = { test: 'fromTest', faq: 'fromFaq', unanswered: 'fromUnanswered' };
  for (const p of ['urgent', 'week', 'later']) {
    const group = plan.items.filter((i) => i.priority === p);
    if (!group.length) continue;
    panel.append(h('section', { class: 'group', 'aria-labelledby': 'g-' + p },
      h('div', { class: 'group-head' }, prioIcon(p), h('h3', { id: 'g-' + p }, t(PRIO_TEXT[p])), h('span', { class: 'count' }, '(' + group.length + ')')),
      h('ol', { class: 'items' }, group.map((item) =>
        h('li', { class: 'item' },
          h('span', { class: 'item-src' }, t(srcText[item.source])),
          h('span', { class: 'item-title' }, item.title),
          item.detail ? h('p', { class: 'item-detail' }, item.detail) : null)))
    ));
  }

  // Экспорт плана
  const toast = h('span', { class: 'toast', role: 'status', id: 'plan-toast' });
  const inArtifact = !!window.claude; // на claude.ai печать недоступна
  panel.append(h('div', { class: 'btn-row no-print' },
    h('button', { type: 'button', class: 'btn btn-primary', onclick: () => downloadPlan(plan, toast) }, t('download')),
    inArtifact ? null : h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => window.print() }, t('print')),
    h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => copyPlan(plan, toast) }, t('copy')),
    toast));
  return panel;
}

function planText(plan) {
  return planToText(plan, state.testResult, state.lang, new Date().toLocaleDateString('ru-RU'));
}

async function downloadPlan(plan, toast) {
  const text = planText(plan);
  const filename = state.lang === 'kz' ? 'zhospar.txt' : 'plan.txt';
  // На claude.ai скачивание идёт через специальную функцию площадки
  if (window.claude) {
    try {
      const downloads = await window.claude.use('downloads');
      if (downloads) {
        await downloads.save({ filename, data: text });
        toast.className = 'toast'; toast.textContent = t('saved');
        return;
      }
    } catch (e) { return; } // ученик отказался или функция недоступна
  }
  // Обычный браузер: создаём файл в памяти и «нажимаем» ссылку на него
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  toast.className = 'toast'; toast.textContent = t('saved');
}

async function copyPlan(plan, toast) {
  try {
    await navigator.clipboard.writeText(planText(plan));
    toast.className = 'toast'; toast.textContent = t('copied');
  } catch (e) {
    toast.className = 'toast err'; toast.textContent = t('copyFail');
  }
}

// ---------------------------------------------------------------------
// Шапка: язык и сброс
// ---------------------------------------------------------------------
for (const b of document.querySelectorAll('.lang button')) {
  b.addEventListener('click', () => { state.lang = b.dataset.lang; saveState(); render(); });
}

document.getElementById('reset-btn').addEventListener('click', () => {
  const slot = document.getElementById('confirm-slot');
  if (slot.firstChild) return;
  slot.append(h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': t('reset') },
    h('span', {}, t('resetConfirm')),
    h('button', {
      type: 'button', class: 'btn btn-primary', id: 'reset-yes',
      onclick: () => {
        const lang = state.lang;
        state = { lang, step: 1, answers: {}, testErrors: [], testResult: null, asked: [], lastQuery: '', faqError: null };
        saveState(); slot.replaceChildren(); render();
      }
    }, t('resetYes')),
    h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => slot.replaceChildren() }, t('resetNo'))));
  document.getElementById('reset-yes').focus();
});

// Старт
loadState();
render();
