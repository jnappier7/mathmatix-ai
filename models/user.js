// models/user.js
// MODIFIED: Removed embedded 'conversations' sub-schema to prevent document bloat.
// Replaced with a reference to a new, separate 'Conversation' collection.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt = require('bcryptjs');

// Sub-schema for individual IEP goals
const iepGoalSchema = new Schema({
    description: { type: String, required: true },
    targetDate: { type: Date },
    currentProgress: { type: Number, default: 0, min: 0, max: 100 },
    measurementMethod: { type: String, trim: true },
    status: { type: String, enum: ['active', 'completed', 'on-hold'], default: 'active' },
    history: [{
        date: { type: Date, default: Date.now },
        editorId: { type: Schema.Types.ObjectId, ref: 'User' },
        field: String,
        from: Schema.Types.Mixed,
        to: Schema.Types.Mixed
    }]
}, { _id: true });

// Sub-schema for IEP accommodations
const iepAccommodationsSchema = new Schema({
    extendedTime: { type: Boolean, default: false },
    reducedDistraction: { type: Boolean, default: false },
    calculatorAllowed: { type: Boolean, default: false },
    audioReadAloud: { type: Boolean, default: false },
    chunkedAssignments: { type: Boolean, default: false },
    breaksAsNeeded: { type: Boolean, default: false },
    digitalMultiplicationChart: { type: Boolean, default: false },
    largePrintHighContrast: { type: Boolean, default: false },
    mathAnxietySupport: { type: Boolean, default: false },
    custom: [{ type: String, trim: true }]
}, { _id: false });

// Sub-schema for IEP Plan
const iepPlanSchema = new Schema({
    accommodations: { type: iepAccommodationsSchema, default: () => ({}) },
    goals: { type: [iepGoalSchema], default: [] }
}, { _id: false });

// Sub-schema for XP events
const xpEventSchema = new Schema({
    date: { type: Date, default: Date.now },
    amount: Number,
    reason: String
}, { _id: false });

// Sub-schema for parent-child invite code
const inviteCodeSchema = new Schema({
    code: { type: String, unique: true, sparse: true },
    expiresAt: { type: Date },
    childLinked: { type: Boolean, default: false }
}, { _id: false });

// Sub-schema for student-to-parent linking code
const studentToParentLinkCodeSchema = new Schema({
    code: { type: String, unique: true, sparse: true },
    parentLinked: { type: Boolean, default: false }
}, { _id: false });

// Sub-schema for user preferences/settings
const userPreferencesSchema = new Schema({
    handsFreeModeEnabled: { type: Boolean, default: false },
    typingDelayMs: { type: Number, default: 2000, min: 0, max: 5000 },
    typeOnWpm: { type: Number, default: 60, min: 10, max: 200 },
    autoplayTtsHandsFree: { type: Boolean, default: true },
    theme: { type: String, enum: ['light', 'dark', 'high-contrast'], default: 'light' }
}, { _id: false });

// Sub-schema for badge tracking
const badgeSchema = new Schema({
    key: { type: String, unique: true, sparse: true },
    unlockedAt: { type: Date, default: Date.now }
}, { _id: false });

// Main User Schema
const userSchema = new Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    microsoftId: { type: String, unique: true, sparse: true },
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, required: true },
    name: { type: String, trim: true },
    role: {
        type: String,
        enum: ["student", "teacher", "parent", "admin"],
        default: "student",
        required: true
    },
    gradeLevel: { type: String, trim: true },
    mathCourse: { type: String, trim: true },
    tonePreference: { type: String, trim: true },
    learningStyle: { type: String, trim: true },
    interests: [{ type: String, trim: true }],
    teacherId: { type: Schema.Types.ObjectId, ref: 'User' },
    selectedTutorId: { type: String, trim: true },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    xpHistory: { type: [xpEventSchema], default: [] },
    totalActiveTutoringMinutes: { type: Number, default: 0, min: 0 },
    weeklyActiveTutoringMinutes: { type: Number, default: 0, min: 0 },
    lastWeeklyReset: { type: Date, default: Date.now },
    
    // *** MODIFICATION START ***
    // The 'conversations' array is removed from here to prevent document size issues.
    // It will be managed in its own 'Conversation' collection.
    // We can add a field to reference the currently active session if needed.
    activeConversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
    // *** MODIFICATION END ***

    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now },
    needsProfileCompletion: { type: Boolean, default: true },
    reportFrequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly'], default: 'weekly' },
    goalViewPreference: { type: String, enum: ['progress', 'gaps', 'goals'], default: 'progress' },
    parentTone: { type: String, trim: true },
    parentLanguage: { type: String, trim: true, default: 'English' },
    children: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    parentToChildInviteCode: { type: inviteCodeSchema, default: () => ({}) },
    studentToParentLinkCode: { type: studentToParentLinkCodeSchema, default: () => ({}) },
    iepPlan: { type: iepPlanSchema, default: () => ({}) },
    avatar: {
        skin: { type: String },
        hair: { type: String },
        top: { type: String },
        bottom: { type: String },
        accessory: { type: String },
        lottiePath: { type: String }
    },
    preferences: { type: userPreferencesSchema, default: () => ({}) },
    tokens: { type: Number, default: 0, min: 0 },
    unlockedItems: [{ type: String, trim: true }],
    badges: { type: [badgeSchema], default: [] }
}, { timestamps: true });

// Pre-save hook to hash password and set full name
userSchema.pre('save', async function (next) {
    if (this.isModified('passwordHash') && this.passwordHash) {
        this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
    }
    if (this.isModified('firstName') || this.isModified('lastName')) {
        this.name = `${this.firstName || ''} ${this.lastName || ''}`.trim();
    }
    next();
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;