// models/user.js - PHASE 1: Backend Routing & Core Setup - Batch 5
// This file defines your Mongoose User model. It is NOT an Express router.

// Ensure this file only defines the model once to avoid OverwriteModelError in dev
const mongoose = require('mongoose'); //
const Schema = mongoose.Schema; //
const bcrypt = require('bcryptjs'); // Using bcryptjs as confirmed

// Sub-schema for individual IEP goals
const iepGoalSchema = new Schema({ //
    description: { type: String, required: true }, //
    targetDate: { type: Date }, //
    currentProgress: { type: Number, default: 0, min: 0, max: 100 }, //
    measurementMethod: { type: String, trim: true }, //
    status: { type: String, enum: ['active', 'completed', 'on-hold'], default: 'active' }, //
    // History of changes for this specific goal
    history: [{ //
        date: { type: Date, default: Date.now }, //
        editorId: { type: Schema.Types.ObjectId, ref: 'User' }, // Who made the change
        field: String, // e.g., 'currentProgress', 'status'
        from: Schema.Types.Mixed, //
        to: Schema.Types.Mixed //
    }]
}, { _id: true }); // Ensure sub-documents get an _id

// Sub-schema for IEP accommodations
const iepAccommodationsSchema = new Schema({ //
    // Presets as booleans
    extendedTime: { type: Boolean, default: false }, //
    reducedDistraction: { type: Boolean, default: false }, //
    calculatorAllowed: { type: Boolean, default: false }, //
    audioReadAloud: { type: Boolean, default: false }, //
    chunkedAssignments: { type: Boolean, default: false }, //
    breaksAsNeeded: { type: Boolean, default: false }, //
    digitalMultiplicationChart: { type: Boolean, default: false }, //
    largePrintHighContrast: { type: Boolean, default: false }, //
    mathAnxietySupport: { type: Boolean, default: false }, //
    // Custom free-text accommodations
    custom: [{ type: String, trim: true }] //
}, { _id: false }); //

// Sub-schema for IEP Plan (combining goals and accommodations)
const iepPlanSchema = new Schema({ //
    accommodations: { type: iepAccommodationsSchema, default: () => ({}) }, //
    goals: { type: [iepGoalSchema], default: [] }, //
    readingLevel:      { type: Number, default: null }, //
    preferredScaffolds:{ type: [String], default: [] } //
}, { _id: false }); //


// Sub-schema for conversation sessions
const sessionSchema = new Schema({ //
    date: { type: Date, default: Date.now }, //
    messages: [{ // Storing full message log for live buffer
        role: String, // 'user' or 'assistant'
        content: String //
    }],
    summary: { type: String, default: null }, // 250-token summary
    activeMinutes: { type: Number, default: 0 } // Track active time
}, { _id: true }); //

// Sub-schema for XP events
const xpEventSchema = new Schema({ //
    date: { type: Date, default: Date.now }, //
    amount: Number, //
    reason: String //
}, { _id: false }); // No _id needed for sub-documents in array

// Sub-schema for parent-child invite code
const inviteCodeSchema = new Schema({ //
    code: { type: String, unique: true, sparse: true }, //
    expiresAt: { type: Date }, //
    childLinked: { type: Boolean, default: false } // For parent's code when generating
}, { _id: false }); //

// Sub-schema for student-to-parent linking code
const studentToParentLinkCodeSchema = new Schema({ //
    code: { type: String, unique: true, sparse: true }, //
    parentLinked: { type: Boolean, default: false } // For student's code to be linked by parent
}, { _id: false }); //

// Sub-schema for user preferences/settings that aren't profile completion
const userPreferencesSchema = new Schema({ //
    handsFreeModeEnabled: { type: Boolean, default: false }, //
    typingDelayMs: { type: Number, default: 2000, min: 0, max: 5000 }, //
    typeOnWpm: { type: Number, default: 60, min: 10, max: 200 }, //
    autoplayTtsHandsFree: { type: Boolean, default: true }, //
    // Other settings: e.g., theme, notification preferences
    theme: { type: String, enum: ['light', 'dark', 'high-contrast'], default: 'light' } //
}, { _id: false }); //

// Sub-schema for badge tracking
const badgeSchema = new Schema({ //
    key: { type: String, unique: true, sparse: true }, // Unique identifier for the badge
    unlockedAt: { type: Date, default: Date.now } //
}, { _id: false }); //

