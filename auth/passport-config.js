// auth/passport-config.js
const passport            = require("passport");
const GoogleStrategy      = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy   = require("passport-microsoft").Strategy;
const OAuth2Strategy      = require("passport-oauth2");
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

        /* ---------- 3. Brand-new user - Require enrollment code ------ */
        // Instead of creating user immediately, store pending profile for enrollment code verification
        const { firstName, lastName, needsFix } = extractNames(profile);

        const pendingOAuthProfile = {
          provider: 'google',
          providerId: profile.id,
          email: userEmail,
          displayName: profile.displayName,
          firstName,
          lastName,
          needsFix,
          avatar: profile.photos?.[0]?.value
        };

        // Return a special "pending" user object that will trigger enrollment code page
        // The session will store the pending profile
        return done(null, {
          isPendingEnrollment: true,
          pendingProfile: pendingOAuthProfile
        });
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

        // 3. Brand-new user - Require enrollment code
        const pendingOAuthProfile = {
          provider: 'microsoft',
          providerId: profile.id,
          email: userEmail,
          displayName: profile.displayName,
          firstName: profile.name?.givenName || "NoFirst",
          lastName: profile.name?.familyName || "NoLast",
          needsFix: true,  // Microsoft profile data is often sparse
          avatar: profile.photos?.[0]?.value
        };

        // Return a special "pending" user object that will trigger enrollment code page
        return done(null, {
          isPendingEnrollment: true,
          pendingProfile: pendingOAuthProfile
        });
      } catch (err) {
        console.error("ERROR: MicrosoftStrategy error:", err);
        return done(err, null);
      }
    }
  )
);

/* ----------------------------  CLEVER STRATEGY ----------------------------- */
if (process.env.CLEVER_CLIENT_ID && process.env.CLEVER_CLIENT_SECRET) {
  const cleverApi  = require("../services/cleverApi");
  const { syncOnLogin } = require("../services/cleverSync");

  const cleverStrategy = new OAuth2Strategy(
    {
      authorizationURL: "https://clever.com/oauth/authorize",
      tokenURL:         "https://clever.com/oauth/tokens",
      clientID:         process.env.CLEVER_CLIENT_ID,
      clientSecret:     process.env.CLEVER_CLIENT_SECRET,
      callbackURL:
        process.env.CLEVER_CALLBACK_URL ||
        `http://localhost:${process.env.PORT || 3000}/auth/clever/callback`,
    },
    async (accessToken, refreshToken, params, profile, done) => {
      try {
        // Fetch identity via centralised Clever API client
        const meData = await cleverApi.getMe(accessToken);

        const cleverType = meData.type;   // 'student', 'teacher', 'district_admin', 'school_admin'
        const cleverId   = meData.data?.id;

        if (!cleverId) {
          return done(null, false, { message: "Could not retrieve Clever user ID." });
        }

        // Fetch full user data
        const userData = await cleverApi.getUserData(cleverType, cleverId, accessToken);

        const userInfo = userData.data || {};
        const userEmail   = userInfo.email || null;
        const firstName   = userInfo.name?.first  || "NoFirst";
        const lastName    = userInfo.name?.last   || "NoLast";
        const displayName = `${firstName} ${lastName}`.trim();

        // Map Clever user type to Mathmatix role
        let mappedRole = "student";
        if (cleverType === "teacher") mappedRole = "teacher";
        // district_admin / school_admin → admin (or teacher, depending on your preference)

        /* ---------- 1. Existing user by Clever ID --------------------- */
        let existingUser = await User.findOne({ cleverId });
        if (existingUser) {
          // Full data refresh + roster/section sync on every login
          try {
            const syncResult = await syncOnLogin(accessToken, existingUser);
            existingUser = syncResult.user;
            if (syncResult.stats.profileUpdated || syncResult.stats.sectionsProcessed > 0) {
              console.log(`LOG: Clever login sync for ${existingUser.username}: profile=${syncResult.stats.profileUpdated}, sections=${syncResult.stats.sectionsProcessed}, +${syncResult.stats.studentsAdded}/-${syncResult.stats.studentsRemoved} students`);
            }
          } catch (syncErr) {
            console.error("WARN: Clever sync failed (non-fatal):", syncErr.message);
          }
          return done(null, existingUser);
        }

        /* ---------- 2. Existing user by email ------------------------ */
        if (userEmail) {
          existingUser = await User.findOne({ email: userEmail });
          if (existingUser) {
            if (!existingUser.cleverId) {
              existingUser.cleverId = cleverId;
              if (!existingUser.firstName || existingUser.firstName === "NoFirst") {
                existingUser.firstName = firstName;
              }
              if (!existingUser.lastName || existingUser.lastName === "NoLast") {
                existingUser.lastName = lastName;
              }
              await existingUser.save();
            }
            // Sync sections for newly-linked user too
            try {
              const syncResult = await syncOnLogin(accessToken, existingUser);
              existingUser = syncResult.user;
              console.log(`LOG: Clever login sync (email-linked) for ${existingUser.username}: sections=${syncResult.stats.sectionsProcessed}`);
            } catch (syncErr) {
              console.error("WARN: Clever sync failed (non-fatal):", syncErr.message);
            }
            return done(null, existingUser);
          }
        }

        /* ---------- 3. Brand-new user - Require enrollment code ------ */
        const needsFix = firstName === "NoFirst" || lastName === "NoLast";

        const pendingOAuthProfile = {
          provider:    "clever",
          providerId:  cleverId,
          email:       userEmail,
          displayName,
          firstName,
          lastName,
          needsFix,
          role:        mappedRole,
          avatar:      null,
          accessToken  // Preserve token so sync can run after enrollment completes
        };

        return done(null, {
          isPendingEnrollment: true,
          pendingProfile: pendingOAuthProfile
        });
      } catch (err) {
        console.error("ERROR: CleverStrategy error:", err);
        return done(err, null);
      }
    }
  );

  cleverStrategy.name = "clever";
  passport.use(cleverStrategy);
  console.log("LOG: Clever SSO strategy registered");
}

module.exports = passport;
