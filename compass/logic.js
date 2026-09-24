// =====================================================================
// logic.js: вся ЛОГИКА приложения. Здесь нет работы с экраном (DOM),
// только «чистые» функции: получили данные, вернули результат.
// Поэтому эти функции можно проверять автотестами (см. tests/).
//
// Три функции продукта:
//   1) Диагностика:  validateAnswers() + gradeTest()
//   2) FAQ-помощник: validateQuestion() + searchFaq()
//   3) План:         buildPlan() + planToText()
// =====================================================================

// Данные (QUESTIONS, FAQ, TOPICS...) берутся из data.js. В браузере его
// подключает index.html перед этим файлом, в автотестах его подключает тест.

// ---------------------------------------------------------------------
// ФУНКЦИЯ 1. ДИАГНОСТИКА
// ---------------------------------------------------------------------

// Превращает текст ученика в число. Понимает запятую («2,5»), типографский
// минус («−3») и пробелы по краям. Если это не число, возвращает null.
function parseNumber(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim().replace(',', '.').replace(/[−–]/g, '-');
  // Разрешаем только: необязательный знак, цифры, необязательная дробная часть
  if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

// Проверяет ответы ДО подсчёта. answers выглядит так:
//   { q1: { value: '1' }, q2: { value: '15' }, q5: { dontKnow: true }, ... }
// Для выбора варианта value = номер варианта (строкой), для числа value = текст.
// Возвращает список ошибок: [{ id: 'q3', code: 'empty' | 'notNumber' }].
// Пустой список значит, что всё можно проверять.
function validateAnswers(answers) {
  const errors = [];
  for (const q of QUESTIONS) {
    const a = answers[q.id];
    if (a && a.dontKnow) continue; // «Не знаю» это честный ответ, он допустим
    const value = a && typeof a.value === 'string' ? a.value.trim() : '';
    if (value === '') {
      errors.push({ id: q.id, code: 'empty' });
    } else if (q.type === 'number' && parseNumber(value) === null) {
      errors.push({ id: q.id, code: 'notNumber' });
    }
  }
  return errors;
}

// Статус подтемы по доле верных ответов.
// Все верно: закрыта; хотя бы половина: повторить; меньше половины: внимание.
function topicStatus(correct, total) {
  if (correct === total) return 'closed';
  if (correct / total >= 0.5) return 'review';
  return 'attention';
}

// Проверяет ответы и считает результат ПО ПОДТЕМАМ (не только общий процент).
// Вызывать только после validateAnswers() без ошибок.
function gradeTest(answers) {
  const topics = {};
  for (const key of Object.keys(TOPICS)) topics[key] = { correct: 0, total: 0 };

  const details = []; // разбор по каждому вопросу
  let totalCorrect = 0;

  for (const q of QUESTIONS) {
    const a = answers[q.id] || {};
    let isCorrect = false;
    if (!a.dontKnow) {
      if (q.type === 'choice') {
        isCorrect = Number(a.value) === q.answerIndex;
      } else {
        const n = parseNumber(a.value);
        // Сравниваем с небольшим допуском, чтобы 2.50 и 2,5 считались одинаковыми
        isCorrect = n !== null && Math.abs(n - q.answer) < 1e-9;
      }
    }
    topics[q.topic].total += 1;
    if (isCorrect) {
      topics[q.topic].correct += 1;
      totalCorrect += 1;
    }
    details.push({ id: q.id, topic: q.topic, correct: isCorrect, dontKnow: !!a.dontKnow, value: a.value });
  }

  for (const key of Object.keys(topics)) {
    topics[key].status = topicStatus(topics[key].correct, topics[key].total);
  }

  return {
    topics,
    details,
    totalCorrect,
    totalQuestions: QUESTIONS.length,
    percent: Math.round((totalCorrect / QUESTIONS.length) * 100)
  };
}

// ---------------------------------------------------------------------
// ФУНКЦИЯ 2. FAQ-ПОМОЩНИК (поиск по схожести текста, без нейросети)
//
// Как работает, по шагам:
//   1. normalize(): приводим вопрос к маленьким буквам, убираем знаки
//      препинания, режем на слова, выбрасываем стоп-слова («что», «как»).
//   2. wordsMatch(): два слова считаем «одинаковыми», если у них общее
//      начало (корень) хотя бы из 4 букв. Так «пропустил» совпадает с
//      «пропуск», а «оценка» с «оценивание». Короткие слова (СОР, SA)
//      должны совпасть полностью.
//   3. searchFaq(): для каждой записи базы считаем, сколько слов вопроса
//      совпало с её ключевыми словами. Это и есть «оценка схожести».
//   4. Сортируем записи по числу совпадений и берём лучшую.
// ---------------------------------------------------------------------

const MIN_ROOT = 4; // минимальная длина общего корня

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ') // всё, кроме букв/цифр/пробелов, в пробел
    .split(/[\s-]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.includes(w));
}