// Main User Schema
const userSchema = new Schema({ //
    username: { type: String, required: true, unique: true, trim: true, lowercase: true }, //
    email: { type: String, required: true, unique: true, trim: true, lowercase: true }, //
    passwordHash: { type: String }, // Required for local strategy
    
    // OAuth IDs (optional, only if user logs in via social providers)
    googleId: { type: String, unique: true, sparse: true }, //
    microsoftId: { type: String, unique: true, sparse: true }, //

    firstName: { type: String, trim: true, required: true }, //
    lastName: { type: String, trim: true, required: true }, //
    name: { type: String, trim: true }, // Full name, derived from first/last

    role: { //
        type: String, //
        enum: ["student", "teacher", "parent", "admin"], //
        default: "student", //
        required: true //
    },

    // Student-specific profile fields
    gradeLevel: { type: String, trim: true }, //
    mathCourse: { type: String, trim: true }, //
    tonePreference: { type: String, trim: true }, // e.g., 'Chill', 'Motivational', 'Serious'
    learningStyle: { type: String, trim: true }, // e.g., 'Visual', 'Auditory', 'Kinesthetic'
    interests: [{ type: String, trim: true }], // Array of interests

    // Tutor assignment (for students)
    teacherId: { type: Schema.Types.ObjectId, ref: 'User' }, // Teacher assigned to student
    selectedTutorId: { type: String, trim: true }, // The ID from tutorConfig.js (e.g., 'mr-nappier')

    // Gamification & Progress
    xp: { type: Number, default: 0, min: 0 }, //
    level: { type: Number, default: 1, min: 1 }, //
    xpHistory: { type: [xpEventSchema], default: [] }, // Detailed log of XP gains
    totalActiveTutoringMinutes: { type: Number, default: 0, min: 0 }, //
    weeklyActiveTutoringMinutes: { type: Number, default: 0, min: 0 }, // For weekly reports
    lastWeeklyReset: { type: Date, default: Date.now }, // Timestamp of last weekly reset

    // Conversation History & Summaries
    conversations: { type: [sessionSchema], default: [] }, // Full sessions (messages + summary)
    lastLogin: { type: Date }, // Track last login time
    createdAt: { type: Date, default: Date.now }, // Account creation date

    // Onboarding Status
    needsProfileCompletion: { type: Boolean, default: true }, //

    // Parent-specific fields
    reportFrequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly'], default: 'weekly' }, //
    goalViewPreference: { type: String, enum: ['progress', 'gaps', 'goals'], default: 'progress' }, //
    parentTone: { type: String, trim: true }, //
    parentLanguage: { type: String, trim: true, default: 'English' }, //
    
    // Parent-Child Linking
    children: [{ type: Schema.Types.ObjectId, ref: 'User' }], // Array of student IDs linked to this parent
    parentToChildInviteCode: { type: inviteCodeSchema, default: () => ({}) }, // Code a parent generates for a new student signup
    studentToParentLinkCode: { type: studentToParentLinkCodeSchema, default: () => ({}) }, // Code a student generates for an existing parent to link

    // IEP Plan - NEW INTEGRATION
    iepPlan: { type: iepPlanSchema, default: () => ({}) }, //

    // Avatar Customization (beyond selected tutor image)
    avatar: { //
        skin: { type: String }, //
        hair: { type: String }, //
        top: { type: String }, //
        bottom: { type: String }, //
        accessory: { type: String }, //
        lottiePath: { type: String } // For custom Lottie animations
    },

    // User preferences / settings
    preferences: { type: userPreferencesSchema, default: () => ({}) }, //

    // Gamification - Tokens & Unlocks
    tokens: { type: Number, default: 0, min: 0 }, //
    unlockedItems: [{ type: String, trim: true }], // Array of IDs for unlocked tutors, backgrounds, emotes
    badges: { type: [badgeSchema], default: [] } // Array of earned badges
}, { timestamps: true }); // Mongoose adds createdAt and updatedAt


// Pre-save hook to hash password and set full name
userSchema.pre('save', async function (next) { //
    // Hash password only if it's new or modified
    if (this.isModified('passwordHash') && this.passwordHash) { //
        this.passwordHash = await bcrypt.hash(this.passwordHash, 10); //
    }
    // Set full name (name field)
    if (this.isModified('firstName') || this.isModified('lastName')) { //
        this.name = `${this.firstName || ''} ${this.lastName || ''}`.trim(); //
    }
    next(); //
});

// Avoid Mongoose.MongooseError: OverwriteModelError: Cannot overwrite `User` model if already defined.
// This is crucial for development where models might be re-required.
const User = mongoose.models.User || mongoose.model('User', userSchema); //
module.exports = User; //