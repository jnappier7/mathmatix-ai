// auth/passport-config.js

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const LocalStrategy = require("passport-local").Strategy;
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const { generateUniqueStudentLinkCode } = require('../routes/student');

// Session handling
passport.serializeUser((user, done) => {
  console.log('LOG: serializeUser called. User ID:', user.id);
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  console.log('LOG: deserializeUser called. User ID:', id);
  try {
    const user = await User.findById(id);
    if (user) {
      console.log('LOG: deserializeUser found user:', user.username, 'Role:', user.role);
    } else {
      console.warn('WARN: deserializeUser could not find user for ID:', id);
    }
    done(null, user);
  } catch (err) {
    console.error('ERROR: deserializeUser error for ID:', id, 'Error:', err);
    done(err, null);
  }
});

// Local Strategy for username/password
passport.use(new LocalStrategy(
  {
    usernameField: 'username',
    passwordField: 'password'
  },
  async (username, password, done) => {
    try {
      const user = await User.findOne({ username: username.trim().toLowerCase() });
      if (!user) {
        return done(null, false, { message: 'Incorrect username or password.' });
      }
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect username or password.' });
      }
      console.log('LOG: LocalStrategy authenticated user:', user.username);
      return done(null, user);
    } catch (err) {
      console.error('ERROR: LocalStrategy error:', err);
      return done(err);
    }
  }
));

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const userEmail = profile.emails?.[0]?.value;

        let existingUser = await User.findOne({ googleId: profile.id });
        if (existingUser) {
            console.log('LOG: GoogleStrategy found existing user by Google ID:', existingUser.username);
            return done(null, existingUser);
        }

        if (userEmail) {
            existingUser = await User.findOne({ email: userEmail });
            if (existingUser) {
                if (!existingUser.googleId) {
                    existingUser.googleId = profile.id;
                    await existingUser.save();
                    console.log('LOG: GoogleStrategy linked existing user by email:', existingUser.username);
                    return done(null, existingUser);
                } else {
                    console.warn('WARN: GoogleStrategy found existing user by email but Google ID mismatch.');
                    return done(null, false, { message: 'An account with this email already exists but is linked to a different Google account.' });
                }
            }
        }

        const newLinkCode = await generateUniqueStudentLinkCode();
        const newUser = await User.create({
            googleId: profile.id,
            email: userEmail,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            name: profile.displayName,
            username: userEmail ? userEmail.split('@')[0].toLowerCase() + Math.floor(Math.random() * 1000) : 'google_user_' + profile.id,
            needsProfileCompletion: true,
            role: 'student',
            xp: 0,
            level: 1,
            studentToParentLinkCode: { code: newLinkCode },
            // --- FIX APPLIED HERE ---
            unlockedItems: ['mr-nappier', 'maya', 'ms-maria', 'bob']
        });
        console.log('LOG: GoogleStrategy created new user:', newUser.username);
        return done(null, newUser);
    } catch (err) {
        console.error('ERROR: GoogleStrategy error:', err);
        if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
            return done(null, false, { message: 'An account with this email already exists.' });
        }
        return done(err, null);
    }
}));

// Microsoft Strategy
passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || "http://localhost:5000/auth/microsoft/callback",
    scope: ['user.read']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const userEmail = profile.emails?.[0]?.value;

        let existingUser = await User.findOne({ microsoftId: profile.id });
        if (existingUser) {
            console.log('LOG: MicrosoftStrategy found existing user by Microsoft ID:', existingUser.username);
            return done(null, existingUser);
        }

        if (userEmail) {
            existingUser = await User.findOne({ email: userEmail });
            if (existingUser) {
                if (!existingUser.microsoftId) {
                    existingUser.microsoftId = profile.id;
                    await existingUser.save();
                    console.log('LOG: MicrosoftStrategy linked existing user by email:', existingUser.username);
                    return done(null, existingUser);
                } else {
                    console.warn('WARN: MicrosoftStrategy found existing user by email but Microsoft ID mismatch.');
                    return done(null, false, { message: 'An account with this email already exists but is linked to a different Microsoft account.' });
                }
            }
        }

        const newLinkCode = await generateUniqueStudentLinkCode();
        const newUser = await User.create({
            microsoftId: profile.id,
            email: userEmail,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            name: profile.displayName,
            username: userEmail ? userEmail.split('@')[0].toLowerCase() + Math.floor(Math.random() * 1000) : 'microsoft_user_' + profile.id,
            needsProfileCompletion: true,
            role: 'student',
            xp: 0,
            level: 1,
            studentToParentLinkCode: { code: newLinkCode },
            unlockedItems: ['mr-nappier', 'maya', 'ms-maria', 'bob']
        });
        console.log('LOG: MicrosoftStrategy created new user:', newUser.username);
        return done(null, newUser);
    } catch (err) {
        console.error('ERROR: MicrosoftStrategy error:', err);
        if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
            return done(null, false, { message: 'An account with this email already exists.' });
        }
        return done(err, null);
    }
}));