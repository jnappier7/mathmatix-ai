/**
 * LIVE DRILL GAME — a running Live Two-Minute Drill, snapshotted so a deploy can't end it.
 *
 * The game itself runs in memory (utils/liveDrill/games.js); this is its shadow. Every change
 * to a game is written here within a second (utils/liveDrill/store.js), and a request for a code
 * the running process doesn't know is answered from here — so when Render swaps instances on a
 * deploy, the teacher's board and every phone reconnect to the new instance and find their game
 * where they left it (two class games died mid-play on 2026-10-22 that way).
 *
 * Not an education record: the game lasts an hour or two and the row expires with it (TTL on
 * touchedAt). Signed-in students' Math Facts results are saved separately (models/factFluency.js).
 *
 * @model LiveDrillGame
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const liveDrillGameSchema = new Schema({
  code: { type: String, required: true },
  hostId: { type: String, required: true, index: true },
  classId: { type: String, default: null, index: true },
  phase: { type: String, required: true },
  version: { type: Number, default: 0 },
  touchedAt: { type: Date, required: true },
  // games.snapshot(game): the whole game, Maps folded to pairs; timers and open streams left out
  state: { type: Schema.Types.Mixed, required: true },
}, { minimize: false });

liveDrillGameSchema.index({ code: 1 }, { unique: true });
// Gone a little after the game module would have swept it from memory (IDLE_TTL_MS is 2 h).
liveDrillGameSchema.index({ touchedAt: 1 }, { expireAfterSeconds: 3 * 60 * 60 });

module.exports = mongoose.models.LiveDrillGame
  || mongoose.model('LiveDrillGame', liveDrillGameSchema);
