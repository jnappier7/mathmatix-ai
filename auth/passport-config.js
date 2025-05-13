const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

passport.serializeUser((user, done) => {
  done(null, user.id); // save MongoDB user ID in session
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const existingUser = await User.findOne({ googleId: profile.id });

    if (existingUser) {
      return done(null, existingUser);
    }

    // Create new user with Google profile info (partial)
    const newUser = new User({
      googleId: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName
    });

    await newUser.save();
    done(null, newUser);
  } catch (err) {
    done(err, null);
  }
	const MicrosoftStrategy = require("passport-microsoft").Strategy;

passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: "/auth/microsoft/callback",
  scope: ['user.read']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ microsoftId: profile.id });
    if (!user) {
      user = await User.create({
        microsoftId: profile.id,
        email: profile.emails?.[0]?.value || null,
        name: profile.displayName
      });
    }
    return done(null, user);
  } catch (err) {
    done(err, null);
  }
}));


