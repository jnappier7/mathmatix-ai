// auth/passport-config.js
const passport            = require("passport");
const GoogleStrategy      = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy   = require("passport-microsoft").Strategy;
const LocalStrategy       = require("passport-local").Strategy;
const User                = require("../models/user");
const bcrypt              = require("bcryptjs");
const { generateUniqueStudentLinkCode } = require("../routes/student");

/**
 * Generate a unique username from a display name
 * Checks database to ensure no collisions occur
 */
async function generateUniqueUsername(displayName, providerId) {
  const baseUsername = displayName.replace(/\s+/g, "").toLowerCase();

  // Check if base username is available
  let existingUser = await User.findOne({ username: baseUsername });
  if (!existingUser) {
    return baseUsername;
  }

  // If taken, append unique suffix from provider ID
  const suffix = providerId.substring(0, 6);
  const uniqueUsername = `${baseUsername}_${suffix}`;

  // Check again with suffix
  existingUser = await User.findOne({ username: uniqueUsername });
  if (!existingUser) {
    return uniqueUsername;
  }

  // If still taken (very rare), append timestamp
  const timestamp = Date.now().toString().slice(-4);
  return `${baseUsername}_${timestamp}`;
}

/* --------------------------  SESSION HANDLING  -------------------------- */
passport.serializeUser((user, done) => {
  console.log("LOG: serializeUser called. User ID:", user.id);
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  console.log("LOG: deserializeUser called. User ID:", id);
  try {
    const user = await User.findById(id);
    if (user) {
      console.log("LOG: deserializeUser found user:", user.username, "Role:", user.role);
    } else {
      console.warn("WARN: deserializeUser could not find user for ID:", id);
    }
    done(null, user);
  } catch (err) {
    console.error("ERROR: deserializeUser error for ID:", id, "Error:", err);
    done(err, null);
  }
});

/* ----------------------------  LOCAL STRATEGY --------------------------- */
passport.use(
  new LocalStrategy(
    { usernameField: "username", passwordField: "password" },
    async (username, password, done) => {
      try {
        const user = await User.findOne({ username: username.trim().toLowerCase() });
        if (!user) return done(null, false, { message: "Incorrect username or password." });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return done(null, false, { message: "Incorrect username or password." });

        console.log("LOG: LocalStrategy authenticated user:", user.username);
        return done(null, user);
      } catch (err) {
        console.error("ERROR: LocalStrategy error:", err);
        return done(err);
      }
    }
  )
);

/* ---------------------------  GOOGLE STRATEGY --------------------------- */
passport.use(
  new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        `http://localhost:${process.env.PORT || 3000}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const userEmail = profile.emails?.[0]?.value;

        // 🛠 helper to extract names + determine profile-completion need
        function extractNames(p) {
          const givenRaw   = p.name?.givenName?.trim()   || "";
          const familyRaw  = p.name?.familyName?.trim()  || "";
          const displayArr = (p.displayName || "").trim().split(/\s+/);

          const firstName  = givenRaw  || displayArr[0] || "NoFirst";
          const lastName   = familyRaw || displayArr.slice(1).join(" ") || "NoLast";
          const needsFix   = firstName.startsWith("No") || lastName.startsWith("No");
          return { firstName, lastName, needsFix };
        }
        /* -------------------------------------------------------------- */

        /* ---------- 1. Existing user by Google ID --------------------- */
        let existingUser = await User.findOne({ googleId: profile.id });
        if (existingUser) {
          // Patch missing names if necessary
          if (!existingUser.firstName || !existingUser.lastName) {
            const { firstName, lastName, needsFix } = extractNames(profile);
            existingUser.firstName = existingUser.firstName || firstName;
            existingUser.lastName  = existingUser.lastName  || lastName;
            existingUser.needsProfileCompletion = needsFix;
            await existingUser.save();
          }
          return done(null, existingUser);
        }

        /* ---------- 2. Existing user by email ------------------------ */
        if (userEmail) {
          existingUser = await User.findOne({ email: userEmail });
          if (existingUser) {
            // Link Google ID if not present
            if (!existingUser.googleId) {
              existingUser.googleId = profile.id;
              // Also fill names if still missing
              if (!existingUser.firstName || !existingUser.lastName) {
                const { firstName, lastName, needsFix } = extractNames(profile);
                existingUser.firstName = existingUser.firstName || firstName;
                existingUser.lastName  = existingUser.lastName  || lastName;
                existingUser.needsProfileCompletion = needsFix;
              }
              await existingUser.save();
            }
            return done(null, existingUser);
          }
        }

        /* ---------- 3. Brand-new user ------------------------------- */
        const { firstName, lastName, needsFix } = extractNames(profile);

        const newUser = new User({
          username: await generateUniqueUsername(profile.displayName, profile.id),
          email:    userEmail || undefined,
          googleId: profile.id,
          role:     "student",
          firstName,
          lastName,
          needsProfileCompletion: needsFix,          // 🔑 triggers /complete-profile.html redirect
          linkCode: await generateUniqueStudentLinkCode(),
          avatar:   profile.photos?.[0]?.value
        });

        await newUser.save();
        console.log("LOG: GoogleStrategy created new user:", newUser.username);
        return done(null, newUser);
      } catch (err) {
        console.error("ERROR: GoogleStrategy error:", err);
        return done(err, null);
      }
    }
  )
);

/* -------------------------  MICROSOFT STRATEGY -------------------------- */
passport.use(
  new MicrosoftStrategy(
    {
      clientID:     process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL:
        process.env.MICROSOFT_CALLBACK_URL ||
        `http://localhost:${process.env.PORT || 3000}/auth/microsoft/callback`,
      scope: ["user.read"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const userEmail = profile.emails?.[0]?.value;

        // 1. Existing by MS ID
        let existingUser = await User.findOne({ microsoftId: profile.id });
        if (existingUser) return done(null, existingUser);

        // 2. Existing by email
        if (userEmail) {
          existingUser = await User.findOne({ email: userEmail });
          if (existingUser) {
            if (!existingUser.microsoftId) {
              existingUser.microsoftId = profile.id;
              await existingUser.save();
              return done(null, existingUser);
            }
            return done(null, false, {
              message: "Email already linked to another Microsoft account.",
            });
          }
        }

        // 3. New user
        const newUser = new User({
          username: await generateUniqueUsername(profile.displayName, profile.id),
          email: userEmail || undefined,
          microsoftId: profile.id,
          role: "student",
          firstName: profile.name?.givenName || "NoFirst",
          lastName:  profile.name?.familyName || "NoLast",
          needsProfileCompletion: true,              // Microsoft profile data is often sparse
          linkCode: await generateUniqueStudentLinkCode(),
          avatar: profile.photos?.[0]?.value
        });
        await newUser.save();
        console.log("LOG: MicrosoftStrategy created new user:", newUser.username);
        return done(null, newUser);
      } catch (err) {
        console.error("ERROR: MicrosoftStrategy error:", err);
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