// Длина общего начала двух слов: «пропустил» и «пропуск» дают 6
function commonPrefixLength(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function wordsMatch(a, b) {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < MIN_ROOT) return false; // короткие слова только точно
  // Общий корень: хотя бы 4 буквы и хотя бы 60% длины более короткого слова
  const need = Math.max(MIN_ROOT, Math.ceil(shorter * 0.6));
  return commonPrefixLength(a, b) >= need;
}

// Проверка вопроса до поиска. Возвращает код ошибки или null.
function validateQuestion(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (raw === '') return 'empty';
  if (raw.length > 300) return 'tooLong';
  const letters = (raw.match(/\p{L}/gu) || []).length;
  if (letters < 3) return 'tooShort'; // «?», «12», «ааа?» не вопрос
  if (normalize(raw).length === 0) return 'noWords'; // только стоп-слова: «а как?»
  return null;
}

// Ищет ответ. Возвращает:
//   { error: 'empty' | 'tooShort' | 'tooLong' | 'noWords' }  если ввод плохой
//   { found: false, tokens }                                 если совпадений нет
//   { found: true, best, others, tokens }                    если ответ найден
// best = { entry, score, matchedWords }
function searchFaq(text) {
  const error = validateQuestion(text);
  if (error) return { error };

  const tokens = [...new Set(normalize(text))]; // уникальные слова вопроса

  // Для каждой записи: какие слова вопроса совпали с её ключевыми словами
  const matches = FAQ.map((entry) =>
    tokens.filter((tok) => entry.keywords.some((kw) => wordsMatch(tok, kw)))
  );

  // Вес слова: редкое слово важнее частого. Если слово встречается
  // в 1 записи, оно даёт 1 балл; если в 3 записях, то 1/3 балла.
  // Пример: «баллы» есть в 3 записях, а «несправедливо» только в одной,
  // поэтому вопрос «мало баллов, несправедливо» уходит в запись про апелляцию.
  const weight = {};
  for (const tok of tokens) {
    const inEntries = matches.filter((m) => m.includes(tok)).length;
    weight[tok] = inEntries > 0 ? 1 / inEntries : 0;
  }

  const scored = FAQ.map((entry, index) => {
    const matchedWords = matches[index];
    const score = matchedWords.reduce((sum, tok) => sum + weight[tok], 0);
    return { entry, index, score, matchedWords };
  })
    .filter((r) => r.matchedWords.length > 0)
    // Больше баллов выше; при равенстве выше та запись, что раньше в базе
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (scored.length === 0) return { found: false, tokens };
  return { found: true, best: scored[0], others: scored.slice(1, 3), tokens };
}

// ---------------------------------------------------------------------
// ФУНКЦИЯ 3. ПЕРСОНАЛЬНЫЙ ПЛАН
//
// Вход:
//   testResult: результат gradeTest() (или null, если тест не пройден)
//   askedLog:   список вопросов ученика: [{ text, entryId }]
//               entryId = id найденной записи FAQ или null (ответа нет)
// Правила приоритета (простые и объяснимые):
//   - подтема «Требует внимания» (меньше половины верно)  -> Срочно
//   - подтема «Повторить» (половина верно)                -> На этой неделе
//   - найденный вопрос FAQ                                -> приоритет из базы
//   - 2+ вопроса в одном разделе FAQ: это сигнал, что раздел непонятен,
//     поэтому приоритет этих пунктов повышаем на один уровень
//   - вопрос без ответа                                   -> На этой неделе
//                                                           (спросить у куратора)
// ---------------------------------------------------------------------

const PRIORITY_ORDER = ['urgent', 'week', 'later'];

