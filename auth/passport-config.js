const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const User = require("../models/User");

// ✅ Session handling
passport.serializeUser((user, done) => {
  console.log("Passport: serializeUser called, user.id:", user.id); // DEBUG LOG
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  console.log("Passport: deserializeUser called, id:", id); // DEBUG LOG
  try {
    const user = await User.findById(id);
    if (user) {
        console.log("Passport: deserializeUser found user:", user.username || user.name); // DEBUG LOG
    } else {
        console.log("Passport: deserializeUser DID NOT find user for id:", id); // DEBUG LOG
    }
    done(null, user);
  } catch (err) {
    console.error("Passport: deserializeUser error:", err); // DEBUG LOG
    done(err, null);
  }
});

// ✅ Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://mathmatix.ai/auth/google/callback" // IMPORTANT: Ensure this matches your registered Google Cloud Console Redirect URI
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let existingUser = await User.findOne({ googleId: profile.id });

    if (existingUser) {
      console.log("Passport: GoogleStrategy - Existing user found:", existingUser.username || existingUser.name);
      // Check if profile is complete (e.g., has gradeLevel). If not, mark for completion.
      // This allows existing users who pre-date the profile completion step to be redirected.
      if (!existingUser.gradeLevel || !existingUser.mathCourse || !existingUser.learningStyle || !existingUser.tonePreference) {
          existingUser.needsProfileCompletion = true;
          console.log("Passport: GoogleStrategy - Existing user needs profile completion.");
      }
      return done(null, existingUser);
    }

    // New Google user: Create, and mark as needing profile completion
    const newUser = await User.create({
      googleId: profile.id,
      email: profile.emails?.[0]?.value || null,
      firstName: profile.name.givenName || profile.displayName.split(' ')[0] || null, // Capture first name
      lastName: profile.name.familyName || profile.displayName.split(' ').slice(1).join(' ') || null, // Capture last name
      name: profile.displayName, // Full display name if still used
      username: profile.emails?.[0]?.value ? profile.emails[0].value.split('@')[0].toLowerCase() : `googleuser_${profile.id}`, // Generate username from email or ID, ensure lowercase
      needsProfileCompletion: true, // New users from OAuth always need profile completion
      role: 'student' // Default role for new signups via OAuth
    });
    console.log("Passport: GoogleStrategy - New user created (needs profile completion):", newUser.username || newUser.name);
    return done(null, newUser);
  } catch (err) {
    console.error("Passport: GoogleStrategy error:", err);
    return done(err, null);
  }
}));

// ✅ Microsoft Strategy
passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: "/auth/microsoft/callback", // IMPORTANT: Ensure this matches your registered Azure AD Redirect URI
  scope: ['user.read']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ microsoftId: profile.id });
    if (!user) {
      // New Microsoft user
      user = await User.create({
        microsoftId: profile.id,
        email: profile.emails?.[0]?.value || null,
        firstName: profile.name.givenName || profile.displayName.split(' ')[0] || null, // Capture first name
        lastName: profile.name.familyName || profile.displayName.split(' ').slice(1).join(' ') || null, // Capture last name
        name: profile.displayName, // Full display name if still used
        username: profile.emails?.[0]?.value ? profile.emails[0].value.split('@')[0].toLowerCase() : `msuser_${profile.id}`, // Generate username
        needsProfileCompletion: true, // New users from OAuth always need profile completion
        role: 'student' // Default role for new signups via OAuth
      });
      console.log("Passport: MicrosoftStrategy - New user created (needs profile completion):", user.username || user.name);
    } else {
      console.log("Passport: MicrosoftStrategy - Existing user found:", user.username || user.name);
      // Check if profile is complete
      if (!user.gradeLevel || !user.mathCourse || !user.learningStyle || !user.tonePreference) {
          user.needsProfileCompletion = true;
          console.log("Passport: MicrosoftStrategy - Existing user needs profile completion.");
      }
    }
    return done(null, user);
  } catch (err) {
    console.error("Passport: MicrosoftStrategy error:", err);
    return done(err, null);
  }
}));