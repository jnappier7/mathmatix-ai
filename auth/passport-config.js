// auth/passport-config.js - FINAL CORRECTED VERSION

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const LocalStrategy = require("passport-local").Strategy;
const User = require("../models/user");
const bcrypt = require("bcryptjs");

// Session handling
passport.serializeUser((user, done) => {
  console.log('LOG: serializeUser called. User ID:', user.id); // Add log
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  console.log('LOG: deserializeUser called. User ID:', id); // Add log for ID
  try {
    const user = await User.findById(id);
    if (user) {
      console.log('LOG: deserializeUser found user:', user.username, 'Role:', user.role); // Add log if user found
    } else {
      console.warn('WARN: deserializeUser could not find user for ID:', id); // Add log if user not found
    }
    done(null, user);
  } catch (err) {
    console.error('ERROR: deserializeUser error for ID:', id, 'Error:', err); // Add error log
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
      console.log('LOG: LocalStrategy authenticated user:', user.username); // Add log
      return done(null, user);
    } catch (err) {
      console.error('ERROR: LocalStrategy error:', err); // Add error log
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
            console.log('LOG: GoogleStrategy found existing user:', existingUser.username); // Add log
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
        console.log('LOG: GoogleStrategy created new user:', newUser.username); // Add log
        return done(null, newUser);
    } catch (err) {
        console.error('ERROR: GoogleStrategy error:', err); // Add error log
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
            console.log('LOG: MicrosoftStrategy found existing user:', user.username); // Add log
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
        console.log('LOG: MicrosoftStrategy created new user:', user.username); // Add log
        return done(null, user);
    } catch (err) {
        console.error('ERROR: MicrosoftStrategy error:', err); // Add error log
        return done(err, null);
    }
}));