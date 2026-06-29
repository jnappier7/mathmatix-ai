// routes/phoneLink.js
//
// "Scan with your phone" — pair a phone to a logged-in desktop session so the
// student can snap a photo of their work and have it land in the chat without
// typing on the phone.
//
// Two routers with deliberately different trust models:
//
//   desktopRouter  (mount: /api/phone-link, behind isAuthenticated + CSRF)
//     POST /create        mint a pairing (token + PIN), return QR + URL + PIN
//     GET  /pending       list images the phone has uploaded (tray poll)
//     GET  /image/:id     fetch one uploaded image's bytes (to re-submit)
//     POST /consume/:id   discard a pairing once its image has been used
//
//   phoneRouter    (mount: /api/phone-upload, PUBLIC + CSRF-exempt prefix)
//     POST /:token        anonymous phone uploads a photo (token + PIN in form)
//
// The phone never touches /api/chat. Instead the desktop pulls the bytes via
// /image/:id and re-submits them through the normal /api/chat multipart path,
// so worksheet guard + visual gate + moderation apply exactly as for any
// upload. This file is just a short-lived, authenticated relay.

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');

const PhoneLink = require('../models/phoneLink');
const Conversation = require('../models/conversation');
const { mintCredentials, findByToken, verifyPin } = require('../utils/phoneLinkAuth');
const { validateUpload } = require('../middleware/uploadSecurity');
const { success, fail } = require('../utils/apiResponse');
const logger = require('../utils/logger').child({ route: 'phoneLink' });

const QRCode = (() => {
    try { return require('qrcode'); }
    catch (_) { logger.warn('qrcode package unavailable — QR codes disabled'); return null; }
})();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const IMAGE_MIMETYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

// ---------------------------------------------------------------------------
// Desktop router — authenticated; CSRF handled by the global middleware.
// ---------------------------------------------------------------------------
const desktopRouter = express.Router();

// POST /api/phone-link/create
// Mint a one-time pairing for the current user's active conversation.
desktopRouter.post('/create', async (req, res) => {
    try {
        const userId = req.user._id;
        let { conversationId } = req.body || {};

        // If a conversation is named, it must belong to the caller. We don't
        // require one — the desktop may pair before a conversation exists.
        if (conversationId) {
            const owned = await Conversation.findOne({ _id: conversationId, userId }).select('_id').lean();
            if (!owned) {
                return res.status(404).json(fail('Conversation not found.'));
            }
        } else {
            conversationId = null;
        }

        const { token, tokenHash, pin, pinHash, expiresAt } = await mintCredentials();

        await PhoneLink.create({ tokenHash, pinHash, userId, conversationId, expiresAt });

        const linkUrl = `${BASE_URL}/phone-upload?t=${encodeURIComponent(token)}`;
        let qrDataUrl = null;
        if (QRCode) {
            try {
                qrDataUrl = await QRCode.toDataURL(linkUrl, {
                    width: 220, margin: 1, color: { dark: '#1a1a2e', light: '#ffffff' }
                });
            } catch (e) {
                logger.warn('QR generation failed', { error: e.message });
            }
        }

        // The raw token is never returned again or stored — only the URL/QR
        // carry it. The PIN is shown on the desktop screen for the student to
        // key into their phone.
        return res.json(success({ linkUrl, qrDataUrl, pin, expiresAt }));
    } catch (err) {
        logger.error('create failed', { error: err.message });
        return res.status(500).json(fail('Could not create phone link.'));
    }
});

// GET /api/phone-link/pending
// Tray poll: images this user's phone has uploaded but not yet used.
// Excludes the heavy image.data — the tray only needs the thumbnail.
desktopRouter.get('/pending', async (req, res) => {
    try {
        const links = await PhoneLink.find({ userId: req.user._id, status: 'uploaded' })
            .select('thumbnail image.mimeType image.size image.originalName createdAt')
            .sort({ createdAt: -1 })
            .lean();

        const pending = links.map(l => ({
            id: l._id,
            thumbnail: l.thumbnail,
            mimeType: l.image?.mimeType,
            size: l.image?.size,
            originalName: l.image?.originalName,
            uploadedAt: l.createdAt
        }));

        return res.json(success({ pending }));
    } catch (err) {
        logger.error('pending failed', { error: err.message });
        return res.status(500).json(fail('Could not load pending uploads.'));
    }
});

