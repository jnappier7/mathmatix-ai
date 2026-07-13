// models/phoneLink.js
//
// Transient pairing record for the "scan with your phone" feature.
//
// A logged-in desktop user mints a PhoneLink, which produces a one-time
// capability URL (carrying a high-entropy token) plus a 4-digit PIN shown
// on the desktop screen. The phone — which is NOT logged in — opens the
// URL, enters the PIN, and uploads a photo. The image is parked here
// briefly; the desktop polls for it, then re-submits the bytes through the
// normal /api/chat pipeline (so worksheet guard + visual gate still apply).
//
// This record is deliberately short-lived: a TTL index reaps it ~15 min
// after creation regardless of state, so leaked links and abandoned
// pairings self-destruct. It is NOT the durable upload history — that lives
// in StudentUpload, created when the image flows through /api/chat.
//
// Why durable (Mongo) and not in-memory: Render zero-downtime deploys run
// the old and new instance simultaneously for a few minutes, so a phone can
// hit a different instance than the desktop that minted the link.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Link lifetime. Long enough to walk to your phone and scan; short enough
// that a leaked URL is useless within minutes.
const TTL_MINUTES = 15;

// PIN guesses allowed before the link is burned. The token is the real
// secret (unguessable); the PIN only defends the narrow shoulder-surf /
// link-leak case, so a small attempt budget plus the TTL is plenty.
const MAX_PIN_ATTEMPTS = 5;

const phoneLinkSchema = new Schema({
    // SHA-256 of the raw capability token (the token itself never touches
    // the DB). High-entropy, so a fast hash is appropriate here — unlike the
    // PIN, there's nothing to brute-force.
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // bcrypt hash of the 4-digit PIN (low-entropy → slow hash + attempt cap).
    pinHash: {
        type: String,
        required: true
    },

    // Who minted the link. Pending-image reads are authorized by this, via
    // the desktop's normal cookie session — NOT by the token.
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // The active conversation the image should attach to (informational;
    // the desktop re-submits to /api/chat with its own session).
    conversationId: {
        type: Schema.Types.ObjectId,
        ref: 'Conversation',
        default: null
    },

    // awaiting_upload → uploaded → consumed. Reaped by TTL in any state.
    status: {
        type: String,
        enum: ['awaiting_upload', 'uploaded', 'consumed'],
        default: 'awaiting_upload',
        index: true
    },

    pinAttempts: {
        type: Number,
        default: 0
    },

    // Raw image bytes, populated only once the phone uploads. Stored as a
    // Buffer (not base64) to stay well under the 16MB BSON document cap at
    // the 10MB upload limit. Cleared when the link is consumed.
    image: {
        data: { type: Buffer, default: null },
        mimeType: { type: String, default: null },
        size: { type: Number, default: null },
        originalName: { type: String, default: null }
    },

    // Small base64 data-URL preview for the desktop tray (avoids shipping the
    // full-resolution image just to render a thumbnail).
    thumbnail: {
        type: String,
        default: null
    },

    // TTL anchor — see index below.
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

// TTL index: Mongo deletes the document once expiresAt passes
// (expireAfterSeconds: 0 means "expire exactly at the stored time").
phoneLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Desktop tray poll: "my links that have an image waiting".
phoneLinkSchema.index({ userId: 1, status: 1 });

phoneLinkSchema.statics.TTL_MINUTES = TTL_MINUTES;
phoneLinkSchema.statics.MAX_PIN_ATTEMPTS = MAX_PIN_ATTEMPTS;

module.exports = mongoose.model('PhoneLink', phoneLinkSchema);
