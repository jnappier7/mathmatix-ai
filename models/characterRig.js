const mongoose = require('mongoose');
const { Schema } = mongoose;

const rigPointSchema = new Schema({
    id: String,
    x: Number,
    y: Number,
    label: String,
    type: {
        type: String,
        enum: ['head', 'neck', 'shoulder', 'elbow', 'wrist', 'hand', 'hip', 'knee', 'ankle', 'foot', 'torso', 'custom']
    }
}, { _id: false });

const boneConnectionSchema = new Schema({
    from: String,
    to: String,
    segmentName: String
}, { _id: false });

const characterRigSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',

    },
    sessionId: {
        type: String,
        default: () => `rig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    },
    characterName: {
        type: String,
        default: 'Untitled Character'
    },
    originalImagePath: String,
    imageBuffer: Buffer,
    imageWidth: Number,
    imageHeight: Number,
    rigPoints: [rigPointSchema],
    boneConnections: [boneConnectionSchema],
    segmentedParts: [{
        name: String,
        imageData: Buffer,
        bounds: {
            x: Number,
            y: Number,
            width: Number,
            height: Number
        }
    }],
    status: {
        type: String,
        enum: ['uploaded', 'rigging', 'segmented', 'exported'],
        default: 'uploaded'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster lookups
characterRigSchema.index({ userId: 1, createdAt: -1 });
characterRigSchema.index({ sessionId: 1 });

const CharacterRig = mongoose.model('CharacterRig', characterRigSchema);

module.exports = CharacterRig;
