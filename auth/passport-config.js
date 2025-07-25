// auth/passport-config.js - PHASE 1: Backend Routing & Core Setup
// Final CORRECTED VERSION with OAuth Linking and consistent logging.

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const LocalStrategy = require("passport-local").Strategy;
const User = require("../models/user"); //
const bcrypt = require("bcryptjs"); //

// Session handling
passport.serializeUser((user, done) => { //
  console.log('LOG: serializeUser called. User ID:', user.id); //
  done(null, user.id); //
});

passport.deserializeUser(async (id, done) => { //
  console.log('LOG: deserializeUser called. User ID:', id); //
  try {
    const user = await User.findById(id); //
    if (user) { //
      console.log('LOG: deserializeUser found user:', user.username, 'Role:', user.role); //
    } else { //
      console.warn('WARN: deserializeUser could not find user for ID:', id); //
    }
    done(null, user); //
  } catch (err) {
    console.error('ERROR: deserializeUser error for ID:', id, 'Error:', err); //
    done(err, null); //
  }
});

// Local Strategy for username/password
passport.use(new LocalStrategy(
  {
    usernameField: 'username', //
    passwordField: 'password' //
  },
  async (username, password, done) => {
    try {
      const user = await User.findOne({ username: username.toLowerCase() }); //
      if (!user) { //
        return done(null, false, { message: 'Incorrect username or password.' }); //
      }
      const isMatch = await bcrypt.compare(password, user.passwordHash); //
      if (!isMatch) { //
        return done(null, false, { message: 'Incorrect username or password.' }); //
      }
      console.log('LOG: LocalStrategy authenticated user:', user.username); //
      return done(null, user); //
    } catch (err) {
      console.error('ERROR: LocalStrategy error:', err); //
      return done(err); //
    }
  }
));

// Google Strategy - WITH THE VERIFY CALLBACK RESTORED AND EMAIL LINKING
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID, //
    clientSecret: process.env.GOOGLE_CLIENT_SECRET, //
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback" //
}, async (accessToken, refreshToken, profile, done) => { //
    try {
        const userEmail = profile.emails?.[0]?.value; //

        // 1. Check if user already exists with this Google ID
        let existingUser = await User.findOne({ googleId: profile.id }); //
        if (existingUser) { //
            console.log('LOG: GoogleStrategy found existing user by Google ID:', existingUser.username); //
            return done(null, existingUser); //
        }

        // 2. If not found by Google ID, check if user exists with this email (potential for linking)
        if (userEmail) { //
            existingUser = await User.findOne({ email: userEmail }); //
            if (existingUser) { //
                // User exists with this email, so link Google ID to this account
                if (!existingUser.googleId) { // Prevent overwriting if already linked
                    existingUser.googleId = profile.id; //
                    await existingUser.save(); //
                    console.log('LOG: GoogleStrategy linked existing user by email:', existingUser.username); //
                    return done(null, existingUser); //
                } else {
                    // This scenario means an existing user with this email also has a googleId,
                    // but the new Google login's profile.id doesn't match the existing googleId.
                    // This could be a security risk or a data anomaly. For now, we deny login
                    // to prevent account hijacking, user should unlink first or contact support.
                    console.warn('WARN: GoogleStrategy found existing user by email but Google ID mismatch. Denying login to prevent overwriting.'); //
                    return done(null, false, { message: 'An account with this email already exists but is linked to a different Google account. Please use that Google account or sign in with your other method.' }); //
                }
            }
        }

        // 3. If no existing user found by Google ID or email, create a new user
        const newUser = await User.create({
            googleId: profile.id, //
            email: userEmail, //
            firstName: profile.name.givenName, //
            lastName: profile.name.familyName, //
            name: profile.displayName, //
            // Ensure username is always generated and unique on creation
            username: userEmail ? userEmail.split('@')[0].toLowerCase() + Math.floor(Math.random() * 1000) : 'google_user_' + profile.id, //
            needsProfileCompletion: true, //
            role: 'student' //
        });
        console.log('LOG: GoogleStrategy created new user:', newUser.username); //
        return done(null, newUser); //
    } catch (err) {
        console.error('ERROR: GoogleStrategy error:', err); //
        // Specifically check for duplicate email errors here to provide a more specific message
        if (err.code === 11000 && err.keyPattern && err.keyPattern.email) { //
            return done(null, false, { message: 'An account with this email already exists. Please sign in using your existing method or try another email.' }); //
        }
        return done(err, null); //
    }
}));

// Microsoft Strategy - WITH THE VERIFY CALLBACK RESTORED AND EMAIL LINKING
passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID, //
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET, //
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || "http://localhost:5000/auth/microsoft/callback", //
    scope: ['user.read'] //
}, async (accessToken, refreshToken, profile, done) => { //
    try {
        const userEmail = profile.emails?.[0]?.value; //

        // 1. Check if user already exists with this Microsoft ID
        let existingUser = await User.findOne({ microsoftId: profile.id }); //
        if (existingUser) { //
            console.log('LOG: MicrosoftStrategy found existing user by Microsoft ID:', existingUser.username); //
            return done(null, existingUser); //
        }

        // 2. If not found by Microsoft ID, check if user exists with this email (potential for linking)
        if (userEmail) { //
            existingUser = await User.findOne({ email: userEmail }); //
            if (existingUser) { //
                // User exists with this email, so link Microsoft ID to this account
                if (!existingUser.microsoftId) { // Prevent overwriting if already linked
                    existingUser.microsoftId = profile.id; //
                    await existingUser.save(); //
                    console.log('LOG: MicrosoftStrategy linked existing user by email:', existingUser.username); //
                    return done(null, existingUser); //
                } else {
                    // Existing user with this email also has a microsoftId, but mismatch.
                    // Deny login to prevent account hijacking.
                    console.warn('WARN: MicrosoftStrategy found existing user by email but Microsoft ID mismatch. Denying login to prevent overwriting.'); //
                    return done(null, false, { message: 'An account with this email already exists but is linked to a different Microsoft account. Please use that Microsoft account or sign in with your other method.' }); //
                }
            }
        }

        // 3. If no existing user found by Microsoft ID or email, create a new user
        const newUser = await User.create({
            microsoftId: profile.id, //
            email: userEmail, //
            firstName: profile.name.givenName, //
            lastName: profile.name.familyName, //
            name: profile.displayName, //
            // Ensure username is always generated and unique on creation
            username: userEmail ? userEmail.split('@')[0].toLowerCase() + Math.floor(Math.random() * 1000) : 'microsoft_user_' + profile.id, //
            needsProfileCompletion: true, //
            role: 'student' //
        });
        console.log('LOG: MicrosoftStrategy created new user:', newUser.username); //
        return done(null, newUser); //
    } catch (err) {
        console.error('ERROR: MicrosoftStrategy error:', err); //
        // Specifically check for duplicate email errors here to provide a more specific message
        if (err.code === 11000 && err.keyPattern && err.keyPattern.email) { //
            return done(null, false, { message: 'An account with this email already exists. Please sign in using your existing method or try another email.' }); //
        }
        return done(err, null); //
    }
}));