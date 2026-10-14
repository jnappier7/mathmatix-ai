'use strict';
/* ============================================================
   parentReportText.js — the Learning Report's sentences, in the parent's
   language.

   The report's headline and insights were English template literals built in
   the route, so a parent who set Spanish got Spanish buttons around an English
   report. Every sentence is now a key + params, rendered here for the parent's
   language (the same nine the dashboard offers — utils/parentConferencePrompt
   PARENT_LANGUAGES). Unknown language or missing string → English.

   Plurals: a key may have a `_one` variant used when the count is 1. Languages
   whose plural rules don't fit one/other (Russian, Arabic …) are phrased so
   the number doesn't inflect the words around it ("Сессий: 3").

   Skill names are passed in as given (catalog names are English today).
   ============================================================ */

const LANGS = ['English', 'Spanish', 'Russian', 'Chinese', 'Vietnamese', 'Arabic', 'Somali', 'French', 'German'];

const MESSAGES = {
  'headline.none': {
    English: "{name} hasn't practiced in the last 7 days",
    Spanish: '{name} no ha practicado en los últimos 7 días',
    Russian: '{name}: за последние 7 дней занятий не было',
    Chinese: '{name}在过去7天里没有练习',
    Vietnamese: '{name} chưa luyện tập trong 7 ngày qua',
    Arabic: 'لم يتدرّب {name} خلال الأيام السبعة الماضية',
    Somali: '{name} kuma tababaran 7-dii maalmood ee la soo dhaafay',
    French: "{name} ne s'est pas entraîné ces 7 derniers jours",
    German: '{name} hat in den letzten 7 Tagen nicht geübt',
  },
  'headline.excellent': {
    English: '{name} is making excellent progress',
    Spanish: '{name} está progresando de forma excelente',
    Russian: '{name}: отличный прогресс',
    Chinese: '{name}进步非常大',
    Vietnamese: '{name} đang tiến bộ rất tốt',
    Arabic: 'يحقق {name} تقدّمًا ممتازًا',
    Somali: '{name} horumar aad u fiican ayuu samaynayaa',
    French: '{name} fait d’excellents progrès',
    German: '{name} macht hervorragende Fortschritte',
  },
  'headline.good': {
    English: '{name} is doing well — steady and consistent',
    Spanish: '{name} va bien: constante y regular',
    Russian: '{name}: всё идёт хорошо — ровно и стабильно',
    Chinese: '{name}表现不错——稳定而持续',
    Vietnamese: '{name} đang học tốt — đều đặn và ổn định',
    Arabic: 'يسير {name} بشكل جيد — بثبات وانتظام',
    Somali: '{name} si fiican ayuu u socdaa — si joogto ah oo deggan',
    French: '{name} progresse bien — avec régularité',
    German: '{name} macht es gut — stetig und beständig',
  },
  'headline.growing': {
    English: '{name} is working hard on new challenges',
    Spanish: '{name} está esforzándose con nuevos retos',
    Russian: '{name} усердно работает над новыми задачами',
    Chinese: '{name}正在努力攻克新的挑战',
    Vietnamese: '{name} đang chăm chỉ với những thử thách mới',
    Arabic: 'يعمل {name} بجد على تحديات جديدة',
    Somali: '{name} si adag ayuu uga shaqaynayaa caqabado cusub',
    French: '{name} travaille dur sur de nouveaux défis',
    German: '{name} arbeitet fleißig an neuen Herausforderungen',
  },
  'headline.building': {
    English: '{name} is putting in the work',
    Spanish: '{name} está poniendo de su parte',
    Russian: '{name} старается и занимается',
    Chinese: '{name}一直在用功',
    Vietnamese: '{name} đang nỗ lực học tập',
    Arabic: 'يبذل {name} جهدًا في التعلّم',
    Somali: '{name} wuu dadaalayaa',
    French: '{name} fournit des efforts',
    German: '{name} bleibt dran',
  },
  'headline.neutral': {
    English: "{name}'s learning journey continues",
    Spanish: 'El aprendizaje de {name} continúa',
    Russian: '{name} продолжает учиться',
    Chinese: '{name}的学习之旅仍在继续',
    Vietnamese: 'Hành trình học tập của {name} vẫn tiếp tục',
    Arabic: 'تستمر رحلة {name} التعليمية',
    Somali: 'Safarka waxbarasho ee {name} wuu socdaa',
    French: "L'apprentissage de {name} se poursuit",
    German: '{name} lernt weiter',
  },

  'insight.activity.none': {
    English: "{name} hasn't had any sessions in the last 7 days. Even 10 minutes a day makes a big difference.",
    Spanish: '{name} no ha tenido sesiones en los últimos 7 días. Incluso 10 minutos al día marcan una gran diferencia.',
    Russian: '{name}: за последние 7 дней не было ни одного занятия. Даже 10 минут в день дают заметный результат.',
    Chinese: '{name}在过去7天里没有任何学习。每天哪怕10分钟也会带来很大变化。',
    Vietnamese: '{name} chưa có buổi học nào trong 7 ngày qua. Chỉ 10 phút mỗi ngày cũng tạo ra khác biệt lớn.',
    Arabic: 'لم يحضر {name} أي جلسة خلال الأيام السبعة الماضية. حتى 10 دقائق يوميًا تُحدث فرقًا كبيرًا.',
    Somali: '{name} wax fadhi ah kama qaadan 7-dii maalmood ee la soo dhaafay. Xitaa 10 daqiiqo maalintii farq weyn ayay samaysaa.',
    French: "{name} n'a eu aucune séance ces 7 derniers jours. Même 10 minutes par jour font une grande différence.",
    German: '{name} hatte in den letzten 7 Tagen keine Sitzung. Schon 10 Minuten am Tag machen einen großen Unterschied.',
  },
  'insight.activity.high': {
    English: '{name} has been very active: {sessions} sessions and {minutes} minutes of practice in the last 7 days!',
    Spanish: '¡{name} ha estado muy activo: {sessions} sesiones y {minutes} minutos de práctica en los últimos 7 días!',
    Russian: '{name} очень активно занимается: за 7 дней занятий — {sessions}, минут практики — {minutes}!',
    Chinese: '{name}最近非常积极：过去7天共{sessions}次学习、{minutes}分钟练习！',
    Vietnamese: '{name} rất tích cực: {sessions} buổi học và {minutes} phút luyện tập trong 7 ngày qua!',
    Arabic: 'كان {name} نشيطًا جدًا: عدد الجلسات {sessions} وعدد دقائق التدريب {minutes} خلال الأيام السبعة الماضية!',
    Somali: '{name} aad buu u firfircoonaa: {sessions} fadhi iyo {minutes} daqiiqo oo tababar ah 7-dii maalmood ee la soo dhaafay!',
    French: "{name} a été très actif : {sessions} séances et {minutes} minutes d'entraînement ces 7 derniers jours !",
    German: '{name} war sehr aktiv: {sessions} Sitzungen und {minutes} Minuten Übung in den letzten 7 Tagen!',
  },
  'insight.activity.some': {
    English: '{name} had {sessions} sessions in the last 7 days ({minutes} minutes in total).',
    Spanish: '{name} tuvo {sessions} sesiones en los últimos 7 días ({minutes} minutos en total).',
    Russian: '{name}: занятий за последние 7 дней — {sessions} (всего минут: {minutes}).',
    Chinese: '{name}在过去7天里学习了{sessions}次（共{minutes}分钟）。',
    Vietnamese: '{name} có {sessions} buổi học trong 7 ngày qua (tổng cộng {minutes} phút).',
    Arabic: 'عدد جلسات {name} خلال الأيام السبعة الماضية: {sessions} (المجموع {minutes} دقيقة).',
    Somali: '{name} wuxuu yeeshay {sessions} fadhi 7-dii maalmood ee la soo dhaafay (wadarta {minutes} daqiiqo).',
    French: '{name} a eu {sessions} séances ces 7 derniers jours ({minutes} minutes au total).',
    German: '{name} hatte in den letzten 7 Tagen {sessions} Sitzungen ({minutes} Minuten insgesamt).',
  },
  'insight.activity.some_one': {
    English: '{name} had 1 session in the last 7 days ({minutes} minutes in total).',
    Spanish: '{name} tuvo 1 sesión en los últimos 7 días ({minutes} minutos en total).',
    Vietnamese: '{name} có 1 buổi học trong 7 ngày qua (tổng cộng {minutes} phút).',
    Somali: '{name} wuxuu yeeshay 1 fadhi 7-dii maalmood ee la soo dhaafay (wadarta {minutes} daqiiqo).',
    French: '{name} a eu 1 séance ces 7 derniers jours ({minutes} minutes au total).',
    German: '{name} hatte in den letzten 7 Tagen 1 Sitzung ({minutes} Minuten insgesamt).',
  },

  'insight.accuracy.up': {
    English: 'Accuracy improved from {prev}% to {now}% — great progress!',
    Spanish: 'La precisión mejoró del {prev}% al {now}%: ¡gran avance!',
    Russian: 'Точность выросла с {prev}% до {now}% — отличный прогресс!',
    Chinese: '正确率从{prev}%提高到{now}%——进步很大！',
    Vietnamese: 'Độ chính xác tăng từ {prev}% lên {now}% — tiến bộ tuyệt vời!',
    Arabic: 'تحسّنت الدقة من {prev}% إلى {now}% — تقدّم رائع!',
    Somali: 'Saxnaantu waxay ka kortay {prev}% ilaa {now}% — horumar weyn!',
    French: 'La précision est passée de {prev} % à {now} % — beau progrès !',
    German: 'Die Genauigkeit stieg von {prev} % auf {now} % — toller Fortschritt!',
  },
  'insight.accuracy.down': {
    English: 'Accuracy dipped from {prev}% to {now}%. This could mean {name} is tackling harder material — which is a good thing.',
    Spanish: 'La precisión bajó del {prev}% al {now}%. Puede significar que {name} está trabajando con material más difícil, lo cual es bueno.',
    Russian: 'Точность снизилась с {prev}% до {now}%. Возможно, {name} взялся за более сложный материал — и это хорошо.',
    Chinese: '正确率从{prev}%降到{now}%。这可能说明{name}正在挑战更难的内容——这是好事。',
    Vietnamese: 'Độ chính xác giảm từ {prev}% xuống {now}%. Có thể {name} đang học nội dung khó hơn — đó là điều tốt.',
    Arabic: 'انخفضت الدقة من {prev}% إلى {now}%. قد يعني ذلك أن {name} يتعامل مع مادة أصعب — وهذا أمر جيد.',
    Somali: 'Saxnaantu waxay ka dhacday {prev}% ilaa {now}%. Tani waxay noqon kartaa in {name} uu wax adag qaadanayo — taasina waa wax wanaagsan.',
    French: 'La précision est passée de {prev} % à {now} %. {name} aborde peut-être des notions plus difficiles — ce qui est une bonne chose.',
    German: 'Die Genauigkeit sank von {prev} % auf {now} %. Das kann bedeuten, dass {name} sich an schwierigeren Stoff wagt — und das ist gut so.',
  },
  'insight.accuracy.flat': {
    English: 'Accuracy in the last 7 days: {now}% across {problems} problems.',
    Spanish: 'Precisión en los últimos 7 días: {now}% en {problems} problemas.',
    Russian: 'Точность за последние 7 дней: {now}% (задач: {problems}).',
    Chinese: '过去7天的正确率：{now}%（共{problems}道题）。',
    Vietnamese: 'Độ chính xác trong 7 ngày qua: {now}% trên {problems} bài.',
    Arabic: 'الدقة خلال الأيام السبعة الماضية: {now}% (عدد المسائل: {problems}).',
    Somali: 'Saxnaanta 7-dii maalmood ee la soo dhaafay: {now}% oo ka mid ah {problems} su’aalood.',
    French: 'Précision ces 7 derniers jours : {now} % sur {problems} problèmes.',
    German: 'Genauigkeit in den letzten 7 Tagen: {now} % bei {problems} Aufgaben.',
  },
  'insight.accuracy.small': {
    English: '{name} answered {correct} of {problems} checked problems correctly — too few yet to judge accuracy.',
    Spanish: '{name} respondió bien {correct} de {problems} problemas revisados; todavía son muy pocos para juzgar la precisión.',
    Russian: '{name}: верных ответов {correct} из {problems} — пока слишком мало, чтобы судить о точности.',
    Chinese: '{name}在已批改的{problems}道题中答对了{correct}道——题量还太少，无法判断正确率。',
    Vietnamese: '{name} trả lời đúng {correct} trên {problems} bài đã được kiểm tra — vẫn còn quá ít để đánh giá độ chính xác.',
    Arabic: 'أجاب {name} بشكل صحيح عن {correct} من أصل {problems} مسائل — العدد ما زال قليلًا للحكم على الدقة.',
    Somali: '{name} wuxuu si sax ah uga jawaabay {correct} ka mid ah {problems} su’aalood — weli aad bay u yar yihiin si loo qiimeeyo saxnaanta.',
    French: '{name} a bien répondu à {correct} problème(s) sur {problems} — encore trop peu pour juger la précision.',
    German: '{name} hat {correct} von {problems} geprüften Aufgaben richtig gelöst — noch zu wenige, um die Genauigkeit zu beurteilen.',
  },

  'insight.memory.fading': {
    English: '{skills} are starting to fade from memory. A quick review session would help lock them in.',
    Spanish: '{skills} empiezan a olvidarse. Un repaso rápido ayudaría a afianzarlos.',
    Russian: 'Начинают забываться: {skills}. Короткое повторение поможет их закрепить.',
    Chinese: '{skills}开始有些遗忘了。快速复习一下有助于巩固。',
    Vietnamese: '{skills} đang bắt đầu bị quên. Một buổi ôn tập ngắn sẽ giúp ghi nhớ chắc hơn.',
    Arabic: 'بدأت هذه المهارات تُنسى: {skills}. مراجعة سريعة ستساعد على تثبيتها.',
    Somali: '{skills} waxay bilaabeen inay ka libdhaan xusuusta. Dib-u-eegis degdeg ah ayaa ka caawin doonta in la xasiliyo.',
    French: '{skills} commencent à s’effacer de la mémoire. Une courte révision aiderait à les ancrer.',
    German: '{skills} geraten langsam in Vergessenheit. Eine kurze Wiederholung hilft, sie zu festigen.',
  },
  'insight.memory.fading_one': {
    English: '{skills} is starting to fade from memory. A quick review session would help lock it in.',
    Spanish: '{skills} empieza a olvidarse. Un repaso rápido ayudaría a afianzarlo.',
    Vietnamese: '{skills} đang bắt đầu bị quên. Một buổi ôn tập ngắn sẽ giúp ghi nhớ chắc hơn.',
    Somali: '{skills} wuxuu bilaabay inuu ka libdho xusuusta. Dib-u-eegis degdeg ah ayaa ka caawin doonta in la xasiliyo.',
    French: '{skills} commence à s’effacer de la mémoire. Une courte révision aiderait à l’ancrer.',
    German: '{skills} gerät langsam in Vergessenheit. Eine kurze Wiederholung hilft, es zu festigen.',
  },
  'insight.memory.strong': {
    English: '{count} practiced skills are well-retained in long-term memory. The spaced practice is working!',
    Spanish: '{count} habilidades practicadas se mantienen bien en la memoria a largo plazo. ¡La práctica espaciada está funcionando!',
    Russian: 'Отработанных навыков, которые хорошо закрепились в долговременной памяти: {count}. Интервальная практика работает!',
    Chinese: '有{count}项练习过的技能已牢固记在长期记忆中。间隔练习很有效！',
    Vietnamese: '{count} kỹ năng đã luyện được ghi nhớ tốt trong trí nhớ dài hạn. Luyện tập ngắt quãng đang phát huy tác dụng!',
    Arabic: 'عدد المهارات المتدرَّب عليها والمحفوظة جيدًا في الذاكرة طويلة المدى: {count}. التدريب المتباعد يؤتي ثماره!',
    Somali: '{count} xirfadood oo la tababaray ayaa si fiican ugu jira xusuusta muddada dheer. Tababarka kala fogeynta ah wuu shaqaynayaa!',
    French: '{count} compétences travaillées sont bien ancrées dans la mémoire à long terme. La pratique espacée porte ses fruits !',
    German: '{count} geübte Fähigkeiten sitzen fest im Langzeitgedächtnis. Das verteilte Üben wirkt!',
  },
  'insight.memory.strong_one': {
    English: '1 practiced skill is well-retained in long-term memory. The spaced practice is working!',
    Spanish: '1 habilidad practicada se mantiene bien en la memoria a largo plazo. ¡La práctica espaciada está funcionando!',
    Vietnamese: '1 kỹ năng đã luyện được ghi nhớ tốt trong trí nhớ dài hạn. Luyện tập ngắt quãng đang phát huy tác dụng!',
    Somali: '1 xirfad oo la tababaray ayaa si fiican ugu jirta xusuusta muddada dheer. Tababarka kala fogeynta ah wuu shaqaynayaa!',
    French: '1 compétence travaillée est bien ancrée dans la mémoire à long terme. La pratique espacée porte ses fruits !',
    German: '1 geübte Fähigkeit sitzt fest im Langzeitgedächtnis. Das verteilte Üben wirkt!',
  },
  'insight.cognitive.rising': {
    English: '{name} seems to be working harder than usual. This is normal when learning new concepts — make sure they take breaks.',
    Spanish: '{name} parece estar esforzándose más de lo habitual. Es normal al aprender conceptos nuevos; asegúrese de que tome descansos.',
    Russian: 'Похоже, {name} сейчас трудится больше обычного. Это нормально при изучении нового — следите, чтобы были перерывы.',
    Chinese: '{name}似乎比平时更吃力。学习新概念时这很正常——记得让孩子适当休息。',
    Vietnamese: '{name} có vẻ đang phải cố gắng nhiều hơn bình thường. Điều này bình thường khi học khái niệm mới — hãy nhắc con nghỉ giải lao.',
    Arabic: 'يبدو أن {name} يبذل جهدًا أكبر من المعتاد. هذا طبيعي عند تعلّم مفاهيم جديدة — احرصوا على أخذ فترات راحة.',
    Somali: '{name} wuxuu u muuqdaa inuu ka dadaal badan yahay sidii caadiga ahayd. Tani waa caadi marka la barto fikrado cusub — hubi inuu nasasho qaato.',
    French: '{name} semble faire plus d’efforts que d’habitude. C’est normal face à de nouvelles notions — veillez à ce qu’il fasse des pauses.',
    German: '{name} scheint sich gerade mehr anzustrengen als sonst. Das ist bei neuen Themen normal — achten Sie auf Pausen.',
  },
  'insight.cognitive.improving': {
    English: 'The material is getting easier for {name} — a sign that learning is sinking in.',
    Spanish: 'El material le resulta cada vez más fácil a {name}: señal de que está aprendiendo.',
    Russian: 'Материал даётся {name} всё легче — признак того, что знания усваиваются.',
    Chinese: '对{name}来说，学习内容越来越轻松了——说明知识正在被吸收。',
    Vietnamese: 'Nội dung đang trở nên dễ hơn với {name} — dấu hiệu cho thấy con đang tiếp thu.',
    Arabic: 'أصبحت المادة أسهل على {name} — علامة على أن التعلّم يترسّخ.',
    Somali: 'Casharradu way u fududaanayaan {name} — calaamad muujinaysa in waxbarashadu degayso.',
    French: 'Les notions deviennent plus faciles pour {name} — signe que les apprentissages s’installent.',
    German: 'Der Stoff fällt {name} zunehmend leichter — ein Zeichen, dass das Gelernte ankommt.',
  },
  'insight.milestone': {
    English: '{name} mastered {count} new skills in the last 7 days!',
    Spanish: '¡{name} dominó {count} habilidades nuevas en los últimos 7 días!',
    Russian: '{name}: новых освоенных навыков за последние 7 дней — {count}!',
    Chinese: '{name}在过去7天里掌握了{count}项新技能！',
    Vietnamese: '{name} đã thành thạo {count} kỹ năng mới trong 7 ngày qua!',
    Arabic: 'عدد المهارات الجديدة التي أتقنها {name} خلال الأيام السبعة الماضية: {count}!',
    Somali: '{name} wuxuu si buuxda u bartay {count} xirfadood oo cusub 7-dii maalmood ee la soo dhaafay!',
    French: '{name} a maîtrisé {count} nouvelles compétences ces 7 derniers jours !',
    German: '{name} hat in den letzten 7 Tagen {count} neue Fähigkeiten gemeistert!',
  },
  'insight.milestone_one': {
    English: '{name} mastered a new skill in the last 7 days!',
    Spanish: '¡{name} dominó una habilidad nueva en los últimos 7 días!',
    Vietnamese: '{name} đã thành thạo một kỹ năng mới trong 7 ngày qua!',
    Somali: '{name} wuxuu si buuxda u bartay xirfad cusub 7-dii maalmood ee la soo dhaafay!',
    French: '{name} a maîtrisé une nouvelle compétence ces 7 derniers jours !',
    German: '{name} hat in den letzten 7 Tagen eine neue Fähigkeit gemeistert!',
  },
  'insight.review': {
    English: '{skills} could use a review. Encourage {name} to revisit these topics.',
    Spanish: 'Conviene repasar {skills}. Anime a {name} a volver a estos temas.',
    Russian: 'Стоит повторить: {skills}. Предложите {name} вернуться к этим темам.',
    Chinese: '{skills}需要复习一下。鼓励{name}回顾这些内容。',
    Vietnamese: '{skills} cần được ôn lại. Hãy khuyến khích {name} xem lại các chủ đề này.',
    Arabic: 'تحتاج هذه المواضيع إلى مراجعة: {skills}. شجّعوا {name} على العودة إليها.',
    Somali: '{skills} waxay u baahan yihiin dib-u-eegis. Ku dhiiri geli {name} inuu dib ugu noqdo mawduucyadan.',
    French: '{skills} mériteraient une révision. Encouragez {name} à revoir ces notions.',
    German: '{skills} sollten wiederholt werden. Ermutigen Sie {name}, diese Themen noch einmal anzuschauen.',
  },
  'insight.review_one': {
    English: '{skills} could use a review. Encourage {name} to revisit this topic.',
    Spanish: 'Conviene repasar {skills}. Anime a {name} a volver a este tema.',
    Vietnamese: '{skills} cần được ôn lại. Hãy khuyến khích {name} xem lại chủ đề này.',
    Somali: '{skills} wuxuu u baahan yahay dib-u-eegis. Ku dhiiri geli {name} inuu dib ugu noqdo mawduucan.',
    French: '{skills} mériterait une révision. Encouragez {name} à revoir cette notion.',
    German: '{skills} sollte wiederholt werden. Ermutigen Sie {name}, dieses Thema noch einmal anzuschauen.',
  },
};

