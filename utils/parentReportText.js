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
    English: "{name} hasn't practiced {period}",
    Spanish: '{name} no ha practicado {period}',
    Russian: '{name}: {period} занятий не было',
    Chinese: '{name}{period}没有练习',
    Vietnamese: '{name} chưa luyện tập {period}',
    Arabic: 'لم يتدرّب {name} {period}',
    Somali: '{name} kuma tababaran {period}',
    French: "{name} ne s'est pas entraîné {period}",
    German: '{name} hat {period} nicht geübt',
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
    English: "{name} hasn't had any sessions {period}. Even 10 minutes a day makes a big difference.",
    Spanish: '{name} no ha tenido sesiones {period}. Incluso 10 minutos al día marcan una gran diferencia.',
    Russian: '{name}: {period} не было ни одного занятия. Даже 10 минут в день дают заметный результат.',
    Chinese: '{name}{period}没有任何学习。每天哪怕10分钟也会带来很大变化。',
    Vietnamese: '{name} chưa có buổi học nào {period}. Chỉ 10 phút mỗi ngày cũng tạo ra khác biệt lớn.',
    Arabic: 'لم يحضر {name} أي جلسة {period}. حتى 10 دقائق يوميًا تُحدث فرقًا كبيرًا.',
    Somali: '{name} wax fadhi ah kama qaadan {period}. Xitaa 10 daqiiqo maalintii farq weyn ayay samaysaa.',
    French: "{name} n'a eu aucune séance {period}. Même 10 minutes par jour font une grande différence.",
    German: '{name} hatte {period} keine Sitzung. Schon 10 Minuten am Tag machen einen großen Unterschied.',
  },
  'insight.activity.high': {
    English: '{name} has been very active: {sessions} sessions and {minutes} minutes of practice {period}!',
    Spanish: '¡{name} ha estado muy activo: {sessions} sesiones y {minutes} minutos de práctica {period}!',
    Russian: '{name} очень активно занимается: {period} занятий — {sessions}, минут практики — {minutes}!',
    Chinese: '{name}最近非常积极：{period}共{sessions}次学习、{minutes}分钟练习！',
    Vietnamese: '{name} rất tích cực: {sessions} buổi học và {minutes} phút luyện tập {period}!',
    Arabic: 'كان {name} نشيطًا جدًا: عدد الجلسات {sessions} وعدد دقائق التدريب {minutes} {period}!',
    Somali: '{name} aad buu u firfircoonaa: {sessions} fadhi iyo {minutes} daqiiqo oo tababar ah {period}!',
    French: "{name} a été très actif : {sessions} séances et {minutes} minutes d'entraînement {period} !",
    German: '{name} war sehr aktiv: {sessions} Sitzungen und {minutes} Minuten Übung {period}!',
  },
  'insight.activity.some': {
    English: '{name} had {sessions} sessions {period} ({minutes} minutes in total).',
    Spanish: '{name} tuvo {sessions} sesiones {period} ({minutes} minutos en total).',
    Russian: '{name}: занятий {period} — {sessions} (всего минут: {minutes}).',
    Chinese: '{name}{period}学习了{sessions}次（共{minutes}分钟）。',
    Vietnamese: '{name} có {sessions} buổi học {period} (tổng cộng {minutes} phút).',
    Arabic: 'عدد جلسات {name} {period}: {sessions} (المجموع {minutes} دقيقة).',
    Somali: '{name} wuxuu yeeshay {sessions} fadhi {period} (wadarta {minutes} daqiiqo).',
    French: '{name} a eu {sessions} séances {period} ({minutes} minutes au total).',
    German: '{name} hatte {period} {sessions} Sitzungen ({minutes} Minuten insgesamt).',
  },
  'insight.activity.some_one': {
    English: '{name} had 1 session {period} ({minutes} minutes in total).',
    Spanish: '{name} tuvo 1 sesión {period} ({minutes} minutos en total).',
    Vietnamese: '{name} có 1 buổi học {period} (tổng cộng {minutes} phút).',
    Somali: '{name} wuxuu yeeshay 1 fadhi {period} (wadarta {minutes} daqiiqo).',
    French: '{name} a eu 1 séance {period} ({minutes} minutes au total).',
    German: '{name} hatte {period} 1 Sitzung ({minutes} Minuten insgesamt).',
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
    English: 'Accuracy {period}: {now}% across {problems} problems.',
    Spanish: 'Precisión {period}: {now}% en {problems} problemas.',
    Russian: 'Точность {period}: {now}% (задач: {problems}).',
    Chinese: '{period}的正确率：{now}%（共{problems}道题）。',
    Vietnamese: 'Độ chính xác {period}: {now}% trên {problems} bài.',
    Arabic: 'الدقة {period}: {now}% (عدد المسائل: {problems}).',
    Somali: 'Saxnaanta {period}: {now}% oo ka mid ah {problems} su’aalood.',
    French: 'Précision {period} : {now} % sur {problems} problèmes.',
    German: 'Genauigkeit {period}: {now} % bei {problems} Aufgaben.',
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
    English: '{name} mastered {count} new skills {period}!',
    Spanish: '¡{name} dominó {count} habilidades nuevas {period}!',
    Russian: '{name}: новых освоенных навыков {period} — {count}!',
    Chinese: '{name}{period}掌握了{count}项新技能！',
    Vietnamese: '{name} đã thành thạo {count} kỹ năng mới {period}!',
    Arabic: 'عدد المهارات الجديدة التي أتقنها {name} {period}: {count}!',
    Somali: '{name} wuxuu si buuxda u bartay {count} xirfadood oo cusub {period}!',
    French: '{name} a maîtrisé {count} nouvelles compétences {period} !',
    German: '{name} hat {period} {count} neue Fähigkeiten gemeistert!',
  },
  'insight.milestone_one': {
    English: '{name} mastered a new skill {period}!',
    Spanish: '¡{name} dominó una habilidad nueva {period}!',
    Vietnamese: '{name} đã thành thạo một kỹ năng mới {period}!',
    Somali: '{name} wuxuu si buuxda u bartay xirfad cusub {period}!',
    French: '{name} a maîtrisé une nouvelle compétence {period} !',
    German: '{name} hat {period} eine neue Fähigkeit gemeistert!',
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

  'insight.streak': {
    English: "{name} is on a {count}-day practice streak. That consistency is what makes learning stick!",
    Spanish: "{name} lleva {count} días seguidos practicando. ¡Esa constancia es lo que fija el aprendizaje!",
    Russian: "{name} занимается {count} дней подряд. Именно такая регулярность закрепляет знания!",
    Chinese: "{name}已经连续练习{count}天了。正是这种坚持让知识记得更牢！",
    Vietnamese: "{name} đã luyện tập {count} ngày liên tiếp. Chính sự đều đặn này giúp kiến thức được ghi nhớ!",
    Arabic: "يتدرّب {name} منذ {count} أيام متتالية. هذا الانتظام هو ما يرسّخ التعلّم!",
    Somali: "{name} wuxuu tababaranayay {count} maalmood oo isku xigta. Joogtaynta ayaa waxbarashada xasilisa!",
    French: "{name} s'entraîne depuis {count} jours d'affilée. C'est cette régularité qui ancre les apprentissages !",
    German: "{name} übt seit {count} Tagen am Stück. Genau diese Beständigkeit lässt das Gelernte sitzen!",
  },
  'insight.badges': {
    English: "{name} earned {count} new badges {period}!",
    Spanish: "¡{name} ganó {count} insignias nuevas {period}!",
    Russian: "{name}: новых значков {period} — {count}!",
    Chinese: "{name}{period}获得了{count}枚新徽章！",
    Vietnamese: "{name} đã nhận {count} huy hiệu mới {period}!",
    Arabic: "حصل {name} على شارات جديدة {period}: {count}!",
    Somali: "{name} wuxuu helay {count} calaamadood oo cusub {period}!",
    French: "{name} a gagné {count} nouveaux badges {period} !",
    German: "{name} hat {period} {count} neue Abzeichen verdient!",
  },
  'insight.badges_one': {
    English: "{name} earned a new badge {period}!",
    Spanish: "¡{name} ganó una insignia nueva {period}!",
    Russian: "{name}: новых значков {period} — 1!",
    Chinese: "{name}{period}获得了1枚新徽章！",
    Vietnamese: "{name} đã nhận 1 huy hiệu mới {period}!",
    Arabic: "حصل {name} على شارة جديدة {period}!",
    Somali: "{name} wuxuu helay calaamad cusub {period}!",
    French: "{name} a gagné un nouveau badge {period} !",
    German: "{name} hat {period} ein neues Abzeichen verdient!",
  },

  // -- Report email chrome (utils/parentReportEmail.js) --
  'email.subject': {
    English: "{name}'s math progress {period}",
    Spanish: "El progreso en matemáticas de {name} {period}",
    Russian: "Прогресс {name} по математике {period}",
    Chinese: "{name}{period}的数学进展",
    Vietnamese: "Tiến bộ môn toán của {name} {period}",
    Arabic: "تقدّم {name} في الرياضيات {period}",
    Somali: "Horumarka xisaabta {name} {period}",
    French: "Les progrès en maths de {name} {period}",
    German: "Mathe-Fortschritt von {name} {period}",
  },
  'email.greeting': {
    English: "Hi {parent},",
    Spanish: "Hola, {parent}:",
    Russian: "Здравствуйте, {parent}!",
    Chinese: "{parent}，您好：",
    Vietnamese: "Chào {parent},",
    Arabic: "مرحبًا {parent}،",
    Somali: "Salaan {parent},",
    French: "Bonjour {parent},",
    German: "Hallo {parent},",
  },
  'email.intro': {
    English: "Here's how {name} did in math {period}:",
    Spanish: "Así le fue a {name} en matemáticas {period}:",
    Russian: "Вот как {name} занимался математикой {period}:",
    Chinese: "以下是{name}{period}的数学学习情况：",
    Vietnamese: "Đây là kết quả học toán của {name} {period}:",
    Arabic: "إليك أداء {name} في الرياضيات {period}:",
    Somali: "Waa sidan sida uu {name} u sameeyay xisaabta {period}:",
    French: "Voici comment {name} s'en est sorti en maths {period} :",
    German: "So lief es für {name} in Mathe {period}:",
  },
  'email.insights': {
    English: "Key insights",
    Spanish: "Puntos clave",
    Russian: "Главное",
    Chinese: "关键洞察",
    Vietnamese: "Điểm chính",
    Arabic: "أبرز الملاحظات",
    Somali: "Aragtiyo muhiim ah",
    French: "Points clés",
    German: "Das Wichtigste",
  },
  'email.glance': {
    English: "At a glance",
    Spanish: "De un vistazo",
    Russian: "Кратко",
    Chinese: "概览",
    Vietnamese: "Tóm tắt",
    Arabic: "لمحة سريعة",
    Somali: "Muuqaal kooban",
    French: "En bref",
    German: "Auf einen Blick",
  },
  'email.stat.sessions': {
    English: "Sessions",
    Spanish: "Sesiones",
    Russian: "Занятия",
    Chinese: "学习次数",
    Vietnamese: "Buổi học",
    Arabic: "الجلسات",
    Somali: "Fadhiyo",
    French: "Séances",
    German: "Sitzungen",
  },
  'email.stat.minutes': {
    English: "Minutes",
    Spanish: "Minutos",
    Russian: "Минуты",
    Chinese: "分钟",
    Vietnamese: "Phút",
    Arabic: "الدقائق",
    Somali: "Daqiiqado",
    French: "Minutes",
    German: "Minuten",
  },
  'email.stat.problems': {
    English: "Problems checked",
    Spanish: "Problemas revisados",
    Russian: "Проверено задач",
    Chinese: "已批改题目",
    Vietnamese: "Bài đã chấm",
    Arabic: "المسائل المصحَّحة",
    Somali: "Su’aalo la hubiyay",
    French: "Problèmes vérifiés",
    German: "Geprüfte Aufgaben",
  },
  'email.stat.accuracy': {
    English: "Accuracy",
    Spanish: "Precisión",
    Russian: "Точность",
    Chinese: "正确率",
    Vietnamese: "Độ chính xác",
    Arabic: "الدقة",
    Somali: "Saxnaanta",
    French: "Précision",
    German: "Genauigkeit",
  },
  'email.skills': {
    English: "Practiced skills: {mastered} mastered, {inProgress} in progress, {review} need review.",
    Spanish: "Habilidades practicadas: {mastered} dominadas, {inProgress} en progreso, {review} para repasar.",
    Russian: "Отработанные навыки — освоено: {mastered}, в процессе: {inProgress}, повторить: {review}.",
    Chinese: "已练技能：掌握{mastered}项，进行中{inProgress}项，需复习{review}项。",
    Vietnamese: "Kỹ năng đã luyện: {mastered} thành thạo, {inProgress} đang học, {review} cần ôn lại.",
    Arabic: "المهارات المتدرَّب عليها: متقنة {mastered}، قيد التعلّم {inProgress}، تحتاج مراجعة {review}.",
    Somali: "Xirfadaha la tababaray: {mastered} la xafiday, {inProgress} socda, {review} u baahan dib-u-eegis.",
    French: "Compétences travaillées : {mastered} maîtrisées, {inProgress} en cours, {review} à revoir.",
    German: "Geübte Fähigkeiten: {mastered} gemeistert, {inProgress} in Arbeit, {review} zu wiederholen.",
  },
  'email.placed': {
    English: "Plus {n} skills placed out of by the placement test.",
    Spanish: "Además, {n} habilidades superadas en la prueba de nivel.",
    Russian: "Плюс зачтено по входному тесту: {n}.",
    Chinese: "另有{n}项技能通过分级测试免修。",
    Vietnamese: "Ngoài ra còn {n} kỹ năng được miễn qua bài kiểm tra xếp lớp.",
    Arabic: "بالإضافة إلى {n} مهارات تم تجاوزها في اختبار تحديد المستوى.",
    Somali: "Iyo {n} xirfadood oo laga gudbay imtixaanka heerka.",
    French: "Plus {n} compétences validées par le test de positionnement.",
    German: "Dazu {n} Fähigkeiten, die der Einstufungstest bereits abdeckt.",
  },
  'email.strengths': {
    English: "Strengths",
    Spanish: "Fortalezas",
    Russian: "Сильные стороны",
    Chinese: "优势",
    Vietnamese: "Điểm mạnh",
    Arabic: "نقاط القوة",
    Somali: "Awoodaha",
    French: "Points forts",
    German: "Stärken",
  },
  'email.review': {
    English: "Worth a review",
    Spanish: "Conviene repasar",
    Russian: "Стоит повторить",
    Chinese: "值得复习",
    Vietnamese: "Nên ôn lại",
    Arabic: "تستحق المراجعة",
    Somali: "Mudan dib-u-eegis",
    French: "À revoir",
    German: "Zum Wiederholen",
  },
  'email.cta': {
    English: "Open the parent dashboard",
    Spanish: "Abrir el panel para padres",
    Russian: "Открыть панель для родителей",
    Chinese: "打开家长面板",
    Vietnamese: "Mở trang dành cho phụ huynh",
    Arabic: "افتح لوحة أولياء الأمور",
    Somali: "Fur shaashadda waalidka",
    French: "Ouvrir le tableau de bord parent",
    German: "Eltern-Dashboard öffnen",
  },
  'email.footer': {
    English: "You're getting this because progress emails are on. Change how often, or turn them off, in Settings → Report frequency.",
    Spanish: "Recibe este correo porque los informes de progreso están activados. Cambie la frecuencia, o desactívelos, en Configuración → Frecuencia de informes.",
    Russian: "Вы получаете это письмо, потому что включены отчёты о прогрессе. Изменить частоту или отключить их можно в разделе «Настройки» → «Частота отчётов».",
    Chinese: "您收到此邮件是因为已开启进度报告。可在“设置”→“报告频率”中更改频率或关闭。",
    Vietnamese: "Bạn nhận được email này vì đã bật báo cáo tiến độ. Đổi tần suất, hoặc tắt, trong Cài đặt → Tần suất báo cáo.",
    Arabic: "تصلك هذه الرسالة لأن رسائل التقدّم مفعّلة. يمكنك تغيير عدد مرات الإرسال أو إيقافها من الإعدادات ← تكرار التقارير.",
    Somali: "Waxaad helaysaa tan sababtoo ah iimaylada horumarku way shidan yihiin. Beddel inta jeer, ama dami, gudaha Dejinta → Inta jeer ee warbixinta.",
    French: "Vous recevez ce message parce que les e-mails de suivi sont activés. Modifiez leur fréquence, ou désactivez-les, dans Paramètres → Fréquence des rapports.",
    German: "Sie erhalten diese E-Mail, weil Fortschrittsberichte aktiviert sind. Häufigkeit ändern oder abschalten unter Einstellungen → Berichtshäufigkeit.",
  },
};

