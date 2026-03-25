// models/chapterContent.js
// Mongoose schema for teacher-uploaded chapter content (textbook mode)
// Stores processed chapter data: concept cards, outline, RAG chunks with embeddings

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/* ---------- SUB-SCHEMAS ---------- */

const conceptCardSchema = new Schema({
  title: { type: String, required: true, trim: true },
  summary: { type: String, required: true },          // 2-3 sentence summary of the concept
  keyTerms: [{ type: String, trim: true }],            // Vocabulary terms introduced in this concept
  orderIndex: { type: Number, required: true },        // Position within the chapter
  prerequisites: [{ type: String, trim: true }],       // Concept titles from earlier chapters that this builds on
  depthLevel: {
    type: String,
    enum: ['intro', 'core', 'advanced'],
    default: 'core'
  }
}, { _id: true });

const chapterOutlineSchema = new Schema({
  sectionTitle: { type: String, required: true, trim: true },
  sectionNumber: { type: String, trim: true },         // e.g., "5.1", "5.2"
  conceptCardIds: [{ type: Schema.Types.ObjectId }],   // References to concept cards in this section
  orderIndex: { type: Number, required: true }
}, { _id: true });

const ragChunkSchema = new Schema({
  text: { type: String, required: true },              // The actual text chunk (~200-500 tokens)
  embedding: { type: [Number], required: true },       // Vector embedding from text-embedding-3-small
  conceptCardId: { type: Schema.Types.ObjectId },      // Which concept card this chunk relates to
  pageRange: {                                          // Where in the PDF this came from
    start: { type: Number },
    end: { type: Number }
  },
  chunkIndex: { type: Number, required: true },        // Order within the chapter
  tokenCount: { type: Number }                         // Approximate token count for budget tracking
}, { _id: true });

/* ---------- MAIN CHAPTER CONTENT SCHEMA ---------- */

const chapterContentSchema = new Schema({
  // Ownership
  teacherId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  curriculumId: { type: Schema.Types.ObjectId, ref: 'Curriculum', index: true },

  // Chapter metadata
  chapterNumber: { type: Number, required: true },
  chapterTitle: { type: String, required: true, trim: true },
  subject: { type: String, default: 'biology', trim: true, lowercase: true },
  weekNumber: { type: Number },                        // Maps to curriculum week

  // Source file info
  sourceFile: {
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    sizeBytes: { type: Number },
    storageKey: { type: String, trim: true },          // S3/R2 key for the uploaded PDF
    uploadedAt: { type: Date, default: Date.now }
  },

  // Extracted raw text (stored for reprocessing if needed)
  rawText: { type: String },
  pageCount: { type: Number },

  // Processed content
  outline: { type: [chapterOutlineSchema], default: [] },
  conceptCards: { type: [conceptCardSchema], default: [] },
  chunks: { type: [ragChunkSchema], default: [] },

  // Processing status
  processingStatus: {
    type: String,
    enum: ['pending', 'extracting', 'generating-cards', 'chunking', 'embedding', 'ready', 'failed'],
    default: 'pending',
    index: true
  },
  processingError: { type: String },
  processingStartedAt: { type: Date },
  processingCompletedAt: { type: Date },

  // Stats
  totalTokens: { type: Number, default: 0 },          // Total tokens across all chunks
  totalChunks: { type: Number, default: 0 },
  totalConceptCards: { type: Number, default: 0 }
}, {
  timestamps: true,
  collection: 'chapterContents'
});

/* ---------- INDEXES ---------- */
chapterContentSchema.index({ teacherId: 1, chapterNumber: 1 });
chapterContentSchema.index({ curriculumId: 1, weekNumber: 1 });
chapterContentSchema.index({ teacherId: 1, processingStatus: 1 });

/* ---------- STATIC METHODS ---------- */

/**
 * Get all ready chapters for a curriculum
 */
chapterContentSchema.statics.getReadyChapters = function (curriculumId) {
  return this.find({ curriculumId, processingStatus: 'ready' })
    .sort({ chapterNumber: 1 })
    .select('-rawText -chunks.embedding')
    .lean();
};

/**
 * Get a specific chapter with full data (including embeddings for RAG)
 */
chapterContentSchema.statics.getChapterForRAG = function (chapterContentId) {
  return this.findOne({ _id: chapterContentId, processingStatus: 'ready' }).lean();
};

/**
 * Get chapter by teacher + chapter number
 */
chapterContentSchema.statics.getByTeacherAndChapter = function (teacherId, chapterNumber) {
  return this.findOne({ teacherId, chapterNumber, processingStatus: 'ready' }).lean();
};

/**
 * Get processing status for all chapters of a teacher
 */
chapterContentSchema.statics.getProcessingStatus = function (teacherId) {
  return this.find({ teacherId })
    .select('chapterNumber chapterTitle processingStatus processingError processingCompletedAt totalConceptCards totalChunks')
    .sort({ chapterNumber: 1 })
    .lean();
};

module.exports = mongoose.models.ChapterContent || mongoose.model('ChapterContent', chapterContentSchema);
