// =====================================================================
// logic-school.js: логика «школьной жизни». Только чистые функции,
// без работы с экраном, поэтому всё проверяется автотестами.
//   validateProfile()  проверка анкеты при регистрации
//   buildRoute()       маршрут по кабинетам на день
//   recommendClubs()   подбор кружков и олимпиад по интересам
//   checkActivityAdd() правила выбора кружков (лимит, пересечения)
//   matchMentors()     подбор ментора
//   buildWeekPlan()    планер на 7 дней с дедлайнами, отдыхом и сном
// Нужны данные из data.js и data-school.js, и buildPlan() из logic.js.
// =====================================================================

// ---------- Время: '08:30' <-> 510 минут от полуночи ----------
function toMin(hhmm) {
  if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
function fmtMin(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
// Сколько часов сна между отбоем и подъёмом (через полночь тоже)
function sleepHours(bed, wake) {
  const b = toMin(bed), w = toMin(wake);
  if (b === null || w === null) return null;
  return ((w - b + 1440) % 1440) / 60;
}
// Отбой в минутах «вечера»: 00:30 считаем как 24:30, чтобы окно вечера не ломалось
function bedAsEvening(bed) {
  const b = toMin(bed);
  return b < 12 * 60 ? b + 1440 : b;
}

// ---------- Даты ----------
function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}
// День недели: 0 = понедельник ... 6 = воскресенье
function weekday(date) { return (date.getDay() + 6) % 7; }
function fmtDate(date) {
  return String(date.getDate()).padStart(2, '0') + '.' + String(date.getMonth() + 1).padStart(2, '0');
}

// =====================================================================
// РЕГИСТРАЦИЯ: проверка анкеты
// profile = { name, cls, interests: [], dorm, bed: '22:00', wake: '06:30', lang }
// Возвращает { errors: [{field, code}], warnings: [{code, hours}] }
// =====================================================================
function validateProfile(p) {
  const errors = [];
  const warnings = [];
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  if (name === '') errors.push({ field: 'name', code: 'eNameEmpty' });
  else if (!/^[\p{L}][\p{L} -]{1,29}$/u.test(name)) errors.push({ field: 'name', code: 'eNameBad' });

  if (!CLASSES.includes(p.cls)) errors.push({ field: 'cls', code: 'eClass' });

  const n = Array.isArray(p.interests) ? p.interests.length : 0;
  if (n === 0) errors.push({ field: 'interests', code: 'eInterestsNone' });
  else if (n > 5) errors.push({ field: 'interests', code: 'eInterestsMany' });

  const hours = sleepHours(p.bed, p.wake);
  if (hours === null) errors.push({ field: 'sleep', code: 'eTimeEmpty' });
  else if (hours < 5) errors.push({ field: 'sleep', code: 'eSleepTooShort' });
  else if (hours < PLANNER.minSleepHours) warnings.push({ code: 'wSleep', hours });

  return { errors, warnings };
}

// =====================================================================
// РАСПИСАНИЕ И МАРШРУТ
// =====================================================================

// Уроки класса в день (0 = пн). Для учебных данных у каждого класса
// порядок уроков сдвинут по кругу: 7A без сдвига, 7B на 1 и т. д.
function lessonsFor(cls, day) {
  if (day < 0 || day > 4) return [];
  const shift = Math.max(0, CLASSES.indexOf(cls));
  const base = BASE_WEEK[day];
  return base.map((_, i) => base[(i + shift) % base.length]);
}

// Маршрут: для каждого урока считаем переход от предыдущего кабинета.
// Далёкий переход = разница 2 этажа и больше (за 10 минут перемены это тяжело).
function buildRoute(cls, day) {
  const lessons = lessonsFor(cls, day);
  let prev = null;
  let floors = 0;
  let far = 0;
  const steps = lessons.map((key, i) => {
    const s = SUBJECTS[key];
    const fromFloor = prev ? prev.floor : 1; // первый урок: идём от входа
    const diff = s.floor - fromFloor;
    let move;
    if (!prev) move = diff === 0 ? 'entrance' : diff > 0 ? 'up' : 'down';
    else if (prev.room === s.room) move = 'sameRoom';
    else move = diff === 0 ? 'same' : diff > 0 ? 'up' : 'down';
    const isFar = Math.abs(diff) >= 2;
    const gym = !!(s.gym || (prev && prev.gym)); // до или после физкультуры нужно переодеться
    floors += Math.abs(diff);
    if (isFar && prev) far += 1;
    prev = s;
    return {
      n: i + 1, subject: key, room: s.room, floor: s.floor,
      start: BELLS[i][0], end: BELLS[i][1],
      move, floorsDiff: Math.abs(diff), far: isFar && i > 0, gym, first: i === 0
    };
  });
  return {
    steps, floors, far,
    endsAt: steps.length ? steps[steps.length - 1].end : null
  };
}

// =====================================================================
// КЛУБЫ И ОЛИМПИАДЫ
// =====================================================================

// Подбор: 1 балл за каждый совпавший интерес; при равенстве раньше
// в списке то, где запись закрывается раньше (чтобы не пропустить).
function recommendClubs(interests) {
  const set = new Set(interests || []);
  return ACTIVITIES.map((a) => {
    const matched = a.tags.filter((t) => set.has(t));
    return { activity: a, score: matched.length, matched };
  }).sort((x, y) => y.score - x.score || x.activity.deadlineDays - y.activity.deadlineDays);
}

function overlaps(a, b) {
  return a.day === b.day && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
}

// Можно ли добавить занятие к уже выбранным? null = можно, иначе причина.
function checkActivityAdd(selectedIds, id) {
  const act = ACTIVITIES.find((a) => a.id === id);
  if (!act) return { code: 'unknown' };
  if (act.kind !== 'club') return null; // олимпиады не занимают время каждую неделю
  const clubs = selectedIds.map((s) => ACTIVITIES.find((a) => a.id === s)).filter((a) => a && a.kind === 'club');
  if (clubs.length >= MAX_CLUBS) return { code: 'eMaxClubs' };
  const clash = clubs.find((c) => overlaps(c, act));
  if (clash) return { code: 'eClash', other: clash };
  return null;
}

// =====================================================================
// МЕНТОР
// Баллы: +2 за каждый общий интерес, +2 за каждую слабую тему ученика,
// с которой ментор может помочь, +2 если оба живут в интернате,
// +1 если ментор говорит на языке ученика.
// =====================================================================
function matchMentors(profile, testResult) {
  const interests = new Set(profile.interests || []);
  const weak = testResult
    ? Object.keys(testResult.topics).filter((k) => testResult.topics[k].status !== 'closed')
    : [];
  return MENTORS.map((m) => {
    const common = m.interests.filter((i) => interests.has(i));
    const helps = m.strong.filter((t) => weak.includes(t));
    const dorm = !!(profile.dorm && m.dorm);
    const lang = m.langs.includes(profile.lang);
    const score = common.length * 2 + helps.length * 2 + (dorm ? 2 : 0) + (lang ? 1 : 0);
    return { mentor: m, score, common, helps, dorm, lang };
  }).sort((a, b) => b.score - a.score || a.mentor.id.localeCompare(b.mentor.id));
}

// =====================================================================
// ПЛАНЕР НА 7 ДНЕЙ
//
// Шаг 1. Собираем задачи из всех разделов:
//   - слабые темы диагностики: 2 занятия по 40 мин («Требует внимания»)
//     или 1 занятие 30 мин («Повторить»), дедлайн: за день до СОР;
//     занятия одной темы ставим в разные дни (повторение с перерывом);
//   - вопросы помощнику: задачи по 15 мин, дедлайн по приоритету;
//   - вопрос без ответа и запись в кружок/олимпиаду: дела «в школе» по 10 мин;
//   - кружки и встреча с ментором: фиксированное время.
// Шаг 2. Раскладываем задачи по дням: сначала с ближайшим дедлайном,
//   каждую в самый ранний день, где хватает свободного времени.
//   Свободное время = после уроков, отдыха и ДЗ и не позже, чем за час до сна.
//   Лимит доп. задач: 90 мин в учебный день, 150 в выходной.
// Шаг 3. Для каждого дня строим расписание по часам.
// Что не влезло до дедлайна, показываем отдельно: сон не урезаем.
// =====================================================================
function buildWeekPlan(input) {
  const { profile, testResult, asked, activities, mentorId, today } = input;
  const L = profile.lang === 'kz' ? 'kz' : 'ru';
  const T = UI[L];
  const P = PLANNER;
  const bed = bedAsEvening(profile.bed);
  const windowEnd = bed - P.windDownMin;

  // ---- Шаг 1: задачи ----
  const tasks = [];
  if (testResult) {
    for (const [key, tp] of Object.entries(testResult.topics)) {
      if (tp.status === 'closed') continue;
      const lens = P.sessions[tp.status];
      lens.forEach((len, i) => tasks.push({
        kind: 'study', place: 'evening', min: len, deadline: P.mathSaInDays - 1,
        topic: key, order: i, prio: tp.status === 'attention' ? 0 : 1,
        title: TOPICS[key].name[L] + (lens.length > 1 ? ' (' + T.session.replace('{n}', i + 1) + ')' : '')
      }));
    }
    for (const item of buildPlan(testResult, asked || [], L).items) {
      if (item.source === 'faq') {
        tasks.push({ kind: 'faq', place: 'evening', min: P.faqTaskMin,
          deadline: P.deadlineByPriority[item.priority], prio: 2, title: item.title });
      } else if (item.source === 'unanswered') {
        tasks.push({ kind: 'school', place: 'school', min: P.schoolTaskMin,
          deadline: P.deadlineByPriority.week, prio: 2, title: item.title });
      }
    }
  }
  const chosen = (activities || []).map((id) => ACTIVITIES.find((a) => a.id === id)).filter(Boolean);
  for (const a of chosen) {
    tasks.push({ kind: 'school', place: 'school', min: P.schoolTaskMin, deadline: a.deadlineDays, prio: 1,
      title: (a.kind === 'club' ? T.regClub : T.regOlymp).replace('{name}', a.name[L]) });
  }

  // ---- Дни ----
  const days = [];
  for (let d = 0; d < P.daysAhead; d++) {
    const date = addDays(today, d);
    const dow = weekday(date);
    const school = dow <= 4;
    days.push({
      offset: d, date, dow, school,
      clubs: chosen.filter((a) => a.kind === 'club' && a.day === dow),
      mentor: null, schoolTasks: [], evening: [], used: 0
    });
  }
  // Встреча с ментором: первый учебный день, в который ментору удобно
  // и в который нет кружка (иначе встреча наложится на кружок)
  const mentor = MENTORS.find((m) => m.id === mentorId);
  if (mentor) {
    const free = (x) => x.school && x.clubs.length === 0;
    const day = days.find((x) => free(x) && x.dow === mentor.day) || days.find(free) || days.find((x) => x.school);
    if (day) day.mentor = mentor;
  }

  // Когда начинается свободное вечернее время в этот день (минуты)
  function eveningStart(day) {
    let cur;
    if (day.school) {
      cur = toMin(buildRoute(profile.cls, day.dow).endsAt) + 5;
      cur += day.schoolTasks.length * P.schoolTaskMin;
      if (day.mentor) cur += 30;
    } else {
      cur = toMin(P.weekendStart);
    }
    const club = day.clubs[0];
    if (club) cur = Math.max(cur, toMin(club.end)) + P.breakMin;
    else if (day.school) cur += 60; // отдых и обед
    cur += day.school ? 90 : 60;    // домашнее задание
    return cur + P.breakMin;
  }
  function capacity(day) {
    const window = Math.max(0, windowEnd - eveningStart(day));
    return Math.min(window, day.school ? P.maxExtraSchoolDay : P.maxExtraWeekend);
  }

  // ---- Шаг 2: раскладываем ----
  const kindOrder = { study: 0, school: 1, faq: 2 };
  tasks.sort((a, b) => a.deadline - b.deadline || a.prio - b.prio || kindOrder[a.kind] - kindOrder[b.kind] || (a.order || 0) - (b.order || 0));
  const lastTopicDay = {};
  const unscheduled = [];
  // Сначала дела «в школе» (они сдвигают начало вечера), потом вечерние задачи
  const ordered = tasks.filter((t) => t.place === 'school').concat(tasks.filter((t) => t.place !== 'school'));
  for (const task of ordered) {
    const lastDay = Math.min(task.deadline, P.daysAhead - 1);
    const minDay = task.kind === 'study' && task.order > 0 ? lastTopicDay[task.topic] + 1 : 0;
    let placed = false;
    for (let d = minDay; d <= lastDay && !placed; d++) {
      const day = days[d];
      if (task.place === 'school') {
        if (day.school && day.schoolTasks.length < 2) { day.schoolTasks.push(task); placed = true; }
      } else if (day.used + task.min + (day.used ? P.breakMin : 0) <= capacity(day)) {
        day.used += task.min + (day.used ? P.breakMin : 0);
        day.evening.push(task);
        placed = true;
      }
      if (placed && task.kind === 'study') lastTopicDay[task.topic] = d;
    }
    if (!placed) unscheduled.push(task);
  }

  // ---- Шаг 3: расписание по часам ----
  for (const day of days) {
    const items = [];
    let cur;
    if (day.school) {
      const route = buildRoute(profile.cls, day.dow);
      items.push({ kind: 'lessons', start: BELLS[0][0], end: route.endsAt, title: T.tLessons });
      cur = toMin(route.endsAt) + 5;
      for (const t of day.schoolTasks) {
        items.push({ kind: 'school', start: fmtMin(cur), end: fmtMin(cur + t.min), title: t.title });
        cur += t.min;
      }
      if (day.mentor) {
        items.push({ kind: 'mentor', start: fmtMin(cur), end: fmtMin(cur + 30), title: T.meetMentor.replace('{name}', day.mentor.name) });
        cur += 30;
      }
    } else {
      cur = toMin(P.weekendStart);
    }
    const club = day.clubs[0];
    if (club) {
      if (toMin(club.start) - cur >= 20) items.push({ kind: 'rest', start: fmtMin(cur), end: club.start, title: T.tRest });
      items.push({ kind: 'club', start: club.start, end: club.end, title: club.name[profile.lang === 'kz' ? 'kz' : 'ru'] });
      cur = Math.max(cur, toMin(club.end)) + P.breakMin;
    } else if (day.school) {
      items.push({ kind: 'rest', start: fmtMin(cur), end: fmtMin(cur + 60), title: T.tRest });
      cur += 60;
    }
    const hw = day.school ? 90 : 60;
    items.push({ kind: 'homework', start: fmtMin(cur), end: fmtMin(cur + hw), title: T.tHomework });
    cur += hw + P.breakMin;
    for (const t of day.evening) {
      items.push({ kind: t.kind, start: fmtMin(cur), end: fmtMin(cur + t.min), title: t.title });
      cur += t.min + P.breakMin;
    }
    items.push({ kind: 'winddown', start: fmtMin(windowEnd), end: fmtMin(bed), title: T.tWindDown });
    items.push({ kind: 'sleep', start: fmtMin(bed), end: profile.wake, title: T.tSleep });
    day.items = items;
    day.label = DAY_SHORT[L][day.dow] + ' ' + fmtDate(day.date);
  }

  // ---- Напоминания ----
  const reminders = [];
  const weakCount = testResult ? Object.values(testResult.topics).filter((t) => t.status !== 'closed').length : 0;
  if (weakCount > 0) reminders.push({ kind: 'sa', text: T.remSa.replace('{n}', P.mathSaInDays).replace('{k}', weakCount) });
  for (const a of chosen) {
    if (a.deadlineDays <= 2) {
      const text = a.deadlineDays === 0 ? T.remDeadlineToday : T.remDeadline.replace('{n}', a.deadlineDays);
      reminders.push({ kind: 'deadline', text: text.replace('{title}', a.name[L]) });
    }
  }
  const todayTasks = days[0].items.filter((i) => ['study', 'school', 'faq', 'mentor', 'club'].includes(i.kind));
  if (todayTasks.length) reminders.push({ kind: 'today', text: todayTasks.map((i) => i.start + ' ' + i.title).join('; ') });

  // ---- Сон ----
  const hours = sleepHours(profile.bed, profile.wake);
  const sleep = { hours, ok: hours >= P.minSleepHours,
    suggestBed: fmtMin(toMin(profile.wake) - P.minSleepHours * 60) };

  return { days, unscheduled, reminders, sleep, taskCount: tasks.length };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toMin, fmtMin, sleepHours, addDays, weekday, fmtDate,
    validateProfile, lessonsFor, buildRoute, recommendClubs, checkActivityAdd,
    matchMentors, buildWeekPlan
  };
}
