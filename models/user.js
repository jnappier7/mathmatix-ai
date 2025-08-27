// models/user.js  –  FULL FILE (paste-ready)

// Ensure this model is defined only once to avoid OverwriteModelError in dev
const mongoose = require('mongoose');
const Schema    = mongoose.Schema;
const bcrypt    = require('bcryptjs');

/* ---------- IEP SUB-SCHEMAS ---------- */
const iepGoalSchema = new Schema({
  description: { type: String, required: true },
  targetDate:  { type: Date },
  currentProgress: { type: Number, default: 0, min: 0, max: 100 },
  measurementMethod: { type: String, trim: true },
  status: { type: String, enum: ['active', 'completed', 'on-hold'], default: 'active' },
  history: [{
    date: { type: Date, default: Date.now },
    editorId: { type: Schema.Types.ObjectId, ref: 'User' },
    field: String,
    from: Schema.Types.Mixed,
    to:   Schema.Types.Mixed
  }]
}, { _id: true });

const iepAccommodationsSchema = new Schema({
  extendedTime:            { type: Boolean, default: false },
  reducedDistraction:      { type: Boolean, default: false },
  calculatorAllowed:       { type: Boolean, default: false },
  audioReadAloud:          { type: Boolean, default: false },
  chunkedAssignments:      { type: Boolean, default: false },
  breaksAsNeeded:          { type: Boolean, default: false },
  digitalMultiplicationChart:{ type: Boolean, default: false },
  largePrintHighContrast:  { type: Boolean, default: false },
  mathAnxietySupport:      { type: Boolean, default: false },
  custom:                  [{ type: String, trim: true }]
}, { _id: false });

const iepPlanSchema = new Schema({
  accommodations: { type: iepAccommodationsSchema, default: () => ({}) },
  goals:          { type: [iepGoalSchema],        default: [] }
}, { _id: false });

/* ---------- CONVERSATION / XP ---------- */
const sessionSchema = new Schema({
  date: { type: Date, default: Date.now },
  messages: [{
    role:    String,      // 'user' | 'assistant'
    content: String
  }],
  summary:       { type: String, default: null },
  activeMinutes: { type: Number, default: 0 }
}, { _id: true });

const xpEventSchema = new Schema({
  date:   { type: Date, default: Date.now },
  amount: Number,
  reason: String
}, { _id: false });

/* ---------- PARENT / CHILD LINKING ---------- */
const inviteCodeSchema = new Schema({
  code:        { type: String, unique: true, sparse: true },
  expiresAt:   { type: Date },
  childLinked: { type: Boolean, default: false }
}, { _id: false });

const studentToParentLinkCodeSchema = new Schema({
  code:         { type: String, unique: true, sparse: true },
  parentLinked: { type: Boolean, default: false }
}, { _id: false });

/* ---------- USER PREFERENCES ---------- */
const userPreferencesSchema = new Schema({
  handsFreeModeEnabled: { type: Boolean, default: false },
  typingDelayMs:        { type: Number, default: 2000, min: 0, max: 5000 },
  typeOnWpm:            { type: Number, default: 60,   min: 10, max: 200 },
  autoplayTtsHandsFree: { type: Boolean, default: true },
  theme: { type: String, enum: ['light', 'dark', 'high-contrast'], default: 'light' }
}, { _id: false });

/* ---------- BADGES ---------- */
const badgeSchema = new Schema({
  key:        { type: String, unique: true, sparse: true },
  unlockedAt: { type: Date,   default: Date.now }
}, { _id: false });

/* ---------- MAIN USER SCHEMA ---------- */
const userSchema = new Schema({
  /* Credentials */
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  email:        { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String },                       // populated only for local-strategy users
  googleId:     { type: String, unique: true, sparse: true },
  microsoftId:  { type: String, unique: true, sparse: true },

  /* Profile */
  firstName: { type: String, trim: true, required: true },
  lastName:  { type: String, trim: true, required: true },
  name:      { type: String, trim: true },              // derived in pre-save hook
  role:      { type: String, enum: ['student','teacher','parent','admin'], default: 'student' },

  /* Tutor selection */
  teacherId:        { type: Schema.Types.ObjectId, ref: 'User' },
  selectedTutorId:  { type: String, trim: true },

  /* Gamification */
  xp:        { type: Number, default: 0, min: 0 },
  level:     { type: Number, default: 1, min: 1 },
  xpHistory: { type: [xpEventSchema], default: [] },
  totalActiveTutoringMinutes:  { type: Number, default: 0 },
  weeklyActiveTutoringMinutes: { type: Number, default: 0 },
  lastWeeklyReset: { type: Date, default: Date.now },

  /* Conversations */
  activeConversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },

  /* Timestamps */
  lastLogin:  { type: Date },
  createdAt:  { type: Date, default: Date.now },

  /* Onboarding */
  needsProfileCompletion: { type: Boolean, default: true },

  /* Parent-specific fields */
  reportFrequency:   { type: String, enum: ['daily','weekly','biweekly','monthly'], default: 'weekly' },
  goalViewPreference:{ type: String, enum: ['progress','gaps','goals'], default: 'progress' },
  parentTone:        { type: String, trim: true },
  parentLanguage:    { type: String, trim: true, default: 'English' },

  /* Parent-child linking */
  children:                 [{ type: Schema.Types.ObjectId, ref: 'User' }],
  parentToChildInviteCode:   { type: inviteCodeSchema,          default: () => ({}) },
  studentToParentLinkCode:   { type: studentToParentLinkCodeSchema, default: () => ({}) },

  /* IEP Plan */
  iepPlan: { type: iepPlanSchema, default: () => ({}) },

  /* Avatar customization */
  avatar: {
    skin:   { type: String },
    hair:   { type: String },
    top:    { type: String },
    bottom: { type: String },
    accessory:  { type: String },
    lottiePath: { type: String }
  },

  /* Preferences */
  preferences: { type: userPreferencesSchema, default: () => ({}) },

  /* Tokens / Unlockables */
  tokens: { type: Number, default: 0, min: 0 },

  // ★ DEFAULT UNLOCKED TUTORS (Option A complete-profile fallback) ★
  unlockedItems: {
    type: [String],
    default: () => ['mr-nappier', 'maya', 'ms-maria', 'bob']
  },

  badges: { type: [badgeSchema], default: [] }
}, { timestamps: true });

/* ---------- PRE-SAVE HOOK ---------- */
userSchema.pre('save', async function (next) {
  if (this.isModified('passwordHash') && this.passwordHash) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  }
  if (this.isModified('firstName') || this.isModified('lastName')) {
    this.name = `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
  next();
});

/* ---------- EXPORT MODEL ---------- */
const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;
