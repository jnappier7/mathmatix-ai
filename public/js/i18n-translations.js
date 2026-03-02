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
  'login.username': {
    English: 'Username', Spanish: 'Nombre de usuario', Russian: 'Имя пользователя', Chinese: '用户名',
    Vietnamese: 'Tên đăng nhập', Arabic: 'اسم المستخدم', Somali: 'Magaca isticmaalaha', French: 'Nom d\'utilisateur', German: 'Benutzername'
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
  'login.usernamePlaceholder': {
    English: 'Enter your username', Spanish: 'Ingresa tu nombre de usuario', Russian: 'Введите имя пользователя', Chinese: '输入用户名',
    Vietnamese: 'Nhập tên đăng nhập', Arabic: 'أدخل اسم المستخدم', Somali: 'Geli magacaaga', French: 'Entrez votre nom d\'utilisateur', German: 'Benutzername eingeben'
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
    English: 'My Sessions', Spanish: 'Mis sesiones', Russian: 'Мои сессии', Chinese: '我的会话',
    Vietnamese: 'Phiên của tôi', Arabic: 'جلساتي', Somali: 'Fadhiyaadkayga', French: 'Mes sessions', German: 'Meine Sitzungen'
  },
  'chat.searchSessions': {
    English: 'Search sessions...', Spanish: 'Buscar sesiones...', Russian: 'Поиск сессий...', Chinese: '搜索会话…',
    Vietnamese: 'Tìm kiếm phiên...', Arabic: 'البحث في الجلسات...', Somali: 'Raadi fadhiyaadka...', French: 'Rechercher des sessions…', German: 'Sitzungen suchen…'
  },
  'chat.newSession': {
    English: 'New Session', Spanish: 'Nueva sesión', Russian: 'Новая сессия', Chinese: '新会话',
    Vietnamese: 'Phiên mới', Arabic: 'جلسة جديدة', Somali: 'Fadhiyaad cusub', French: 'Nouvelle session', German: 'Neue Sitzung'
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
  'settings.handsFreeMode': {
    English: 'Hands-Free Mode', Spanish: 'Modo manos libres', Russian: 'Режим без рук', Chinese: '免提模式',
    Vietnamese: 'Chế độ rảnh tay', Arabic: 'الوضع بدون استخدام اليدين', Somali: 'Habka gacmo-furnaanta', French: 'Mode mains libres', German: 'Freisprechmodus'
  },
  'settings.autoplayAudio': {
    English: 'Autoplay Audio', Spanish: 'Reproducción automática', Russian: 'Автоматическое воспроизведение', Chinese: '自动播放音频',
    Vietnamese: 'Tự động phát âm thanh', Arabic: 'تشغيل تلقائي للصوت', Somali: 'Dhagaysi toos ah', French: 'Lecture automatique', German: 'Audio automatisch abspielen'
  },
  'settings.voiceChatOrb': {
    English: 'Voice Chat Orb', Spanish: 'Orbe de chat de voz', Russian: 'Кнопка голосового чата', Chinese: '语音聊天球',
    Vietnamese: 'Quả cầu chat thoại', Arabic: 'زرّ الدردشة الصوتية', Somali: 'Badhanka codka sheekaysiga', French: 'Bouton de chat vocal', German: 'Sprachchat-Button'
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
