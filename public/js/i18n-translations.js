// ============================================
// UI TRANSLATION DATA
// Maps every data-i18n key to each supported language.
// Matches the preferredLanguage enum on the User model:
//   English | Spanish | Russian | Chinese | Vietnamese | Arabic | Somali | French | German
// ============================================

window.I18N_TRANSLATIONS = {

  /* ─── Navigation / Header ─── */
  'nav.logout': {
    English: 'Logout', Spanish: 'Cerrar sesión', Russian: 'Выйти', Chinese: '退出',
    Vietnamese: 'Đăng xuất', Arabic: 'تسجيل الخروج', Somali: 'Ka bax', French: 'Déconnexion', German: 'Abmelden'
  },
  'nav.logOut': {
    English: 'Log Out', Spanish: 'Cerrar sesión', Russian: 'Выйти', Chinese: '退出登录',
    Vietnamese: 'Đăng xuất', Arabic: 'تسجيل الخروج', Somali: 'Ka bax', French: 'Se déconnecter', German: 'Abmelden'
  },
  'nav.settings': {
    English: 'Settings', Spanish: 'Configuración', Russian: 'Настройки', Chinese: '设置',
    Vietnamese: 'Cài đặt', Arabic: 'الإعدادات', Somali: 'Dejinta', French: 'Paramètres', German: 'Einstellungen'
  },
  'nav.resources': {
    English: 'Resources', Spanish: 'Recursos', Russian: 'Ресурсы', Chinese: '学习资源',
    Vietnamese: 'Tài nguyên', Arabic: 'الموارد', Somali: 'Agabka', French: 'Ressources', German: 'Ressourcen'
  },
  'nav.shareProgress': {
    English: 'Share Progress', Spanish: 'Compartir progreso', Russian: 'Поделиться прогрессом', Chinese: '分享进度',
    Vietnamese: 'Chia sẻ tiến trình', Arabic: 'مشاركة التقدم', Somali: 'Wadaag horumarkaaga', French: 'Partager les progrès', German: 'Fortschritt teilen'
  },
  'nav.feedback': {
    English: 'Feedback', Spanish: 'Comentarios', Russian: 'Обратная связь', Chinese: '反馈',
    Vietnamese: 'Phản hồi', Arabic: 'ملاحظات', Somali: 'Jawaab celin', French: 'Commentaires', German: 'Feedback'
  },
  'nav.signUp': {
    English: 'Sign Up', Spanish: 'Registrarse', Russian: 'Регистрация', Chinese: '注册',
    Vietnamese: 'Đăng ký', Arabic: 'إنشاء حساب', Somali: 'Isdiiwaangeli', French: 'S\'inscrire', German: 'Registrieren'
  },
  'nav.more': {
    English: 'More', Spanish: 'Más', Russian: 'Ещё', Chinese: '更多',
    Vietnamese: 'Thêm', Arabic: 'المزيد', Somali: 'Wax dheeraad ah', French: 'Plus', German: 'Mehr'
  },
  'nav.darkMode': {
    English: 'Toggle dark mode', Spanish: 'Alternar modo oscuro', Russian: 'Переключить тёмный режим', Chinese: '切换深色模式',
    Vietnamese: 'Chuyển đổi chế độ tối', Arabic: 'تبديل الوضع الداكن', Somali: 'Beddel habka mugdiga', French: 'Basculer le mode sombre', German: 'Dunkelmodus umschalten'
  },
  'nav.home': {
    English: 'Home', Spanish: 'Inicio', Russian: 'Главная', Chinese: '首页',
    Vietnamese: 'Trang chủ', Arabic: 'الرئيسية', Somali: 'Bogga hore', French: 'Accueil', German: 'Startseite'
  },

  /* ─── Login page ─── */
  'login.welcomeBack': {
    English: 'Welcome Back!', Spanish: '¡Bienvenido de nuevo!', Russian: 'С возвращением!', Chinese: '欢迎回来！',
    Vietnamese: 'Chào mừng trở lại!', Arabic: 'مرحبًا بعودتك!', Somali: 'Ku soo dhawoow!', French: 'Bon retour !', German: 'Willkommen zurück!'
  },
  'login.subtitle': {
    English: 'Log in to continue your learning journey.', Spanish: 'Inicia sesión para continuar tu aventura de aprendizaje.',
    Russian: 'Войдите, чтобы продолжить обучение.', Chinese: '登录以继续你的学习之旅。',
    Vietnamese: 'Đăng nhập để tiếp tục hành trình học tập.', Arabic: 'سجّل الدخول لمواصلة رحلتك التعليمية.',
    Somali: 'Gal si aad u sii waddo waxbarashadaada.', French: 'Connectez-vous pour continuer votre apprentissage.',
    German: 'Melden Sie sich an, um Ihre Lernreise fortzusetzen.'
  },
  'login.email': {
    English: 'Email Address', Spanish: 'Correo electrónico', Russian: 'Электронная почта', Chinese: '电子邮箱',
    Vietnamese: 'Địa chỉ email', Arabic: 'عنوان البريد الإلكتروني', Somali: 'Cinwaanka iimaylka', French: 'Adresse e-mail', German: 'E-Mail-Adresse'
  },
  'login.password': {
    English: 'Password', Spanish: 'Contraseña', Russian: 'Пароль', Chinese: '密码',
    Vietnamese: 'Mật khẩu', Arabic: 'كلمة المرور', Somali: 'Furaha sirta', French: 'Mot de passe', German: 'Passwort'
  },
  'login.forgotPassword': {
    English: 'Forgot Password?', Spanish: '¿Olvidaste tu contraseña?', Russian: 'Забыли пароль?', Chinese: '忘记密码？',
    Vietnamese: 'Quên mật khẩu?', Arabic: 'نسيت كلمة المرور؟', Somali: 'Ma illowday furaha sirta?', French: 'Mot de passe oublié ?', German: 'Passwort vergessen?'
  },
  'login.logIn': {
    English: 'Log In', Spanish: 'Iniciar sesión', Russian: 'Войти', Chinese: '登录',
    Vietnamese: 'Đăng nhập', Arabic: 'تسجيل الدخول', Somali: 'Gal', French: 'Se connecter', German: 'Anmelden'
  },
  'login.or': {
    English: 'OR', Spanish: 'O', Russian: 'ИЛИ', Chinese: '或',
    Vietnamese: 'HOẶC', Arabic: 'أو', Somali: 'AMA', French: 'OU', German: 'ODER'
  },
  'login.continueGoogle': {
    English: 'Continue with Google', Spanish: 'Continuar con Google', Russian: 'Продолжить через Google', Chinese: '使用 Google 继续',
    Vietnamese: 'Tiếp tục với Google', Arabic: 'المتابعة عبر Google', Somali: 'Ku sii wad Google', French: 'Continuer avec Google', German: 'Weiter mit Google'
  },
  'login.continueMicrosoft': {
    English: 'Continue with Microsoft', Spanish: 'Continuar con Microsoft', Russian: 'Продолжить через Microsoft', Chinese: '使用 Microsoft 继续',
    Vietnamese: 'Tiếp tục với Microsoft', Arabic: 'المتابعة عبر Microsoft', Somali: 'Ku sii wad Microsoft', French: 'Continuer avec Microsoft', German: 'Weiter mit Microsoft'
  },
  'login.loginClever': {
    English: 'Log in with Clever', Spanish: 'Iniciar sesión con Clever', Russian: 'Войти через Clever', Chinese: '使用 Clever 登录',
    Vietnamese: 'Đăng nhập với Clever', Arabic: 'تسجيل الدخول عبر Clever', Somali: 'Ku gal Clever', French: 'Se connecter avec Clever', German: 'Mit Clever anmelden'
  },
  'login.noAccount': {
    English: "Don't have an account?", Spanish: '¿No tienes cuenta?', Russian: 'Нет аккаунта?', Chinese: '还没有账户？',
    Vietnamese: 'Chưa có tài khoản?', Arabic: 'ليس لديك حساب؟', Somali: 'Ma haysatid akoon?', French: 'Pas de compte ?', German: 'Noch kein Konto?'
  },
  'login.createAccount': {
    English: 'Create an account', Spanish: 'Crear una cuenta', Russian: 'Создать аккаунт', Chinese: '创建账户',
    Vietnamese: 'Tạo tài khoản', Arabic: 'إنشاء حساب', Somali: 'Samee akoon', French: 'Créer un compte', German: 'Konto erstellen'
  },
  'login.tryDemo': {
    English: 'Try the Interactive Demo', Spanish: 'Probar la demo interactiva', Russian: 'Попробовать демо', Chinese: '试试互动演示',
    Vietnamese: 'Thử bản demo tương tác', Arabic: 'جرّب العرض التفاعلي', Somali: 'Tijaabi demo-ga', French: 'Essayer la démo', German: 'Interaktive Demo testen'
  },
  'login.demoNote': {
    English: 'No account needed. Explore as a teacher, parent, or student.',
    Spanish: 'No se necesita cuenta. Explora como maestro, padre o estudiante.',
    Russian: 'Аккаунт не нужен. Попробуйте в роли учителя, родителя или ученика.',
    Chinese: '无需账户。以教师、家长或学生身份探索。',
    Vietnamese: 'Không cần tài khoản. Khám phá với tư cách giáo viên, phụ huynh hoặc học sinh.',
    Arabic: 'لا يلزم حساب. استكشف كمعلّم أو ولي أمر أو طالب.',
    Somali: 'Akoon lama baahna. Sahami sida macalin, waalid, ama arday.',
    French: 'Aucun compte requis. Explorez en tant qu\'enseignant, parent ou élève.',
    German: 'Kein Konto nötig. Entdecken Sie als Lehrer, Elternteil oder Schüler.'
  },
  'login.emailPlaceholder': {
    English: 'Enter your email', Spanish: 'Ingresa tu correo electrónico', Russian: 'Введите электронную почту', Chinese: '输入电子邮箱',
    Vietnamese: 'Nhập email của bạn', Arabic: 'أدخل بريدك الإلكتروني', Somali: 'Geli iimaylkaaga', French: 'Entrez votre e-mail', German: 'E-Mail eingeben'
  },
  'login.passwordPlaceholder': {
    English: 'Enter your password', Spanish: 'Ingresa tu contraseña', Russian: 'Введите пароль', Chinese: '输入密码',
    Vietnamese: 'Nhập mật khẩu', Arabic: 'أدخل كلمة المرور', Somali: 'Geli furaha sirta', French: 'Entrez votre mot de passe', German: 'Passwort eingeben'
  },

  /* ─── Signup page ─── */
  'signup.createAccount': {
    English: 'Create Your Account', Spanish: 'Crea tu cuenta', Russian: 'Создайте аккаунт', Chinese: '创建你的账户',
    Vietnamese: 'Tạo tài khoản', Arabic: 'أنشئ حسابك', Somali: 'Samee akoonkaaga', French: 'Créez votre compte', German: 'Erstellen Sie Ihr Konto'
  },
  'signup.subtitle': {
    English: 'Join the future of math learning.', Spanish: 'Únete al futuro del aprendizaje matemático.',
    Russian: 'Присоединяйтесь к будущему математического образования.', Chinese: '加入数学学习的未来。',
    Vietnamese: 'Tham gia tương lai của việc học toán.', Arabic: 'انضم إلى مستقبل تعلّم الرياضيات.',
    Somali: 'Ku biir mustaqbalka barashada xisaabta.', French: 'Rejoignez le futur de l\'apprentissage des maths.',
    German: 'Treten Sie der Zukunft des Mathelernens bei.'
  },
  'signup.firstName': {
    English: 'First Name', Spanish: 'Nombre', Russian: 'Имя', Chinese: '名',
    Vietnamese: 'Tên', Arabic: 'الاسم الأول', Somali: 'Magaca hore', French: 'Prénom', German: 'Vorname'
  },
  'signup.lastName': {
    English: 'Last Name', Spanish: 'Apellido', Russian: 'Фамилия', Chinese: '姓',
    Vietnamese: 'Họ', Arabic: 'الاسم الأخير', Somali: 'Magaca dambe', French: 'Nom', German: 'Nachname'
  },
  'signup.email': {
    English: 'Email Address', Spanish: 'Correo electrónico', Russian: 'Электронная почта', Chinese: '电子邮箱',
    Vietnamese: 'Địa chỉ email', Arabic: 'البريد الإلكتروني', Somali: 'Ciwaanka emailka', French: 'Adresse e-mail', German: 'E-Mail-Adresse'
  },
  'signup.username': {
    English: 'Username', Spanish: 'Nombre de usuario', Russian: 'Имя пользователя', Chinese: '用户名',
    Vietnamese: 'Tên đăng nhập', Arabic: 'اسم المستخدم', Somali: 'Magaca isticmaalaha', French: 'Nom d\'utilisateur', German: 'Benutzername'
  },
  'signup.password': {
    English: 'Password', Spanish: 'Contraseña', Russian: 'Пароль', Chinese: '密码',
    Vietnamese: 'Mật khẩu', Arabic: 'كلمة المرور', Somali: 'Furaha sirta', French: 'Mot de passe', German: 'Passwort'
  },
  'signup.confirmPassword': {
    English: 'Confirm Password', Spanish: 'Confirmar contraseña', Russian: 'Подтвердите пароль', Chinese: '确认密码',
    Vietnamese: 'Xác nhận mật khẩu', Arabic: 'تأكيد كلمة المرور', Somali: 'Xaqiiji furaha sirta', French: 'Confirmer le mot de passe', German: 'Passwort bestätigen'
  },
  'signup.enrollmentCode': {
    English: 'Enrollment Code', Spanish: 'Código de inscripción', Russian: 'Код регистрации', Chinese: '注册码',
    Vietnamese: 'Mã đăng ký', Arabic: 'رمز التسجيل', Somali: 'Koodhka diiwaangelinta', French: 'Code d\'inscription', German: 'Anmeldecode'
  },
  'signup.enrollmentNote': {
    English: 'A valid enrollment code is required to create an account.',
    Spanish: 'Se requiere un código de inscripción válido para crear una cuenta.',
    Russian: 'Для создания аккаунта необходим действующий код регистрации.',
    Chinese: '创建账户需要有效的注册码。',
    Vietnamese: 'Cần mã đăng ký hợp lệ để tạo tài khoản.',
    Arabic: 'يلزم رمز تسجيل صالح لإنشاء حساب.',
    Somali: 'Waxaa loo baahan yahay koodh diiwaangelin oo sax ah si aad u samaysato akoon.',
    French: 'Un code d\'inscription valide est requis pour créer un compte.',
    German: 'Ein gültiger Anmeldecode ist erforderlich, um ein Konto zu erstellen.'
  },
  'signup.iAmA': {
    English: 'I am a', Spanish: 'Soy', Russian: 'Я', Chinese: '我是',
    Vietnamese: 'Tôi là', Arabic: 'أنا', Somali: 'Waxaan ahay', French: 'Je suis', German: 'Ich bin'
  },
  'signup.student': {
    English: 'Student', Spanish: 'Estudiante', Russian: 'Ученик', Chinese: '学生',
    Vietnamese: 'Học sinh', Arabic: 'طالب', Somali: 'Arday', French: 'Élève', German: 'Schüler'
  },
  'signup.parent': {
    English: 'Parent', Spanish: 'Padre/Madre', Russian: 'Родитель', Chinese: '家长',
    Vietnamese: 'Phụ huynh', Arabic: 'ولي أمر', Somali: 'Waalid', French: 'Parent', German: 'Elternteil'
  },
  'signup.createBtn': {
    English: 'Create Account', Spanish: 'Crear cuenta', Russian: 'Создать аккаунт', Chinese: '创建账户',
    Vietnamese: 'Tạo tài khoản', Arabic: 'إنشاء حساب', Somali: 'Samee akoon', French: 'Créer un compte', German: 'Konto erstellen'
  },
  'signup.haveAccount': {
    English: 'Already have an account?', Spanish: '¿Ya tienes cuenta?', Russian: 'Уже есть аккаунт?', Chinese: '已有账户？',
    Vietnamese: 'Đã có tài khoản?', Arabic: 'لديك حساب بالفعل؟', Somali: 'Hore ma u leedahay akoon?', French: 'Déjà un compte ?', German: 'Bereits ein Konto?'
  },
  'signup.logInHere': {
    English: 'Log in here', Spanish: 'Inicia sesión aquí', Russian: 'Войти здесь', Chinese: '在此登录',
    Vietnamese: 'Đăng nhập tại đây', Arabic: 'سجّل الدخول هنا', Somali: 'Halkan ka gal', French: 'Connectez-vous ici', German: 'Hier anmelden'
  },
  'signup.childInviteCode': {
    English: "Child's Invite Code (Optional)", Spanish: 'Código de invitación del hijo (Opcional)',
    Russian: 'Код приглашения ребёнка (необязательно)', Chinese: '孩子的邀请码（可选）',
    Vietnamese: 'Mã mời của con (Tùy chọn)', Arabic: 'رمز دعوة الطفل (اختياري)',
    Somali: 'Koodhka martiqaadka ilmaha (Ikhtiyaari)', French: 'Code d\'invitation de l\'enfant (Facultatif)',
    German: 'Einladungscode des Kindes (Optional)'
  },
  'signup.parentInviteCode': {
    English: "Parent's Invite Code (Optional)", Spanish: 'Código de invitación del padre (Opcional)',
    Russian: 'Код приглашения родителя (необязательно)', Chinese: '家长邀请码（可选）',
    Vietnamese: 'Mã mời của phụ huynh (Tùy chọn)', Arabic: 'رمز دعوة ولي الأمر (اختياري)',
    Somali: 'Koodhka martiqaadka waalidka (Ikhtiyaari)', French: 'Code d\'invitation du parent (Facultatif)',
    German: 'Einladungscode des Elternteils (Optional)'
  },

  /* ─── Student Dashboard ─── */
  'dash.welcomeBack': {
    English: 'Welcome back, ', Spanish: '¡Bienvenido/a, ', Russian: 'С возвращением, ', Chinese: '欢迎回来，',
    Vietnamese: 'Chào mừng trở lại, ', Arabic: 'مرحبًا بعودتك، ', Somali: 'Ku soo dhawoow, ', French: 'Bon retour, ', German: 'Willkommen zurück, '
  },
  'dash.readyToLearn': {
    English: 'Ready to learn?', Spanish: '¿Listo para aprender?', Russian: 'Готовы учиться?', Chinese: '准备好学习了吗？',
    Vietnamese: 'Sẵn sàng học chưa?', Arabic: 'مستعدّ للتعلّم؟', Somali: 'Ma diyaar u tahay inaad wax barato?', French: 'Prêt à apprendre ?', German: 'Bereit zum Lernen?'
  },
  'dash.continueLearning': {
    English: 'Continue Learning', Spanish: 'Continuar aprendiendo', Russian: 'Продолжить обучение', Chinese: '继续学习',
    Vietnamese: 'Tiếp tục học', Arabic: 'متابعة التعلّم', Somali: 'Sii wad waxbarashada', French: 'Continuer à apprendre', German: 'Weiterlernen'
  },
  'dash.pickUpWhereYouLeftOff': {
    English: 'Pick up where you left off', Spanish: 'Retoma donde lo dejaste', Russian: 'Продолжите с того места, где остановились', Chinese: '从上次的进度继续',
    Vietnamese: 'Tiếp tục từ nơi bạn đã dừng', Arabic: 'تابع من حيث توقفت', Somali: 'Ka sii wad meeshii aad ka joogsatay', French: 'Reprenez là où vous vous étiez arrêté', German: 'Dort weitermachen, wo Sie aufgehört haben'
  },
  'dash.continue': {
    English: 'Continue', Spanish: 'Continuar', Russian: 'Продолжить', Chinese: '继续',
    Vietnamese: 'Tiếp tục', Arabic: 'متابعة', Somali: 'Sii wad', French: 'Continuer', German: 'Weiter'
  },
  'dash.dayStreak': {
    English: 'Day Streak', Spanish: 'Racha de días', Russian: 'Дни подряд', Chinese: '连续天数',
    Vietnamese: 'Chuỗi ngày', Arabic: 'سلسلة الأيام', Somali: 'Taxanaha maalmaha', French: 'Jours consécutifs', German: 'Tages-Serie'
  },
  'dash.dailyQuest': {
    English: 'Daily Quest', Spanish: 'Misión diaria', Russian: 'Ежедневное задание', Chinese: '每日任务',
    Vietnamese: 'Nhiệm vụ hàng ngày', Arabic: 'مهمة يومية', Somali: 'Hawsha maalinlaha', French: 'Quête quotidienne', German: 'Tägliche Aufgabe'
  },
  'dash.thisWeek': {
    English: 'This Week', Spanish: 'Esta semana', Russian: 'На этой неделе', Chinese: '本周',
    Vietnamese: 'Tuần này', Arabic: 'هذا الأسبوع', Somali: 'Toddobaadkan', French: 'Cette semaine', German: 'Diese Woche'
  },
  'dash.problems': {
    English: 'Problems', Spanish: 'Problemas', Russian: 'Задач', Chinese: '题目',
    Vietnamese: 'Bài tập', Arabic: 'مسائل', Somali: 'Xisaabaadka', French: 'Problèmes', German: 'Aufgaben'
  },
  'dash.accuracy': {
    English: 'Accuracy', Spanish: 'Precisión', Russian: 'Точность', Chinese: '正确率',
    Vietnamese: 'Độ chính xác', Arabic: 'الدقة', Somali: 'Saxnaanta', French: 'Précision', German: 'Genauigkeit'
  },
  'dash.xpEarned': {
    English: 'XP Earned', Spanish: 'XP ganados', Russian: 'Заработано XP', Chinese: '获得经验',
    Vietnamese: 'XP kiếm được', Arabic: 'XP مكتسبة', Somali: 'XP la helay', French: 'XP gagnés', German: 'XP verdient'
  },
  'dash.skills': {
    English: 'Skills', Spanish: 'Habilidades', Russian: 'Навыки', Chinese: '技能',
    Vietnamese: 'Kỹ năng', Arabic: 'المهارات', Somali: 'Xirfadaha', French: 'Compétences', German: 'Fähigkeiten'
  },
  'dash.recentProgress': {
    English: 'Recent Progress', Spanish: 'Progreso reciente', Russian: 'Последний прогресс', Chinese: '近期进展',
    Vietnamese: 'Tiến trình gần đây', Arabic: 'التقدم الأخير', Somali: 'Horumarki dhowaa', French: 'Progrès récents', German: 'Aktueller Fortschritt'
  },
  'dash.viewAllProgress': {
    English: 'View All Progress', Spanish: 'Ver todo el progreso', Russian: 'Посмотреть весь прогресс', Chinese: '查看全部进度',
    Vietnamese: 'Xem tất cả tiến trình', Arabic: 'عرض كل التقدم', Somali: 'Arag horumarkaaga oo dhan', French: 'Voir tous les progrès', German: 'Gesamten Fortschritt anzeigen'
  },
  'dash.findStartingPoint': {
    English: 'Find Your Starting Point', Spanish: 'Encuentra tu punto de partida', Russian: 'Найдите свою отправную точку', Chinese: '找到你的起点',
    Vietnamese: 'Tìm điểm bắt đầu', Arabic: 'اكتشف نقطة انطلاقك', Somali: 'Hel meesha aad ka bilaabayso', French: 'Trouvez votre point de départ', German: 'Finden Sie Ihren Startpunkt'
  },
  'dash.letsGo': {
    English: "Let's Go", Spanish: '¡Vamos!', Russian: 'Начнём!', Chinese: '开始吧',
    Vietnamese: 'Bắt đầu thôi', Arabic: 'هيا بنا', Somali: 'Aan bilowno', French: 'C\'est parti', German: 'Los geht\'s'
  },
  'dash.justChatInstead': {
    English: 'Just Chat Instead', Spanish: 'Solo chatear', Russian: 'Просто пообщаться', Chinese: '直接聊天',
    Vietnamese: 'Chỉ trò chuyện thôi', Arabic: 'الدردشة فقط', Somali: 'Sheekayso oo keliya', French: 'Juste discuter', German: 'Einfach chatten'
  },
  'dash.chatWithTutor': {
    English: 'Chat with Tutor', Spanish: 'Chatear con el tutor', Russian: 'Чат с репетитором', Chinese: '与导师聊天',
    Vietnamese: 'Trò chuyện với gia sư', Arabic: 'الدردشة مع المعلّم', Somali: 'La sheekayso bare', French: 'Discuter avec le tuteur', German: 'Mit Tutor chatten'
  },
  'dash.viewProgress': {
    English: 'View Progress', Spanish: 'Ver progreso', Russian: 'Посмотреть прогресс', Chinese: '查看进度',
    Vietnamese: 'Xem tiến trình', Arabic: 'عرض التقدم', Somali: 'Arag horumarkaaga', French: 'Voir les progrès', German: 'Fortschritt anzeigen'
  },
  'dash.joinAClass': {
    English: 'Join a Class', Spanish: 'Unirse a una clase', Russian: 'Присоединиться к классу', Chinese: '加入班级',
    Vietnamese: 'Tham gia lớp học', Arabic: 'الانضمام إلى فصل', Somali: 'Ku biir fasalka', French: 'Rejoindre une classe', German: 'Einer Klasse beitreten'
  },
  'dash.enterClassCode': {
    English: 'Enter the class code your teacher gave you to connect.',
    Spanish: 'Ingresa el código de clase que te dio tu maestro.',
    Russian: 'Введите код класса, который дал вам учитель.',
    Chinese: '输入老师给你的班级代码。',
    Vietnamese: 'Nhập mã lớp mà giáo viên đã cung cấp cho bạn.',
    Arabic: 'أدخل رمز الفصل الذي أعطاك إياه المعلّم.',
    Somali: 'Geli koodhka fasalka ee macallinkaagu ku siiyay.',
    French: 'Entrez le code de classe donné par votre enseignant.',
    German: 'Geben Sie den Klassencode ein, den Ihnen Ihr Lehrer gegeben hat.'
  },
  'dash.join': {
    English: 'Join', Spanish: 'Unirse', Russian: 'Присоединиться', Chinese: '加入',
    Vietnamese: 'Tham gia', Arabic: 'انضمام', Somali: 'Ku biir', French: 'Rejoindre', German: 'Beitreten'
  },
  'dash.confirmJoin': {
    English: 'Confirm & Join', Spanish: 'Confirmar y unirse', Russian: 'Подтвердить и присоединиться', Chinese: '确认并加入',
    Vietnamese: 'Xác nhận và tham gia', Arabic: 'تأكيد والانضمام', Somali: 'Xaqiiji & ku biir', French: 'Confirmer et rejoindre', German: 'Bestätigen & beitreten'
  },
  'dash.assessmentPrompt': {
    English: 'A quick 10-15 minute check-in helps me understand where you\'re at and suggest what to work on next.',
    Spanish: 'Una evaluación rápida de 10-15 minutos me ayuda a entender dónde estás y sugerir qué trabajar a continuación.',
    Russian: 'Быстрая проверка на 10-15 минут поможет мне понять ваш уровень и предложить, над чем работать дальше.',
    Chinese: '10-15分钟的快速测评帮助我了解你的水平，并建议下一步学什么。',
    Vietnamese: 'Bài kiểm tra nhanh 10-15 phút giúp tôi hiểu trình độ của bạn và đề xuất bước tiếp theo.',
    Arabic: 'تقييم سريع مدته 10-15 دقيقة يساعدني في فهم مستواك واقتراح ما يجب العمل عليه.',
    Somali: 'Imtixaan kooban oo 10-15 daqiiqo ah ayaa iga caawiya inaan fahmo halkaad joogto.',
    French: 'Un bilan rapide de 10-15 minutes m\'aide à comprendre votre niveau et à suggérer la suite.',
    German: 'Ein kurzer 10-15-minütiger Check hilft mir, Ihren Stand zu verstehen und nächste Schritte vorzuschlagen.'
  },

  /* ─── Chat / Sidebar ─── */
  'chat.myCourses': {
    English: 'My Courses', Spanish: 'Mis cursos', Russian: 'Мои курсы', Chinese: '我的课程',
    Vietnamese: 'Khóa học của tôi', Arabic: 'دوراتي', Somali: 'Koorsooyinkayga', French: 'Mes cours', German: 'Meine Kurse'
  },
  'chat.browseCourses': {
    English: 'Browse Courses', Spanish: 'Explorar cursos', Russian: 'Обзор курсов', Chinese: '浏览课程',
    Vietnamese: 'Duyệt khóa học', Arabic: 'تصفّح الدورات', Somali: 'Baadh koorsooyinka', French: 'Parcourir les cours', German: 'Kurse durchsuchen'
  },
  'chat.tools': {
    English: 'Tools', Spanish: 'Herramientas', Russian: 'Инструменты', Chinese: '工具',
    Vietnamese: 'Công cụ', Arabic: 'الأدوات', Somali: 'Qalabka', French: 'Outils', German: 'Werkzeuge'
  },
  'chat.startingPoint': {
    English: 'Starting Point', Spanish: 'Punto de partida', Russian: 'Отправная точка', Chinese: '起点',
    Vietnamese: 'Điểm bắt đầu', Arabic: 'نقطة الانطلاق', Somali: 'Meesha bilowga', French: 'Point de départ', German: 'Startpunkt'
  },
  'chat.calculator': {
    English: 'Calculator', Spanish: 'Calculadora', Russian: 'Калькулятор', Chinese: '计算器',
    Vietnamese: 'Máy tính', Arabic: 'الآلة الحاسبة', Somali: 'Xisaabiye', French: 'Calculatrice', German: 'Taschenrechner'
  },
  'chat.uploadWork': {
    English: 'Upload Work', Spanish: 'Subir trabajo', Russian: 'Загрузить работу', Chinese: '上传作业',
    Vietnamese: 'Tải lên bài làm', Arabic: 'رفع العمل', Somali: 'Soo geli shaqada', French: 'Télécharger le travail', German: 'Arbeit hochladen'
  },
  'chat.mySessions': {
    English: 'My Chats', Spanish: 'Mis chats', Russian: 'Мои чаты', Chinese: '我的聊天',
    Vietnamese: 'Trò chuyện của tôi', Arabic: 'محادثاتي', Somali: 'Wada-sheekeysiyadayda', French: 'Mes discussions', German: 'Meine Chats'
  },
  'chat.searchSessions': {
    English: 'Search chats...', Spanish: 'Buscar chats...', Russian: 'Поиск чатов...', Chinese: '搜索聊天…',
    Vietnamese: 'Tìm kiếm trò chuyện...', Arabic: 'البحث في المحادثات...', Somali: 'Raadi wada-sheekeysiyo...', French: 'Rechercher des discussions…', German: 'Chats suchen…'
  },
  'chat.newSession': {
    English: 'New Chat', Spanish: 'Nuevo chat', Russian: 'Новый чат', Chinese: '新聊天',
    Vietnamese: 'Trò chuyện mới', Arabic: 'محادثة جديدة', Somali: 'Wada-sheekeysiga cusub', French: 'Nouvelle discussion', German: 'Neuer Chat'
  },
  'chat.askQuestion': {
    English: 'Ask a math question...', Spanish: 'Haz una pregunta de matemáticas...', Russian: 'Задайте вопрос по математике...', Chinese: '问一个数学问题…',
    Vietnamese: 'Hỏi một câu hỏi toán...', Arabic: 'اطرح سؤالاً في الرياضيات...', Somali: 'Su\'aal xisaab weydii...', French: 'Posez une question de maths…', German: 'Stellen Sie eine Mathe-Frage…'
  },
  'chat.yourProgress': {
    English: 'Your Progress', Spanish: 'Tu progreso', Russian: 'Ваш прогресс', Chinese: '你的进度',
    Vietnamese: 'Tiến trình của bạn', Arabic: 'تقدّمك', Somali: 'Horumarkaaga', French: 'Vos progrès', German: 'Ihr Fortschritt'
  },
  'chat.thisSession': {
    English: 'This Session', Spanish: 'Esta sesión', Russian: 'Эта сессия', Chinese: '本次会话',
    Vietnamese: 'Phiên này', Arabic: 'هذه الجلسة', Somali: 'Fadhiyaadkan', French: 'Cette session', German: 'Diese Sitzung'
  },
  'chat.quickSettings': {
    English: 'Quick Settings', Spanish: 'Ajustes rápidos', Russian: 'Быстрые настройки', Chinese: '快捷设置',
    Vietnamese: 'Cài đặt nhanh', Arabic: 'إعدادات سريعة', Somali: 'Dejin degdeg ah', French: 'Paramètres rapides', German: 'Schnelleinstellungen'
  },
  'chat.openSettings': {
    English: 'Open Settings', Spanish: 'Abrir configuración', Russian: 'Открыть настройки', Chinese: '打开设置',
    Vietnamese: 'Mở cài đặt', Arabic: 'فتح الإعدادات', Somali: 'Fur dejinta', French: 'Ouvrir les paramètres', German: 'Einstellungen öffnen'
  },
  'chat.changeTutor': {
    English: 'Change Tutor', Spanish: 'Cambiar tutor', Russian: 'Сменить репетитора', Chinese: '更换导师',
    Vietnamese: 'Đổi gia sư', Arabic: 'تغيير المعلّم', Somali: 'Beddel bare', French: 'Changer de tuteur', German: 'Tutor wechseln'
  },
  'chat.shareCode': {
    English: 'Share this code with a parent or teacher.',
    Spanish: 'Comparte este código con un padre o maestro.',
    Russian: 'Поделитесь этим кодом с родителем или учителем.',
    Chinese: '将此代码分享给家长或老师。',
    Vietnamese: 'Chia sẻ mã này với phụ huynh hoặc giáo viên.',
    Arabic: 'شارك هذا الرمز مع ولي أمر أو معلّم.',
    Somali: 'La wadaag koodhkan waalidkaaga ama macallinkaaga.',
    French: 'Partagez ce code avec un parent ou un enseignant.',
    German: 'Teilen Sie diesen Code mit einem Elternteil oder Lehrer.'
  },
  'chat.shareCodeSteps': {
    // The Parent Dashboard UI (parent-dashboard.html) is English-only, so the
    // "Link to Existing Student" button label is intentionally left in English
    // in every locale to match exactly what the parent sees and clicks.
    English: 'To follow your progress, your parent creates a free account at mathmatix.ai, opens the Parent Dashboard, chooses "Link to Existing Student," and enters this code.',
    Spanish: 'Para seguir tu progreso, tu padre o madre crea una cuenta gratuita en mathmatix.ai, abre el Panel para Padres, elige "Link to Existing Student" y escribe este código.',
    Russian: 'Чтобы следить за твоими успехами, твой родитель создаёт бесплатный аккаунт на mathmatix.ai, открывает родительскую панель, выбирает «Link to Existing Student» и вводит этот код.',
    Chinese: '为了跟踪你的学习进度，你的家长在 mathmatix.ai 上创建一个免费账户，打开家长面板，选择"Link to Existing Student"，然后输入此代码。',
    Vietnamese: 'Để theo dõi tiến độ của bạn, phụ huynh của bạn tạo một tài khoản miễn phí tại mathmatix.ai, mở Bảng điều khiển Phụ huynh, chọn "Link to Existing Student" và nhập mã này.',
    Arabic: 'لمتابعة تقدّمك، يُنشئ أحد والديك حساباً مجانياً على mathmatix.ai، ويفتح لوحة تحكم الوالدين، ويختار "Link to Existing Student"، ثم يُدخل هذا الرمز.',
    Somali: 'Si loola socdo horumarkaaga, waalidkaaga wuxuu ka abuuraa akoon bilaash ah mathmatix.ai, wuxuu furaa Dashboard-ka Waalidka, wuxuu doortaa "Link to Existing Student," kadibna wuxuu galiyaa koodhkan.',
    French: 'Pour suivre tes progrès, ton parent crée un compte gratuit sur mathmatix.ai, ouvre le tableau de bord parental, choisit « Link to Existing Student » et saisit ce code.',
    German: 'Um deinen Fortschritt zu verfolgen, erstellt dein Elternteil ein kostenloses Konto auf mathmatix.ai, öffnet das Eltern-Dashboard, wählt „Link to Existing Student" und gibt diesen Code ein.'
  },
  'chat.stop': {
    English: 'Stop', Spanish: 'Detener', Russian: 'Стоп', Chinese: '停止',
    Vietnamese: 'Dừng', Arabic: 'إيقاف', Somali: 'Jooji', French: 'Arrêter', German: 'Stopp'
  },
  'chat.insertEquation': {
    English: 'Insert Equation', Spanish: 'Insertar ecuación', Russian: 'Вставить уравнение', Chinese: '插入公式',
    Vietnamese: 'Chèn phương trình', Arabic: 'إدراج معادلة', Somali: 'Geli isle\'eg', French: 'Insérer une équation', German: 'Gleichung einfügen'
  },
  'chat.insert': {
    English: 'Insert', Spanish: 'Insertar', Russian: 'Вставить', Chinese: '插入',
    Vietnamese: 'Chèn', Arabic: 'إدراج', Somali: 'Geli', French: 'Insérer', German: 'Einfügen'
  },
  'chat.cancel': {
    English: 'Cancel', Spanish: 'Cancelar', Russian: 'Отмена', Chinese: '取消',
    Vietnamese: 'Hủy', Arabic: 'إلغاء', Somali: 'Jooji', French: 'Annuler', German: 'Abbrechen'
  },

  /* ─── Parent Dashboard ─── */
  'parent.modeIndicator': {
    English: 'Parent Dashboard', Spanish: 'Panel para padres', Russian: 'Панель родителя', Chinese: '家长面板',
    Vietnamese: 'Bảng điều khiển phụ huynh', Arabic: 'لوحة ولي الأمر', Somali: 'Shaashadda waalidka', French: 'Espace parent', German: 'Eltern-Dashboard'
  },
  'parent.yourAccount': {
    English: 'Your Parent Account', Spanish: 'Su cuenta de padre/madre', Russian: 'Ваш родительский аккаунт', Chinese: '您的家长账户',
    Vietnamese: 'Tài khoản phụ huynh của bạn', Arabic: 'حساب ولي الأمر الخاص بك', Somali: 'Akoonkaaga waalidka', French: 'Votre compte parent', German: 'Ihr Elternkonto'
  },
  'parent.yourAccountDesc': {
    English: 'Manage your children\'s learning progress and communicate with their AI tutors.',
    Spanish: 'Administre el progreso de aprendizaje de sus hijos y comuníquese con sus tutores de IA.',
    Russian: 'Управляйте успеваемостью своих детей и общайтесь с их ИИ-репетиторами.',
    Chinese: '管理孩子的学习进度，并与他们的 AI 导师交流。',
    Vietnamese: 'Quản lý tiến trình học tập của con bạn và trao đổi với gia sư AI của các em.',
    Arabic: 'تابع تقدّم أبنائك في التعلّم وتواصل مع معلّميهم بالذكاء الاصطناعي.',
    Somali: 'Maamul horumarka waxbarasho ee carruurtaada oo la xiriir macallimiintooda AI-ga.',
    French: 'Gérez les progrès d\'apprentissage de vos enfants et échangez avec leurs tuteurs IA.',
    German: 'Verwalten Sie den Lernfortschritt Ihrer Kinder und kommunizieren Sie mit ihren KI-Tutoren.'
  },
  'parent.inviteChild': {
    English: 'Invite a Child', Spanish: 'Invitar a un hijo', Russian: 'Пригласить ребёнка', Chinese: '邀请孩子',
    Vietnamese: 'Mời một trẻ', Arabic: 'دعوة طفل', Somali: 'Ku casuun ilma', French: 'Inviter un enfant', German: 'Kind einladen'
  },
  'parent.inviteChildHelp': {
    English: 'Generate a code, then have your child enter it when they sign up. Best when your child doesn\'t have a Mathmatix account yet.',
    Spanish: 'Genere un código y pida a su hijo que lo introduzca al registrarse. Ideal si su hijo aún no tiene una cuenta de Mathmatix.',
    Russian: 'Создайте код и попросите ребёнка ввести его при регистрации. Подходит, если у ребёнка ещё нет аккаунта Mathmatix.',
    Chinese: '生成一个代码，让孩子在注册时输入。适用于孩子还没有 Mathmatix 账户的情况。',
    Vietnamese: 'Tạo một mã, sau đó cho con bạn nhập mã khi đăng ký. Phù hợp nhất khi con bạn chưa có tài khoản Mathmatix.',
    Arabic: 'أنشئ رمزًا، ثم اطلب من طفلك إدخاله عند التسجيل. الأفضل عندما لا يملك طفلك حساب Mathmatix بعد.',
    Somali: 'Samee koodh, ka dibna ilmahaagu ha geliyo markuu isdiiwaangelinayo. Ugu wanaagsan marka ilmahaagu weli aanu lahayn akoon Mathmatix.',
    French: 'Générez un code, puis demandez à votre enfant de le saisir lors de son inscription. Idéal si votre enfant n\'a pas encore de compte Mathmatix.',
    German: 'Erstellen Sie einen Code, den Ihr Kind bei der Registrierung eingibt. Ideal, wenn Ihr Kind noch kein Mathmatix-Konto hat.'
  },
  'parent.generateCode': {
    English: 'Generate Invite Code', Spanish: 'Generar código de invitación', Russian: 'Создать код приглашения', Chinese: '生成邀请码',
    Vietnamese: 'Tạo mã mời', Arabic: 'إنشاء رمز دعوة', Somali: 'Samee koodhka casuumaadda', French: 'Générer un code d\'invitation', German: 'Einladungscode erstellen'
  },
  'parent.shareCodeWithChild': {
    English: 'Share this code with your child:', Spanish: 'Comparta este código con su hijo:', Russian: 'Поделитесь этим кодом с ребёнком:', Chinese: '把这个代码分享给您的孩子：',
    Vietnamese: 'Chia sẻ mã này với con bạn:', Arabic: 'شارك هذا الرمز مع طفلك:', Somali: 'La wadaag koodhkan ilmahaaga:', French: 'Partagez ce code avec votre enfant :', German: 'Teilen Sie diesen Code mit Ihrem Kind:'
  },
  'parent.copy': {
    English: 'Copy', Spanish: 'Copiar', Russian: 'Копировать', Chinese: '复制',
    Vietnamese: 'Sao chép', Arabic: 'نسخ', Somali: 'Koobi', French: 'Copier', German: 'Kopieren'
  },
  'parent.copyToClipboard': {
    English: 'Copy to clipboard', Spanish: 'Copiar al portapapeles', Russian: 'Копировать в буфер обмена', Chinese: '复制到剪贴板',
    Vietnamese: 'Sao chép vào bộ nhớ tạm', Arabic: 'نسخ إلى الحافظة', Somali: 'Ku koobi meesha wax lagu kaydiyo', French: 'Copier dans le presse-papiers', German: 'In die Zwischenablage kopieren'
  },
  'parent.expires': {
    English: 'Expires:', Spanish: 'Vence:', Russian: 'Истекает:', Chinese: '过期时间：',
    Vietnamese: 'Hết hạn:', Arabic: 'ينتهي في:', Somali: 'Wuxuu dhacayaa:', French: 'Expire le :', German: 'Läuft ab:'
  },
  'parent.linkExisting': {
    English: 'Link to Existing Student', Spanish: 'Vincular con un estudiante existente', Russian: 'Привязать существующего ученика', Chinese: '关联现有学生',
    Vietnamese: 'Liên kết với học sinh hiện có', Arabic: 'الربط بطالب موجود', Somali: 'Ku xir arday hore u jira', French: 'Associer un élève existant', German: 'Mit vorhandenem Schüler verknüpfen'
  },
  'parent.linkExistingHelp': {
    English: 'Already have a child using Mathmatix? Ask them for their 6-character link code (Profile → Family) and enter it below.',
    Spanish: '¿Su hijo ya usa Mathmatix? Pídale su código de vinculación de 6 caracteres (Perfil → Familia) e introdúzcalo a continuación.',
    Russian: 'Ваш ребёнок уже пользуется Mathmatix? Попросите у него 6-значный код привязки (Профиль → Семья) и введите его ниже.',
    Chinese: '孩子已经在使用 Mathmatix 了吗？向他们索取 6 位关联代码（个人资料 → 家庭），然后在下方输入。',
    Vietnamese: 'Con bạn đã dùng Mathmatix? Hãy hỏi mã liên kết 6 ký tự của con (Hồ sơ → Gia đình) và nhập vào bên dưới.',
    Arabic: 'هل يستخدم طفلك Mathmatix بالفعل؟ اطلب منه رمز الربط المكوّن من 6 أحرف (الملف الشخصي ← العائلة) وأدخله أدناه.',
    Somali: 'Ilmahaagu horey ma u isticmaalaa Mathmatix? Weydii koodhka xiriirinta ee 6-xaraf ah (Profile → Family) oo hoos geli.',
    French: 'Votre enfant utilise déjà Mathmatix ? Demandez-lui son code de liaison à 6 caractères (Profil → Famille) et saisissez-le ci-dessous.',
    German: 'Nutzt Ihr Kind Mathmatix bereits? Fragen Sie nach dem 6-stelligen Verknüpfungscode (Profil → Familie) und geben Sie ihn unten ein.'
  },
  'parent.studentLinkCode': {
    English: 'Student\'s Link Code', Spanish: 'Código de vinculación del estudiante', Russian: 'Код привязки ученика', Chinese: '学生关联代码',
    Vietnamese: 'Mã liên kết của học sinh', Arabic: 'رمز ربط الطالب', Somali: 'Koodhka xiriirinta ardayga', French: 'Code de liaison de l\'élève', German: 'Verknüpfungscode des Schülers'
  },
  'parent.linkCodePlaceholder': {
    English: 'Enter 6-character code', Spanish: 'Introduzca el código de 6 caracteres', Russian: 'Введите 6-значный код', Chinese: '输入 6 位代码',
    Vietnamese: 'Nhập mã 6 ký tự', Arabic: 'أدخل الرمز المكوّن من 6 أحرف', Somali: 'Geli koodhka 6-xaraf ah', French: 'Saisissez le code à 6 caractères', German: '6-stelligen Code eingeben'
  },
  'parent.linkStudent': {
    English: 'Link Student', Spanish: 'Vincular estudiante', Russian: 'Привязать ученика', Chinese: '关联学生',
    Vietnamese: 'Liên kết học sinh', Arabic: 'ربط الطالب', Somali: 'Ku xir ardayga', French: 'Associer l\'élève', German: 'Schüler verknüpfen'
  },
  'parent.learningCenter': {
    English: 'Parent Learning Center', Spanish: 'Centro de aprendizaje para padres', Russian: 'Учебный центр для родителей', Chinese: '家长学习中心',
    Vietnamese: 'Trung tâm học tập dành cho phụ huynh', Arabic: 'مركز تعلّم أولياء الأمور', Somali: 'Xarunta Waxbarashada Waalidka', French: 'Centre d\'apprentissage pour les parents', German: 'Lernzentrum für Eltern'
  },
  'parent.learningCenterDesc': {
    English: 'Mini-courses to help you understand today\'s math methods and support your child at home.',
    Spanish: 'Minicursos para ayudarle a entender los métodos matemáticos actuales y apoyar a su hijo en casa.',
    Russian: 'Мини-курсы, которые помогут вам понять современные методы математики и помогать ребёнку дома.',
    Chinese: '迷你课程，帮助您了解当今的数学教学方法，在家中支持孩子。',
    Vietnamese: 'Các khóa học ngắn giúp bạn hiểu phương pháp toán học ngày nay và hỗ trợ con tại nhà.',
    Arabic: 'دورات قصيرة تساعدك على فهم طرق تدريس الرياضيات اليوم ودعم طفلك في المنزل.',
    Somali: 'Koorsooyin kooban oo kaa caawinaya inaad fahamto hababka xisaabta ee maanta oo aad guriga kaga taageerto ilmahaaga.',
    French: 'Des mini-cours pour comprendre les méthodes mathématiques actuelles et aider votre enfant à la maison.',
    German: 'Mini-Kurse, die Ihnen helfen, die heutigen Mathematik-Methoden zu verstehen und Ihr Kind zu Hause zu unterstützen.'
  },
  'parent.loadingCourses': {
    English: 'Loading courses...', Spanish: 'Cargando cursos...', Russian: 'Загрузка курсов...', Chinese: '正在加载课程…',
    Vietnamese: 'Đang tải khóa học...', Arabic: 'جارٍ تحميل الدورات...', Somali: 'Waxaa la soo rarayaa koorsooyinka...', French: 'Chargement des cours...', German: 'Kurse werden geladen …'
  },
  'parent.linkedChildren': {
    English: 'Your Linked Children', Spanish: 'Sus hijos vinculados', Russian: 'Ваши привязанные дети', Chinese: '已关联的孩子',
    Vietnamese: 'Các con đã liên kết', Arabic: 'أبناؤك المرتبطون', Somali: 'Carruurtaada la xiriiriyay', French: 'Vos enfants associés', German: 'Ihre verknüpften Kinder'
  },
  'parent.learnsBest': {
    English: 'How Your Child Learns Best', Spanish: 'Cómo aprende mejor su hijo', Russian: 'Как ваш ребёнок учится лучше всего', Chinese: '您的孩子如何学得最好',
    Vietnamese: 'Con bạn học tốt nhất bằng cách nào', Arabic: 'كيف يتعلّم طفلك على أفضل وجه', Somali: 'Sida ilmahaagu ugu fiican wax u barto', French: 'Comment votre enfant apprend le mieux', German: 'Wie Ihr Kind am besten lernt'
  },
  'parent.teacherMessages': {
    English: 'Messages with Your Child\'s Teacher', Spanish: 'Mensajes con el maestro de su hijo', Russian: 'Переписка с учителем вашего ребёнка', Chinese: '与孩子老师的消息',
    Vietnamese: 'Tin nhắn với giáo viên của con bạn', Arabic: 'الرسائل مع معلّم طفلك', Somali: 'Farriimaha macallinka ilmahaaga', French: 'Messages avec l\'enseignant de votre enfant', German: 'Nachrichten mit der Lehrkraft Ihres Kindes'
  },
  'parent.conference': {
    English: 'Parent-Tutor Conference', Spanish: 'Reunión entre padres y tutor', Russian: 'Беседа родителя с репетитором', Chinese: '家长与导师会谈',
    Vietnamese: 'Trao đổi giữa phụ huynh và gia sư', Arabic: 'لقاء ولي الأمر مع المعلّم', Somali: 'Kulanka Waalidka iyo Macallinka', French: 'Entretien parent-tuteur', German: 'Eltern-Tutor-Gespräch'
  },
  'parent.discussingStudent': {
    English: 'Discussing Student:', Spanish: 'Estudiante en cuestión:', Russian: 'Обсуждаемый ученик:', Chinese: '讨论的学生：',
    Vietnamese: 'Học sinh đang trao đổi:', Arabic: 'الطالب قيد المناقشة:', Somali: 'Ardayga laga hadlayo:', French: 'Élève concerné :', German: 'Besprochener Schüler:'
  },
  'parent.selectChildAria': {
    English: 'Select child to discuss', Spanish: 'Seleccionar hijo para hablar', Russian: 'Выберите ребёнка для обсуждения', Chinese: '选择要讨论的孩子',
    Vietnamese: 'Chọn trẻ để trao đổi', Arabic: 'اختر الطفل للمناقشة', Somali: 'Dooro ilmaha laga hadlayo', French: 'Sélectionner l\'enfant à discuter', German: 'Kind zum Besprechen auswählen'
  },
  'parent.selectChildPrompt': {
    English: 'Select a child to discuss their learning progress.',
    Spanish: 'Seleccione un hijo para hablar sobre su progreso de aprendizaje.',
    Russian: 'Выберите ребёнка, чтобы обсудить его успехи.',
    Chinese: '选择一个孩子，讨论他们的学习进度。',
    Vietnamese: 'Chọn một trẻ để trao đổi về tiến trình học tập.',
    Arabic: 'اختر طفلًا لمناقشة تقدّمه في التعلّم.',
    Somali: 'Dooro ilmo si aad uga wada hadashaan horumarkiisa waxbarasho.',
    French: 'Sélectionnez un enfant pour discuter de ses progrès.',
    German: 'Wählen Sie ein Kind aus, um seinen Lernfortschritt zu besprechen.'
  },
  'parent.tutorThinking': {
    English: 'AI Tutor is thinking...', Spanish: 'El tutor de IA está pensando...', Russian: 'ИИ-репетитор думает...', Chinese: 'AI 导师正在思考…',
    Vietnamese: 'Gia sư AI đang suy nghĩ...', Arabic: 'المعلّم الذكي يفكّر...', Somali: 'Macallinka AI-ga wuu fekerayaa...', French: 'Le tuteur IA réfléchit...', German: 'Der KI-Tutor denkt nach …'
  },
  'parent.quickQuestions': {
    English: 'Quick Questions:', Spanish: 'Preguntas rápidas:', Russian: 'Быстрые вопросы:', Chinese: '快捷提问：',
    Vietnamese: 'Câu hỏi nhanh:', Arabic: 'أسئلة سريعة:', Somali: 'Su\'aalo degdeg ah:', French: 'Questions rapides :', German: 'Schnelle Fragen:'
  },
  'parent.qProgress': {
    English: 'Progress Report', Spanish: 'Informe de progreso', Russian: 'Отчёт об успеваемости', Chinese: '进度报告',
    Vietnamese: 'Báo cáo tiến trình', Arabic: 'تقرير التقدّم', Somali: 'Warbixinta horumarka', French: 'Rapport de progrès', German: 'Fortschrittsbericht'
  },
  'parent.qTopics': {
    English: 'Current Topics', Spanish: 'Temas actuales', Russian: 'Текущие темы', Chinese: '当前主题',
    Vietnamese: 'Chủ đề hiện tại', Arabic: 'الموضوعات الحالية', Somali: 'Mowduucyada hadda', French: 'Sujets actuels', German: 'Aktuelle Themen'
  },
  'parent.qTeachMe': {
    English: 'Teach Me', Spanish: 'Enséñeme', Russian: 'Научите меня', Chinese: '教教我',
    Vietnamese: 'Dạy tôi', Arabic: 'علّمني', Somali: 'I bar', French: 'Apprenez-moi', German: 'Erklär es mir'
  },
  'parent.qTeachMeTitle': {
    English: 'Learn the concept your child is studying so you can help at home',
    Spanish: 'Aprenda el concepto que estudia su hijo para poder ayudarle en casa',
    Russian: 'Изучите тему, которую проходит ваш ребёнок, чтобы помогать дома',
    Chinese: '学习孩子正在学的概念，以便在家辅导',
    Vietnamese: 'Học khái niệm con bạn đang học để có thể hỗ trợ tại nhà',
    Arabic: 'تعلّم المفهوم الذي يدرسه طفلك لتتمكّن من مساعدته في المنزل',
    Somali: 'Baro fikradda uu ilmahaagu baranayo si aad guriga uga caawiso',
    French: 'Apprenez la notion étudiée par votre enfant pour l\'aider à la maison',
    German: 'Lernen Sie das Konzept Ihres Kindes, um zu Hause helfen zu können'
  },
  'parent.qHelpHome': {
    English: 'Help at Home', Spanish: 'Ayuda en casa', Russian: 'Помощь дома', Chinese: '在家辅导',
    Vietnamese: 'Hỗ trợ tại nhà', Arabic: 'المساعدة في المنزل', Somali: 'Caawimo guriga', French: 'Aide à la maison', German: 'Hilfe zu Hause'
  },
  'parent.qStruggles': {
    English: 'Struggles', Spanish: 'Dificultades', Russian: 'Трудности', Chinese: '薄弱环节',
    Vietnamese: 'Khó khăn', Arabic: 'الصعوبات', Somali: 'Dhibaatooyinka', French: 'Difficultés', German: 'Schwierigkeiten'
  },
  'parent.qStrengths': {
    English: 'Strengths', Spanish: 'Fortalezas', Russian: 'Сильные стороны', Chinese: '优势',
    Vietnamese: 'Điểm mạnh', Arabic: 'نقاط القوة', Somali: 'Xoogagga', French: 'Points forts', German: 'Stärken'
  },
  'parent.qExplainSimple': {
    English: 'Explain Very Simply', Spanish: 'Explíquemelo de forma muy sencilla', Russian: 'Объясните совсем просто', Chinese: '用最简单的方式解释',
    Vietnamese: 'Giải thích thật đơn giản', Arabic: 'اشرح لي ببساطة شديدة', Somali: 'Ii sharax si aad u fudud', French: 'Expliquez très simplement', German: 'Ganz einfach erklären'
  },
  'parent.chatPlaceholder': {
    English: 'Ask about your child\'s learning progress, strengths, areas for improvement...',
    Spanish: 'Pregunte sobre el progreso, las fortalezas y las áreas de mejora de su hijo...',
    Russian: 'Спросите об успехах, сильных сторонах и зонах роста вашего ребёнка...',
    Chinese: '询问孩子的学习进度、优势和需要改进的方面…',
    Vietnamese: 'Hỏi về tiến trình học tập, điểm mạnh và điểm cần cải thiện của con bạn...',
    Arabic: 'اسأل عن تقدّم طفلك ونقاط قوّته والجوانب التي تحتاج إلى تحسين...',
    Somali: 'Wax ka weydii horumarka waxbarasho ee ilmahaaga, xoogagga, iyo meelaha u baahan hagaajin...',
    French: 'Posez des questions sur les progrès, les points forts et les axes d\'amélioration de votre enfant...',
    German: 'Fragen Sie nach Lernfortschritt, Stärken und Verbesserungsbereichen Ihres Kindes …'
  },
  'parent.sendMessage': {
    English: 'Send Message', Spanish: 'Enviar mensaje', Russian: 'Отправить сообщение', Chinese: '发送消息',
    Vietnamese: 'Gửi tin nhắn', Arabic: 'إرسال الرسالة', Somali: 'Dir farriinta', French: 'Envoyer le message', German: 'Nachricht senden'
  },
  'parent.settingsTitle': {
    English: 'Settings & Notifications', Spanish: 'Configuración y notificaciones', Russian: 'Настройки и уведомления', Chinese: '设置与通知',
    Vietnamese: 'Cài đặt và thông báo', Arabic: 'الإعدادات والإشعارات', Somali: 'Dejinta iyo Ogeysiisyada', French: 'Paramètres et notifications', German: 'Einstellungen und Benachrichtigungen'
  },
  'parent.reportFrequency': {
    English: 'Report Frequency', Spanish: 'Frecuencia de informes', Russian: 'Частота отчётов', Chinese: '报告频率',
    Vietnamese: 'Tần suất báo cáo', Arabic: 'تكرار التقارير', Somali: 'Inta jeer ee warbixinta', French: 'Fréquence des rapports', German: 'Berichtshäufigkeit'
  },
  'parent.daily': {
    English: 'Daily', Spanish: 'Diario', Russian: 'Ежедневно', Chinese: '每天',
    Vietnamese: 'Hằng ngày', Arabic: 'يوميًا', Somali: 'Maalin kasta', French: 'Quotidien', German: 'Täglich'
  },
  'parent.weekly': {
    English: 'Weekly', Spanish: 'Semanal', Russian: 'Еженедельно', Chinese: '每周',
    Vietnamese: 'Hằng tuần', Arabic: 'أسبوعيًا', Somali: 'Toddobaad kasta', French: 'Hebdomadaire', German: 'Wöchentlich'
  },
  'parent.biweekly': {
    English: 'Bi-weekly', Spanish: 'Quincenal', Russian: 'Раз в две недели', Chinese: '每两周',
    Vietnamese: 'Hai tuần một lần', Arabic: 'كل أسبوعين', Somali: 'Laba toddobaad kasta', French: 'Toutes les deux semaines', German: 'Zweiwöchentlich'
  },
  'parent.monthly': {
    English: 'Monthly', Spanish: 'Mensual', Russian: 'Ежемесячно', Chinese: '每月',
    Vietnamese: 'Hằng tháng', Arabic: 'شهريًا', Somali: 'Bil kasta', French: 'Mensuel', German: 'Monatlich'
  },
  'parent.reportFrequencyHelp': {
    English: 'How often you receive progress reports',
    Spanish: 'Con qué frecuencia recibe informes de progreso',
    Russian: 'Как часто вы получаете отчёты об успеваемости',
    Chinese: '您接收进度报告的频率',
    Vietnamese: 'Tần suất bạn nhận báo cáo tiến trình',
    Arabic: 'عدد مرات تلقّيك تقارير التقدّم',
    Somali: 'Inta jeer ee aad hesho warbixinnada horumarka',
    French: 'À quelle fréquence vous recevez les rapports de progrès',
    German: 'Wie oft Sie Fortschrittsberichte erhalten'
  },
  'parent.dashboardView': {
    English: 'Dashboard View', Spanish: 'Vista del panel', Russian: 'Вид панели', Chinese: '面板视图',
    Vietnamese: 'Chế độ xem bảng điều khiển', Arabic: 'عرض اللوحة', Somali: 'Muuqaalka shaashadda', French: 'Affichage du tableau de bord', German: 'Dashboard-Ansicht'
  },
  'parent.viewProgress': {
    English: 'Progress Overview', Spanish: 'Resumen de progreso', Russian: 'Обзор успеваемости', Chinese: '进度概览',
    Vietnamese: 'Tổng quan tiến trình', Arabic: 'نظرة عامة على التقدّم', Somali: 'Guudmarka horumarka', French: 'Aperçu des progrès', German: 'Fortschrittsübersicht'
  },
  'parent.viewGaps': {
    English: 'Learning Gaps', Spanish: 'Lagunas de aprendizaje', Russian: 'Пробелы в знаниях', Chinese: '学习差距',
    Vietnamese: 'Lỗ hổng kiến thức', Arabic: 'الفجوات التعليمية', Somali: 'Farqiga waxbarashada', French: 'Lacunes d\'apprentissage', German: 'Lernlücken'
  },
  'parent.viewGoals': {
    English: 'IEP Goals', Spanish: 'Objetivos del IEP', Russian: 'Цели IEP', Chinese: 'IEP 目标',
    Vietnamese: 'Mục tiêu IEP', Arabic: 'أهداف الخطة التعليمية الفردية', Somali: 'Yoolalka IEP', French: 'Objectifs du PEI', German: 'IEP-Ziele'
  },
  'parent.dashboardViewHelp': {
    English: 'What you see first when viewing child progress',
    Spanish: 'Lo que ve primero al consultar el progreso de su hijo',
    Russian: 'Что вы видите первым при просмотре успеваемости ребёнка',
    Chinese: '查看孩子进度时首先看到的内容',
    Vietnamese: 'Nội dung bạn thấy đầu tiên khi xem tiến trình của con',
    Arabic: 'ما تراه أولًا عند الاطّلاع على تقدّم طفلك',
    Somali: 'Waxa ugu horreeya ee aad aragto marka aad eegto horumarka ilmaha',
    French: 'Ce que vous voyez en premier lors de la consultation des progrès',
    German: 'Was Sie zuerst sehen, wenn Sie den Fortschritt ansehen'
  },
  'parent.tone': {
    English: 'Communication Tone', Spanish: 'Tono de comunicación', Russian: 'Тон общения', Chinese: '沟通语气',
    Vietnamese: 'Giọng điệu giao tiếp', Arabic: 'أسلوب التواصل', Somali: 'Qaabka isgaarsiinta', French: 'Ton de communication', German: 'Kommunikationston'
  },
  'parent.toneStandard': {
    English: 'Standard (default)', Spanish: 'Estándar (predeterminado)', Russian: 'Стандартный (по умолчанию)', Chinese: '标准（默认）',
    Vietnamese: 'Tiêu chuẩn (mặc định)', Arabic: 'قياسي (افتراضي)', Somali: 'Caadi (asal ahaan)', French: 'Standard (par défaut)', German: 'Standard (Voreinstellung)'
  },
  'parent.toneDetailed': {
    English: 'Detailed & Technical', Spanish: 'Detallado y técnico', Russian: 'Подробный и технический', Chinese: '详细且专业',
    Vietnamese: 'Chi tiết và kỹ thuật', Arabic: 'مفصّل وتقني', Somali: 'Faahfaahsan oo farsamaysan', French: 'Détaillé et technique', German: 'Ausführlich und technisch'
  },
  'parent.toneSimple': {
    English: 'Simple & Concise', Spanish: 'Sencillo y conciso', Russian: 'Простой и краткий', Chinese: '简单扼要',
    Vietnamese: 'Đơn giản và ngắn gọn', Arabic: 'بسيط وموجز', Somali: 'Fudud oo kooban', French: 'Simple et concis', German: 'Einfach und knapp'
  },
  'parent.toneEncouraging': {
    English: 'Encouraging & Positive', Spanish: 'Alentador y positivo', Russian: 'Ободряющий и позитивный', Chinese: '鼓励且积极',
    Vietnamese: 'Khích lệ và tích cực', Arabic: 'مشجّع وإيجابي', Somali: 'Dhiirrigelin leh oo togan', French: 'Encourageant et positif', German: 'Ermutigend und positiv'
  },
  'parent.toneHelp': {
    English: 'How the AI communicates with you',
    Spanish: 'Cómo se comunica la IA con usted',
    Russian: 'Как ИИ общается с вами',
    Chinese: 'AI 与您沟通的方式',
    Vietnamese: 'Cách AI giao tiếp với bạn',
    Arabic: 'كيف يتواصل الذكاء الاصطناعي معك',
    Somali: 'Sida AI-gu kuula xiriirayo',
    French: 'La manière dont l\'IA communique avec vous',
    German: 'Wie die KI mit Ihnen kommuniziert'
  },
  'parent.language': {
    English: 'Language', Spanish: 'Idioma', Russian: 'Язык', Chinese: '语言',
    Vietnamese: 'Ngôn ngữ', Arabic: 'اللغة', Somali: 'Luqadda', French: 'Langue', German: 'Sprache'
  },
  'parent.languageHelp': {
    English: 'Preferred language for reports and dashboard',
    Spanish: 'Idioma preferido para los informes y el panel',
    Russian: 'Предпочитаемый язык для отчётов и панели',
    Chinese: '报告和面板的首选语言',
    Vietnamese: 'Ngôn ngữ ưu tiên cho báo cáo và bảng điều khiển',
    Arabic: 'اللغة المفضّلة للتقارير واللوحة',
    Somali: 'Luqadda aad doorbidayso ee warbixinnada iyo shaashadda',
    French: 'Langue préférée pour les rapports et le tableau de bord',
    German: 'Bevorzugte Sprache für Berichte und Dashboard'
  },
  'parent.saveSettings': {
    English: 'Save Settings', Spanish: 'Guardar configuración', Russian: 'Сохранить настройки', Chinese: '保存设置',
    Vietnamese: 'Lưu cài đặt', Arabic: 'حفظ الإعدادات', Somali: 'Kaydi dejinta', French: 'Enregistrer les paramètres', German: 'Einstellungen speichern'
  },
  'parent.emailReports': {
    English: 'Email Reports', Spanish: 'Informes por correo electrónico', Russian: 'Отчёты по эл. почте', Chinese: '邮件报告',
    Vietnamese: 'Báo cáo qua email', Arabic: 'التقارير عبر البريد الإلكتروني', Somali: 'Warbixinnada iimaylka', French: 'Rapports par e-mail', German: 'E-Mail-Berichte'
  },
  'parent.emailReportsDesc': {
    English: 'Get weekly progress reports delivered to your inbox.',
    Spanish: 'Reciba informes semanales de progreso en su bandeja de entrada.',
    Russian: 'Получайте еженедельные отчёты об успеваемости на почту.',
    Chinese: '每周将进度报告发送到您的邮箱。',
    Vietnamese: 'Nhận báo cáo tiến trình hằng tuần qua hộp thư của bạn.',
    Arabic: 'احصل على تقارير التقدّم الأسبوعية في بريدك الإلكتروني.',
    Somali: 'Ku hel warbixinnada horumarka toddobaadlaha ah sanduuqaaga iimaylka.',
    French: 'Recevez chaque semaine les rapports de progrès dans votre boîte mail.',
    German: 'Erhalten Sie wöchentliche Fortschrittsberichte in Ihrem Posteingang.'
  },
  'parent.sendTestEmail': {
    English: 'Send Test Email', Spanish: 'Enviar correo de prueba', Russian: 'Отправить тестовое письмо', Chinese: '发送测试邮件',
    Vietnamese: 'Gửi email thử', Arabic: 'إرسال بريد تجريبي', Somali: 'Dir iimayl tijaabo ah', French: 'Envoyer un e-mail de test', German: 'Test-E-Mail senden'
  },
  'parent.sendWeeklyNow': {
    English: 'Send Weekly Report Now', Spanish: 'Enviar informe semanal ahora', Russian: 'Отправить недельный отчёт сейчас', Chinese: '立即发送周报',
    Vietnamese: 'Gửi báo cáo tuần ngay', Arabic: 'إرسال التقرير الأسبوعي الآن', Somali: 'Hadda dir warbixinta toddobaadlaha', French: 'Envoyer le rapport hebdomadaire maintenant', German: 'Wochenbericht jetzt senden'
  },
  'parent.weeklyReportNow': {
    English: 'Weekly Report Now', Spanish: 'Informe semanal ahora', Russian: 'Недельный отчёт сейчас', Chinese: '立即发送周报',
    Vietnamese: 'Báo cáo tuần ngay', Arabic: 'التقرير الأسبوعي الآن', Somali: 'Warbixinta toddobaadlaha hadda', French: 'Rapport hebdomadaire', German: 'Wochenbericht jetzt'
  },
  'parent.emailConfigNote': {
    English: 'Email must be configured in server settings',
    Spanish: 'El correo debe estar configurado en los ajustes del servidor',
    Russian: 'Электронная почта должна быть настроена в параметрах сервера',
    Chinese: '必须在服务器设置中配置邮件',
    Vietnamese: 'Email phải được cấu hình trong cài đặt máy chủ',
    Arabic: 'يجب تهيئة البريد الإلكتروني في إعدادات الخادم',
    Somali: 'Iimaylka waa in lagu habeeyaa dejinta serverka',
    French: 'L\'e-mail doit être configuré dans les paramètres du serveur',
    German: 'E-Mail muss in den Servereinstellungen konfiguriert sein'
  },
  'parent.navChildren': {
    English: 'Children', Spanish: 'Hijos', Russian: 'Дети', Chinese: '孩子',
    Vietnamese: 'Các con', Arabic: 'الأبناء', Somali: 'Carruurta', French: 'Enfants', German: 'Kinder'
  },
  'parent.navAddChild': {
    English: 'Add Child', Spanish: 'Añadir hijo', Russian: 'Добавить ребёнка', Chinese: '添加孩子',
    Vietnamese: 'Thêm trẻ', Arabic: 'إضافة طفل', Somali: 'Ku dar ilmo', French: 'Ajouter un enfant', German: 'Kind hinzufügen'
  },
  'parent.navLearn': {
    English: 'Learn', Spanish: 'Aprender', Russian: 'Обучение', Chinese: '学习',
    Vietnamese: 'Học', Arabic: 'تعلّم', Somali: 'Baro', French: 'Apprendre', German: 'Lernen'
  },
  'parent.navReports': {
    English: 'Reports', Spanish: 'Informes', Russian: 'Отчёты', Chinese: '报告',
    Vietnamese: 'Báo cáo', Arabic: 'التقارير', Somali: 'Warbixinno', French: 'Rapports', German: 'Berichte'
  },
  'parent.mobileInviteHelp': {
    English: 'Create a code for your child to link their account to yours.',
    Spanish: 'Cree un código para que su hijo vincule su cuenta con la suya.',
    Russian: 'Создайте код, чтобы ребёнок привязал свой аккаунт к вашему.',
    Chinese: '创建一个代码，让孩子将其账户关联到您的账户。',
    Vietnamese: 'Tạo mã để con bạn liên kết tài khoản của con với tài khoản của bạn.',
    Arabic: 'أنشئ رمزًا ليربط طفلك حسابه بحسابك.',
    Somali: 'Samee koodh si ilmahaagu akoonkiisa ugu xiro kaaga.',
    French: 'Créez un code pour que votre enfant associe son compte au vôtre.',
    German: 'Erstellen Sie einen Code, mit dem Ihr Kind sein Konto mit Ihrem verknüpft.'
  },
  'parent.linkExistingShort': {
    English: 'Link Existing Student', Spanish: 'Vincular estudiante existente', Russian: 'Привязать существующего ученика', Chinese: '关联现有学生',
    Vietnamese: 'Liên kết học sinh hiện có', Arabic: 'ربط طالب موجود', Somali: 'Ku xir arday hore u jira', French: 'Associer un élève existant', German: 'Vorhandenen Schüler verknüpfen'
  },
  'parent.mobileLinkHelp': {
    English: 'Enter your child\'s link code to connect their account.',
    Spanish: 'Introduzca el código de vinculación de su hijo para conectar su cuenta.',
    Russian: 'Введите код привязки ребёнка, чтобы подключить его аккаунт.',
    Chinese: '输入孩子的关联代码以连接其账户。',
    Vietnamese: 'Nhập mã liên kết của con bạn để kết nối tài khoản.',
    Arabic: 'أدخل رمز ربط طفلك لتوصيل حسابه.',
    Somali: 'Geli koodhka xiriirinta ee ilmahaaga si aad akoonkiisa ugu xirto.',
    French: 'Saisissez le code de liaison de votre enfant pour connecter son compte.',
    German: 'Geben Sie den Verknüpfungscode Ihres Kindes ein, um sein Konto zu verbinden.'
  },

  /* ─── Settings modal ─── */
  'settings.title': {
    English: 'Settings', Spanish: 'Configuración', Russian: 'Настройки', Chinese: '设置',
    Vietnamese: 'Cài đặt', Arabic: 'الإعدادات', Somali: 'Dejinta', French: 'Paramètres', German: 'Einstellungen'
  },
  'settings.changeYourTutor': {
    English: 'Change Your Tutor', Spanish: 'Cambia tu tutor', Russian: 'Сменить репетитора', Chinese: '更换你的导师',
    Vietnamese: 'Đổi gia sư của bạn', Arabic: 'غيّر معلّمك', Somali: 'Beddel barekaaga', French: 'Changer votre tuteur', German: 'Ihren Tutor wechseln'
  },
  'settings.selectTutor': {
    English: 'Select a Different Tutor', Spanish: 'Seleccionar otro tutor', Russian: 'Выбрать другого репетитора', Chinese: '选择其他导师',
    Vietnamese: 'Chọn gia sư khác', Arabic: 'اختر معلّماً آخر', Somali: 'Dooro bare kale', French: 'Sélectionner un autre tuteur', German: 'Anderen Tutor auswählen'
  },
  'settings.preferredLanguage': {
    English: 'Preferred Language for Tutoring', Spanish: 'Idioma preferido para tutoría',
    Russian: 'Предпочитаемый язык обучения', Chinese: '首选辅导语言',
    Vietnamese: 'Ngôn ngữ ưa thích cho buổi học', Arabic: 'اللغة المفضلة للتعليم',
    Somali: 'Luqadda la doorbido barashada', French: 'Langue préférée pour le tutorat',
    German: 'Bevorzugte Sprache für die Nachhilfe'
  },
  'settings.languageDescription': {
    English: "Choose the language you'd like your tutor to use when explaining math concepts.",
    Spanish: 'Elige el idioma en el que quieres que tu tutor explique los conceptos matemáticos.',
    Russian: 'Выберите язык, на котором репетитор будет объяснять математические понятия.',
    Chinese: '选择你希望导师讲解数学概念时使用的语言。',
    Vietnamese: 'Chọn ngôn ngữ bạn muốn gia sư sử dụng khi giải thích các khái niệm toán.',
    Arabic: 'اختر اللغة التي تريد أن يستخدمها المعلّم عند شرح المفاهيم الرياضية.',
    Somali: 'Dooro luqadda aad rabto inuu barehaagu ku sharaxo fikradaha xisaabta.',
    French: 'Choisissez la langue que vous souhaitez pour les explications mathématiques.',
    German: 'Wählen Sie die Sprache, in der Ihr Tutor Mathe-Konzepte erklären soll.'
  },
  'settings.darkMode': {
    English: 'Dark Mode', Spanish: 'Modo oscuro', Russian: 'Тёмный режим', Chinese: '深色模式',
    Vietnamese: 'Chế độ tối', Arabic: 'الوضع الداكن', Somali: 'Habka Mugdiga', French: 'Mode sombre', German: 'Dunkelmodus'
  },
  'settings.darkModeDescription': {
    English: 'Use the dark color theme. Light mode is the default.',
    Spanish: 'Usa el tema de color oscuro. El modo claro es el predeterminado.',
    Russian: 'Использовать тёмную цветовую тему. По умолчанию — светлый режим.',
    Chinese: '使用深色主题。默认为浅色模式。',
    Vietnamese: 'Sử dụng giao diện màu tối. Chế độ sáng là mặc định.',
    Arabic: 'استخدم السمة الداكنة. الوضع الفاتح هو الافتراضي.',
    Somali: 'Isticmaal midabka mugdiga. Habka iftiinka ayaa ah kan caadiga ah.',
    French: 'Utiliser le thème sombre. Le mode clair est celui par défaut.',
    German: 'Dunkles Farbschema verwenden. Der Hellmodus ist die Standardeinstellung.'
  },
  'settings.changePassword': {
    English: 'Change Password', Spanish: 'Cambiar contraseña', Russian: 'Изменить пароль', Chinese: '更改密码',
    Vietnamese: 'Đổi mật khẩu', Arabic: 'تغيير كلمة المرور', Somali: 'Beddel furaha sirta', French: 'Changer le mot de passe', German: 'Passwort ändern'
  },
  'settings.updatePassword': {
    English: 'Update Password', Spanish: 'Actualizar contraseña', Russian: 'Обновить пароль', Chinese: '更新密码',
    Vietnamese: 'Cập nhật mật khẩu', Arabic: 'تحديث كلمة المرور', Somali: 'Cusboonaysii furaha sirta', French: 'Mettre à jour le mot de passe', German: 'Passwort aktualisieren'
  },

  /* ─── Feedback modal ─── */
  'feedback.title': {
    English: 'Send Feedback', Spanish: 'Enviar comentarios', Russian: 'Отправить отзыв', Chinese: '发送反馈',
    Vietnamese: 'Gửi phản hồi', Arabic: 'إرسال ملاحظات', Somali: 'Dir jawaab celin', French: 'Envoyer un commentaire', German: 'Feedback senden'
  },
  'feedback.submit': {
    English: 'Submit Feedback', Spanish: 'Enviar comentarios', Russian: 'Отправить отзыв', Chinese: '提交反馈',
    Vietnamese: 'Gửi phản hồi', Arabic: 'إرسال الملاحظات', Somali: 'Dir jawaab celin', French: 'Soumettre', German: 'Feedback absenden'
  },

  /* ─── Footer ─── */
  'footer.rights': {
    English: 'All rights reserved.', Spanish: 'Todos los derechos reservados.', Russian: 'Все права защищены.', Chinese: '版权所有。',
    Vietnamese: 'Mọi quyền được bảo lưu.', Arabic: 'جميع الحقوق محفوظة.', Somali: 'Dhammaan xuquuqda way dhowran tahay.', French: 'Tous droits réservés.', German: 'Alle Rechte vorbehalten.'
  },
  'footer.privacy': {
    English: 'Privacy Policy', Spanish: 'Política de privacidad', Russian: 'Политика конфиденциальности', Chinese: '隐私政策',
    Vietnamese: 'Chính sách bảo mật', Arabic: 'سياسة الخصوصية', Somali: 'Siyaasadda asturnaanta', French: 'Politique de confidentialité', German: 'Datenschutzerklärung'
  },
  'footer.terms': {
    English: 'Terms of Use', Spanish: 'Términos de uso', Russian: 'Условия использования', Chinese: '使用条款',
    Vietnamese: 'Điều khoản sử dụng', Arabic: 'شروط الاستخدام', Somali: 'Shuruudaha isticmaalka', French: 'Conditions d\'utilisation', German: 'Nutzungsbedingungen'
  },

  /* ─── Misc / Shared ─── */
  'misc.skipToContent': {
    English: 'Skip to main content', Spanish: 'Ir al contenido principal', Russian: 'Перейти к основному содержанию', Chinese: '跳到主内容',
    Vietnamese: 'Chuyển đến nội dung chính', Arabic: 'تخطّي إلى المحتوى الرئيسي', Somali: 'U bood nuxurka', French: 'Aller au contenu principal', German: 'Zum Hauptinhalt springen'
  },
  'misc.skipToChat': {
    English: 'Skip to chat', Spanish: 'Ir al chat', Russian: 'Перейти к чату', Chinese: '跳到聊天',
    Vietnamese: 'Chuyển đến cuộc trò chuyện', Arabic: 'تخطّي إلى الدردشة', Somali: 'U bood sheekaysiga', French: 'Aller au chat', German: 'Zum Chat springen'
  },
  'misc.level': {
    English: 'Level', Spanish: 'Nivel', Russian: 'Уровень', Chinese: '等级',
    Vietnamese: 'Cấp độ', Arabic: 'المستوى', Somali: 'Heerka', French: 'Niveau', German: 'Stufe'
  }
};
