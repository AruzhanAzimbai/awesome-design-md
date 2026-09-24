// Автотесты «школьной» логики: регистрация, маршрут, клубы, ментор, планер.
// Запуск:  node --test tests/
const test = require('node:test');
const assert = require('node:assert');
Object.assign(globalThis, require('../data.js'));
Object.assign(globalThis, require('../data-school.js'));
Object.assign(globalThis, require('../logic.js'));
const S = require('../logic-school.js');

const PROFILE = { name: 'Айгерим', cls: '7B', interests: ['robotics', 'math', 'languages'], dorm: true, bed: '22:30', wake: '06:30', lang: 'ru' };
function answers(wrong) {
  const a = {};
  for (const q of QUESTIONS) a[q.id] = { value: q.type === 'choice' ? String(q.answerIndex) : String(q.answer) };
  return Object.assign(a, wrong);
}

test('Регистрация: пустая анкета даёт 4 понятные ошибки', () => {
  const r = S.validateProfile({ name: '', cls: '', interests: [], bed: '', wake: '' });
  assert.deepStrictEqual(r.errors.map((e) => e.code), ['eNameEmpty', 'eClass', 'eInterestsNone', 'eTimeEmpty']);
});

test('Регистрация: цифры в имени, 6 интересов, мало сна', () => {
  const r = S.validateProfile(Object.assign({}, PROFILE, { name: 'Ай123', interests: ['a', 'b', 'c', 'd', 'e', 'f'], bed: '02:00', wake: '06:00' }));
  assert.deepStrictEqual(r.errors.map((e) => e.code), ['eNameBad', 'eInterestsMany', 'eSleepTooShort']);
  const w = S.validateProfile(Object.assign({}, PROFILE, { bed: '23:30', wake: '06:30' }));
  assert.deepStrictEqual(w.errors, []);
  assert.strictEqual(w.warnings[0].hours, 7); // предупреждение, но не ошибка
});

test('Маршрут: считаются этажи и далёкие переходы', () => {
  const r = S.buildRoute('7B', 0);
  assert.strictEqual(r.steps.length, 7);
  assert.strictEqual(r.steps[2].subject, 'phys');
  assert.strictEqual(r.steps[2].far, true);          // 108 (1 эт.) -> 318 (3 эт.)
  assert.strictEqual(r.far, 3);
  assert.strictEqual(r.endsAt, '14:55');
  assert.deepStrictEqual(S.buildRoute('7B', 5).steps, []); // суббота
});

test('Клубы: лимит 2 кружка и пересечение по времени', () => {
  assert.strictEqual(S.checkActivityAdd([], 'robotics'), null);
  assert.strictEqual(S.checkActivityAdd(['robotics'], 'art').code, 'eClash');           // оба во вторник
  assert.strictEqual(S.checkActivityAdd(['robotics', 'python'], 'debate').code, 'eMaxClubs');
  assert.strictEqual(S.checkActivityAdd(['robotics', 'python'], 'olymp-math'), null);    // олимпиада не кружок
  const rec = S.recommendClubs(['sport']);
  assert.deepStrictEqual(rec.filter((r) => r.score > 0).map((r) => r.activity.id), ['football', 'volleyball']);
});

test('Ментор: учитываются интересы, слабые темы и интернат', () => {
  const tr = gradeTest(answers({ q5: { dontKnow: true }, q6: { dontKnow: true } })); // уравнения 0/2
  const best = S.matchMentors(PROFILE, tr)[0];
  assert.strictEqual(best.mentor.name, 'Алан');
  assert.deepStrictEqual(best.helps, ['equations']);
  assert.strictEqual(best.dorm, true);
  assert.strictEqual(best.score, 2 + 2 + 2 + 1);
});

test('Планер: задачи до дедлайнов, не позже чем за час до сна, повторение в разные дни', () => {
  const tr = gradeTest(answers({ q3: { dontKnow: true }, q4: { value: '0' }, q6: { value: '1' } }));
  const plan = S.buildWeekPlan({
    profile: PROFILE, testResult: tr,
    asked: [{ text: 'что такое сор', entryId: 'sa' }, { text: 'бассейн', entryId: null }],
    activities: ['robotics', 'olymp-math'], mentorId: 'm1', today: new Date(2026, 8, 24) // четверг
  });
  assert.strictEqual(plan.unscheduled.length, 0);
  const all = plan.days.flatMap((d) => d.items.map((i) => Object.assign({ day: d.offset }, i)));
  const sessions = all.filter((i) => i.title.startsWith('Проценты'));
  assert.strictEqual(sessions.length, 2);
  assert.notStrictEqual(sessions[0].day, sessions[1].day);         // разные дни
  for (const i of all.filter((x) => ['study', 'faq'].includes(x.kind))) {
    assert.ok(S.toMin(i.end) <= S.toMin('21:30'), i.title + ' после 21:30');
  }
  const reg = all.find((i) => i.title.includes('Робототехника') && i.kind === 'school');
  assert.ok(reg.day <= 4);                                          // запись до дедлайна
  const mentor = plan.days.find((d) => d.items.some((i) => i.kind === 'mentor'));
  assert.strictEqual(mentor.clubs.length, 0);                        // не в день кружка
  assert.ok(plan.reminders.some((r) => r.kind === 'sa'));
});

test('Планер: при коротком сне предлагает время отбоя', () => {
  const tr = gradeTest(answers({}));
  const plan = S.buildWeekPlan({ profile: Object.assign({}, PROFILE, { bed: '23:30' }), testResult: tr, asked: [], activities: [], mentorId: null, today: new Date(2026, 8, 24) });
  assert.strictEqual(plan.sleep.ok, false);
  assert.strictEqual(plan.sleep.suggestBed, '22:30');
});