// "in the last N days" — the report window. The digest covers 1, 7, 14 or 30
// days (utils/reportFrequency), so every sentence carries {period} rather than a
// hard-coded 7. One day reads as "the last day"; Arabic spells its numbers.
const PERIOD = {
  English: (n) => (n === 1 ? 'in the last day' : `in the last ${n} days`),
  Spanish: (n) => (n === 1 ? 'en el último día' : `en los últimos ${n} días`),
  Russian: (n) => (n === 1 ? 'за последний день' : `за последние ${n} дней`),
  Chinese: (n) => `在过去${n}天里`,
  Vietnamese: (n) => (n === 1 ? 'trong ngày qua' : `trong ${n} ngày qua`),
  Arabic: (n) => ({ 1: 'خلال اليوم الماضي', 7: 'خلال الأيام السبعة الماضية', 14: 'خلال الأربعة عشر يومًا الماضية', 30: 'خلال الثلاثين يومًا الماضية' }[n] || `خلال آخر ${n} يومًا`),
  Somali: (n) => (n === 1 ? 'maalintii la soo dhaafay' : `${n}-dii maalmood ee la soo dhaafay`),
  French: (n) => (n === 1 ? 'ces dernières 24 heures' : `ces ${n} derniers jours`),
  German: (n) => (n === 1 ? 'am letzten Tag' : `in den letzten ${n} Tagen`),
};

function periodPhrase(days = 7, lang = 'English') {
  const L = normalizeLanguage(lang);
  const n = Number.isFinite(Number(days)) && Number(days) > 0 ? Math.round(Number(days)) : 7;
  return PERIOD[L](n);
}

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
  const all = { period: periodPhrase(params.days, L), ...params };
  return template.replace(/\{(\w+)\}/g, (m, p) => (all[p] != null ? String(all[p]) : ''));
}

module.exports = { renderMessage, listOf, normalizeLanguage, periodPhrase, MESSAGES, LANGS };