// GET /api/phone-link/image/:id
// Stream one uploaded image's bytes so the desktop can re-submit it to
// /api/chat. Ownership enforced by the session — NOT by the token.
desktopRouter.get('/image/:id', async (req, res) => {
    try {
        const link = await PhoneLink.findOne({
            _id: req.params.id, userId: req.user._id, status: 'uploaded'
        }).select('image');

        if (!link || !link.image || !link.image.data) {
            return res.status(404).json(fail('Image not found.'));
        }

        res.set('Content-Type', link.image.mimeType || 'application/octet-stream');
        res.set('Cache-Control', 'no-store');
        return res.send(link.image.data);
    } catch (err) {
        logger.error('image fetch failed', { error: err.message });
        return res.status(500).json(fail('Could not load image.'));
    }
});

// POST /api/phone-link/consume/:id
// Called once the desktop has submitted the image to /api/chat. We delete the
// pairing outright — the durable copy now lives in StudentUpload (subject to
// the existing upload-retention policy).
desktopRouter.post('/consume/:id', async (req, res) => {
    try {
        const result = await PhoneLink.deleteOne({ _id: req.params.id, userId: req.user._id });
        if (result.deletedCount === 0) {
            return res.status(404).json(fail('Phone link not found.'));
        }
        return res.json(success());
    } catch (err) {
        logger.error('consume failed', { error: err.message });
        return res.status(500).json(fail('Could not consume phone link.'));
    }
});

// ---------------------------------------------------------------------------
// Phone router — PUBLIC. No session; authorized solely by (token, PIN).
// Mounted under a CSRF-exempt prefix (see middleware/csrf.js).
// ---------------------------------------------------------------------------
const phoneRouter = express.Router();

// Per-IP throttle on the anonymous surface. The token already scopes each
// request to one pairing; this just caps blunt abuse from a single source.
const phoneUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json(fail('Too many attempts. Please wait a few minutes.'))
});

// Images only (this is a camera capture), buffered in memory then persisted
// to Mongo — never written to this instance's disk, which a sibling instance
// couldn't read during a deploy.
const phoneUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (IMAGE_MIMETYPES.has(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files are allowed.'), false);
    }
});

// POST /api/phone-upload/:token
phoneRouter.post('/:token', phoneUploadLimiter, phoneUpload.single('file'), validateUpload, async (req, res) => {
    try {
        const link = await findByToken(req.params.token);

        // Verify PIN first (and before revealing anything about the file). This
        // enforces expiry, status, and the attempt cap, and burns the link on
        // repeated wrong PINs.
        const pinCheck = await verifyPin(link, (req.body && req.body.pin) || '');
        if (!pinCheck.ok) {
            const messages = {
                expired: 'This link has expired. Please generate a new one on your computer.',
                already_used: 'This link has already been used.',
                locked: 'Too many incorrect PIN attempts. Please generate a new link.',
                bad_pin: 'Incorrect PIN.'
            };
            const codes = { expired: 410, already_used: 409, locked: 423, bad_pin: 401 };
            return res.status(codes[pinCheck.reason] || 401).json(fail(messages[pinCheck.reason] || 'Invalid PIN.'));
        }

        if (!req.file) {
            return res.status(400).json(fail('No image received.'));
        }

        // Strip EXIF (GPS/device) and normalize orientation before storing —
        // same treatment the desktop upload path gives images.
        let buffer = req.file.buffer;
        try {
            buffer = await sharp(req.file.buffer).rotate().withMetadata({}).toBuffer();
        } catch (e) {
            logger.warn('EXIF strip failed; storing original', { error: e.message });
        }

        // Small preview for the desktop tray.
        let thumbnail = null;
        try {
            const thumbBuf = await sharp(buffer)
                .rotate()
                .resize(240, 240, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 70 })
                .toBuffer();
            thumbnail = `data:image/webp;base64,${thumbBuf.toString('base64')}`;
        } catch (e) {
            logger.warn('thumbnail generation failed', { error: e.message });
        }

        link.image = {
            data: buffer,
            mimeType: req.file.mimetype,
            size: buffer.length,
            originalName: req.file.originalname || 'phone-upload.jpg'
        };
        link.thumbnail = thumbnail;
        link.status = 'uploaded';
        await link.save();

        return res.json(success({ message: 'Photo sent to your computer.' }));
    } catch (err) {
        logger.error('phone upload failed', { error: err.message });
        return res.status(500).json(fail('Upload failed. Please try again.'));
    }
});

module.exports = { desktopRouter, phoneRouter };
