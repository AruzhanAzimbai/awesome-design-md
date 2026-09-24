// Автотесты логики. Запуск:  node --test tests/
// Сначала кладём данные из data.js в глобальную область (как в браузере),
// потом подключаем logic.js.
const test = require('node:test');
const assert = require('node:assert');
Object.assign(globalThis, require('../data.js'));
const L = require('../logic.js');

// Ответы-заготовки: все верные
function allCorrect() {
  const a = {};
  for (const q of QUESTIONS) {
    a[q.id] = { value: q.type === 'choice' ? String(q.answerIndex) : String(q.answer) };
  }
  return a;
}

// ---- Тест 1 (обычный): ученик с пробелами в процентах и уравнениях ----
test('Т1 обычный: слабые подтемы определяются по ответам', () => {
  const a = allCorrect();
  a.q3 = { value: '32' };           // проценты: неверно
  a.q4 = { value: '0' };            // проценты: неверно
  a.q6 = { dontKnow: true };        // уравнения: не знаю
  assert.deepStrictEqual(L.validateAnswers(a), []);
  const r = L.gradeTest(a);
  assert.strictEqual(r.totalCorrect, 7);
  assert.strictEqual(r.topics.percent.status, 'attention');
  assert.strictEqual(r.topics.equations.status, 'review');
  assert.strictEqual(r.topics.fractions.status, 'closed');
});

// ---- Тест 2 (обычный): вопрос своими словами находит нужный ответ ----
test('Т2 обычный: FAQ находит ответ на свободный вопрос', () => {
  const r = L.searchFaq('Что будет если я пропустил SA по математике?');
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.best.entry.id, 'missed');
  const kz = L.searchFaq('Кабинетті қалай табамын?');
  assert.strictEqual(kz.best.entry.id, 'cabinet');
  const r3 = L.searchFaq('где смотреть расписание звонков');
  assert.strictEqual(r3.best.entry.id, 'schedule');
});

// ---- Тест 3 (граничный): все темы закрыты, вопросов нет; и «2,5»/«−3» ----
test('Т3 граничный: всё верно и нет вопросов, план пуст, но не ломается', () => {
  const r = L.gradeTest(allCorrect());
  assert.strictEqual(r.percent, 100);
  const plan = L.buildPlan(r, [], 'ru');
  assert.strictEqual(plan.items.length, 0);
  assert.strictEqual(plan.closedTopics.length, 5);
  assert.strictEqual(L.parseNumber(' 2,5 '), 2.5);
  assert.strictEqual(L.parseNumber('−3'), -3);
});

// ---- Тест 4 (ошибочный ввод) ----
test('Т4 ошибочный: пустые ответы, текст вместо числа, пустой/бессмысленный вопрос', () => {
  const a = allCorrect();
  delete a.q1;                    // пустой ответ
  a.q2 = { value: 'пятнадцать' }; // не число
  a.q5 = { value: '5x' };         // не число
  assert.deepStrictEqual(L.validateAnswers(a), [
    { id: 'q1', code: 'empty' },
    { id: 'q2', code: 'notNumber' },
    { id: 'q5', code: 'notNumber' }
  ]);
  assert.deepStrictEqual(L.searchFaq('   '), { error: 'empty' });
  assert.deepStrictEqual(L.searchFaq('??'), { error: 'tooShort' });
  assert.deepStrictEqual(L.searchFaq('а как?'), { error: 'noWords' });
  assert.strictEqual(L.searchFaq('ывапролджэ').found, false);
  assert.deepStrictEqual(L.buildPlan(null, [], 'ru'), { error: 'noTest' });
});

// ---- Дополнительно: план реально связывает тест и вопросы ----
test('План: слабые темы + вопросы + повышение приоритета + вопрос без ответа', () => {
  const a = allCorrect();
  a.q3 = { dontKnow: true };
  a.q4 = { dontKnow: true };
  a.q9 = { value: '700' };
  const r = L.gradeTest(a);
  const log = [
    { text: 'что такое FA', entryId: 'fa' },          // week
    { text: 'как считается оценка', entryId: 'grade' }, // urgent; 2 вопроса по оцениванию
    { text: 'какие клубы', entryId: 'clubs' },         // later
    { text: 'где парковка для велосипеда', entryId: null }
  ];
  const plan = L.buildPlan(r, log, 'ru');
  const pr = (pred) => plan.items.find(pred).priority;
  assert.strictEqual(pr((i) => i.topicKey === 'percent'), 'urgent');
  assert.strictEqual(pr((i) => i.topicKey === 'word'), 'week');
  assert.strictEqual(pr((i) => i.faqTopic === 'assessment' && i.title.includes('ФО')), 'urgent'); // week -> urgent
  assert.strictEqual(pr((i) => i.faqTopic === 'clubs'), 'later');
  assert.strictEqual(pr((i) => i.source === 'unanswered'), 'week');
  assert.strictEqual(plan.items[0].source, 'test'); // срочная учёба первой
  const txt = L.planToText(plan, r, 'ru', '24.09.2026');
  assert.match(txt, /СРОЧНО/);
});