// "A, B and C" in each language.
const LIST_AND = {
  English: ' and ', Spanish: ' y ', Russian: ' и ', Chinese: '和', Vietnamese: ' và ',
  Arabic: ' و', Somali: ' iyo ', French: ' et ', German: ' und ',
};
const LIST_SEP = { Chinese: '、', Arabic: '، ' };

function normalizeLanguage(lang) {
  if (typeof lang !== 'string') return 'English';
  const hit = LANGS.find((l) => l.toLowerCase() === lang.trim().toLowerCase());
  return hit || 'English';
}

function listOf(names, lang = 'English') {
  const L = normalizeLanguage(lang);
  const items = (names || []).filter(Boolean);
  if (items.length <= 1) return items[0] || '';
  const sep = LIST_SEP[L] || ', ';
  const and = LIST_AND[L];
  if (items.length === 2) return `${items[0]}${and}${items[1]}`;
  // English keeps its serial comma; the others don't use one.
  const tail = L === 'English' ? `,${and}` : and;
  return `${items.slice(0, -1).join(sep)}${tail}${items[items.length - 1]}`;
}

/**
 * Render a message for a parent. `count` picks the `_one` variant when 1 and the
 * language has one. Unknown key → '' (never a raw key in front of a parent).
 */
function renderMessage(key, params = {}, lang = 'English') {
  const L = normalizeLanguage(lang);
  const pick = (k) => (MESSAGES[k] && MESSAGES[k][L]) || null;
  let template = null;
  if (params.count === 1) template = pick(`${key}_one`);
  if (!template) template = pick(key);
  if (!template) {
    // English fallback, preferring its _one form for a count of 1.
    const en = (params.count === 1 && MESSAGES[`${key}_one`] && MESSAGES[`${key}_one`].English) ||
      (MESSAGES[key] && MESSAGES[key].English);
    template = en || '';
  }
  return template.replace(/\{(\w+)\}/g, (m, p) => (params[p] != null ? String(params[p]) : ''));
}

module.exports = { renderMessage, listOf, normalizeLanguage, MESSAGES, LANGS };
