// auth/passport-config.js - FINAL CORRECTED VERSION

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const LocalStrategy = require("passport-local").Strategy;
const User = require("../models/User");
const bcrypt = require("bcryptjs");

// Session handling
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
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
      const user = await User.findOne({ username: username.toLowerCase() });
      if (!user) {
        return done(null, false, { message: 'Incorrect username or password.' });
      }
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect username or password.' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Google Strategy - WITH THE VERIFY CALLBACK RESTORED
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let existingUser = await User.findOne({ googleId: profile.id });
        if (existingUser) {
            return done(null, existingUser);
        }
        const newUser = await User.create({
            googleId: profile.id,
            email: profile.emails?.[0]?.value,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            name: profile.displayName,
            username: profile.emails?.[0]?.value.split('@')[0].toLowerCase() + Math.floor(Math.random() * 1000), // Add random numbers to avoid collision
            needsProfileCompletion: true,
            role: 'student'
        });
        return done(null, newUser);
    } catch (err) {
        return done(err, null);
    }
}));

// Microsoft Strategy - WITH THE VERIFY CALLBACK RESTORED
passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || "http://localhost:5000/auth/microsoft/callback",
    scope: ['user.read']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ microsoftId: profile.id });
        if (user) {
            return done(null, user);
        }
        user = await User.create({
            microsoftId: profile.id,
            email: profile.emails?.[0]?.value,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            name: profile.displayName,
            username: profile.emails?.[0]?.value.split('@')[0].toLowerCase() + Math.floor(Math.random() * 1000),
            needsProfileCompletion: true,
            role: 'student'
        });
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));