function raisePriority(p) {
  const i = PRIORITY_ORDER.indexOf(p);
  return PRIORITY_ORDER[Math.max(0, i - 1)];
}

function buildPlan(testResult, askedLog, lang) {
  if (!testResult) return { error: 'noTest' };
  const L = lang === 'kz' ? 'kz' : 'ru';
  const items = [];

  // 3.1 Пункты из диагностики: только слабые подтемы
  for (const [key, t] of Object.entries(testResult.topics)) {
    if (t.status === 'closed') continue;
    items.push({
      priority: t.status === 'attention' ? 'urgent' : 'week',
      source: 'test',
      title: TOPICS[key].name[L] + ': ' + t.correct + ' / ' + t.total,
      detail: TOPICS[key].tip[L],
      topicKey: key
    });
  }

  // 3.2 Считаем, сколько вопросов ученик задал в каждом разделе FAQ
  const log = Array.isArray(askedLog) ? askedLog : [];
  const topicCounts = {};
  for (const q of log) {
    const entry = FAQ.find((e) => e.id === q.entryId);
    if (entry) topicCounts[entry.topic] = (topicCounts[entry.topic] || 0) + 1;
  }

  // 3.3 Пункты из вопросов FAQ (один пункт на запись, без повторов)
  const usedEntries = new Set();
  for (const q of log) {
    if (!q.entryId) {
      items.push({
        priority: 'week',
        source: 'unanswered',
        title: UI[L].askCurator + ': «' + q.text + '»',
        detail: ''
      });
      continue;
    }
    if (usedEntries.has(q.entryId)) continue;
    const entry = FAQ.find((e) => e.id === q.entryId);
    if (!entry) continue;
    usedEntries.add(q.entryId);

    let priority = entry.priority;
    let detail = entry.q[L];
    if (topicCounts[entry.topic] >= 2) {
      priority = raisePriority(priority);
      detail += ' ' + UI[L].repeatTopic.replace('{topic}', FAQ_TOPICS[entry.topic][L]);
    }
    items.push({ priority, source: 'faq', title: entry.action[L], detail, faqTopic: entry.topic });
  }

  // 3.4 Сортировка: сначала срочные; внутри уровня сначала учёба, потом FAQ
  const sourceOrder = { test: 0, faq: 1, unanswered: 2 };
  items.sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      sourceOrder[a.source] - sourceOrder[b.source]
  );

  const closedTopics = Object.keys(testResult.topics).filter(
    (k) => testResult.topics[k].status === 'closed'
  );
  return { items, closedTopics };
}

// Текстовая версия плана для скачивания в .txt
function planToText(plan, testResult, lang, date) {
  const L = lang === 'kz' ? 'kz' : 'ru';
  const t = UI[L];
  const labels = { urgent: t.prUrgent, week: t.prWeek, later: t.prLater };
  const sources = { test: t.fromTest, faq: t.fromFaq, unanswered: t.fromUnanswered };
  const statusText = { closed: t.stClosed, review: t.stReview, attention: t.stAttention };
  const lines = [t.planFileTitle, t.planFileDate + ': ' + date, ''];

  lines.push(t.summaryTopics + ' (' + t.resultScore + ' ' + testResult.totalCorrect + ' / ' + testResult.totalQuestions + '):');
  for (const [key, tp] of Object.entries(testResult.topics)) {
    lines.push('  - ' + TOPICS[key].name[L] + ': ' + tp.correct + ' / ' + tp.total + ', ' + statusText[tp.status]);
  }
  lines.push('');

  for (const p of PRIORITY_ORDER) {
    const group = plan.items.filter((i) => i.priority === p);
    if (group.length === 0) continue;
    lines.push('[' + labels[p].toUpperCase() + ']');
    group.forEach((item, n) => {
      lines.push('  ' + (n + 1) + '. [ ] ' + item.title + '  (' + sources[item.source] + ')');
      if (item.detail) lines.push('       ' + item.detail);
    });
    lines.push('');
  }
  if (plan.items.length === 0) lines.push(t.planEmptyAll);
  return lines.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseNumber, validateAnswers, gradeTest, topicStatus,
    normalize, wordsMatch, validateQuestion, searchFaq,
    buildPlan, planToText, raisePriority
  };
}
