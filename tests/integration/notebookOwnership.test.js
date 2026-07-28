/**
 * Notebook ownership, against a real database (routes/notebook.js, spec §15).
 *
 * Students own their notebook: they add notes, edit them, clear them. The
 * unit tests cover input sanitizing; what needs a database is the part that
 * lives in the QUERY rather than the payload —
 *
 *   - a student can only ever reach their OWN cards (userId in every filter),
 *   - only student-authored cards are editable, so a student cannot rewrite
 *     the tutor's AHA/reminder record of what actually happened,
 *   - archive still soft-deletes, leaving the evidence trail intact.
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const LearningCard = require('../../models/learningCard');

let mem;
let app;
let meId;
let otherId;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  const router = require('../../routes/notebook');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { _id: meId };
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api/notebook', router);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

beforeEach(async () => {
  meId = new mongoose.Types.ObjectId();
  otherId = new mongoose.Types.ObjectId();
});

afterEach(async () => { await LearningCard.deleteMany({}); });

const post = (body) => supertest(app).post('/api/notebook').send(body);
const patch = (id, body) => supertest(app).patch(`/api/notebook/${id}`).send(body);

describe('POST /api/notebook — adding my own note', () => {
  test('a note is stored as mine, sourced to the student', async () => {
    const res = await post({ type: 'note', title: 'Slope', body: 'rise over run' });
    expect(res.status).toBe(201);
    expect(res.body.card).toMatchObject({ type: 'note', source: 'student', title: 'Slope' });

    const saved = await LearningCard.findById(res.body.card._id).lean();
    expect(String(saved.userId)).toBe(String(meId));
    expect(saved.source).toBe('student');
    expect(saved.archived).toBe(false);
  });

  test('a client asking for an aha card gets an idea instead — never an aha', async () => {
    const res = await post({ type: 'aha', title: 'I mastered everything' });
    expect(res.status).toBe(201);
    const saved = await LearningCard.findById(res.body.card._id).lean();
    expect(saved.type).toBe('idea');
    expect(saved.source).toBe('tutor');
    expect(await LearningCard.countDocuments({ type: 'aha' })).toBe(0);
  });

  test('a client cannot self-declare source:student on a tutor-worded card', async () => {
    // If this leaked through, the PATCH guard below would open on idea cards.
    const res = await post({ type: 'idea', title: 'tutor wording', source: 'student' });
    const saved = await LearningCard.findById(res.body.card._id).lean();
    expect(saved.source).toBe('tutor');
  });

  test('an empty note is a 400, not an empty card', async () => {
    const res = await post({ type: 'note', title: '  ', body: '' });
    expect(res.status).toBe(400);
    expect(await LearningCard.countDocuments({})).toBe(0);
  });
});

describe('PATCH /api/notebook/:id — editing', () => {
  const makeCard = (over) => LearningCard.create(Object.assign({
    userId: meId, type: 'note', source: 'student', title: 'before', body: 'old body',
  }, over));

  test('I can edit a note I wrote', async () => {
    const card = await makeCard();
    const res = await patch(card._id, { title: 'after', body: 'new body' });
    expect(res.status).toBe(200);
    expect(res.body.card).toMatchObject({ title: 'after', body: 'new body' });

    const saved = await LearningCard.findById(card._id).lean();
    expect(saved.title).toBe('after');
    expect(saved.type).toBe('note');       // an edit never re-kinds the card
    expect(saved.source).toBe('student');
  });

  test('I cannot edit the tutor’s AHA or reminder cards', async () => {
    for (const type of ['aha', 'reminder']) {
      const card = await makeCard({ type, source: 'tutor', title: 'what really happened' });
      const res = await patch(card._id, { title: 'what I wish had happened' });
      expect(res.status).toBe(404);
      const saved = await LearningCard.findById(card._id).lean();
      expect(saved.title).toBe('what really happened');
    }
  });

  test('legacy cards written before `source` existed are not editable', async () => {
    // Every pre-existing card is tutor-captured; an unset source must fail the
    // filter rather than default open.
    const card = await makeCard({ type: 'aha', title: 'legacy' });
    await LearningCard.updateOne({ _id: card._id }, { $unset: { source: 1 } });
    const res = await patch(card._id, { title: 'rewritten' });
    expect(res.status).toBe(404);
    expect((await LearningCard.findById(card._id).lean()).title).toBe('legacy');
  });

  test('I cannot edit another student’s note', async () => {
    const theirs = await makeCard({ userId: otherId, title: 'their note' });
    const res = await patch(theirs._id, { title: 'hijacked' });
    expect(res.status).toBe(404);
    expect((await LearningCard.findById(theirs._id).lean()).title).toBe('their note');
  });

  test('an archived note is no longer editable', async () => {
    const card = await makeCard({ archived: true });
    expect((await patch(card._id, { title: 'zombie' })).status).toBe(404);
  });

  test('a malformed id is a 404, not a 500', async () => {
    expect((await patch('not-an-object-id', { title: 'x' })).status).toBe(404);
  });

  test('an emptied edit is rejected', async () => {
    const card = await makeCard();
    expect((await patch(card._id, { title: '', body: '  ' })).status).toBe(400);
    expect((await LearningCard.findById(card._id).lean()).title).toBe('before');
  });
});

describe('GET and archive still scope to me', () => {
  test('listing never returns another student’s cards', async () => {
    await LearningCard.create({ userId: otherId, type: 'note', source: 'student', title: 'theirs' });
    await LearningCard.create({ userId: meId, type: 'note', source: 'student', title: 'mine' });

    const res = await supertest(app).get('/api/notebook');
    expect(res.status).toBe(200);
    expect(res.body.cards.map((c) => c.title)).toEqual(['mine']);
    expect(res.body.cards[0].source).toBe('student');   // the UI styles on this
  });

  test('?type=note filters to my own notes', async () => {
    await LearningCard.create({ userId: meId, type: 'aha', source: 'tutor', title: 'an aha' });
    await LearningCard.create({ userId: meId, type: 'note', source: 'student', title: 'my note' });

    const res = await supertest(app).get('/api/notebook?type=note');
    expect(res.body.cards.map((c) => c.title)).toEqual(['my note']);
  });

  test('search reaches student notes too', async () => {
    await LearningCard.create({ userId: meId, type: 'note', source: 'student', title: 'Negative sign trap', body: 'distribute first' });
    await LearningCard.create({ userId: meId, type: 'note', source: 'student', title: 'unrelated', body: 'nope' });

    const res = await supertest(app).get('/api/notebook?q=negative');
    expect(res.body.cards.map((c) => c.title)).toEqual(['Negative sign trap']);
  });

  test('archiving a note soft-deletes it — the row survives', async () => {
    const card = await LearningCard.create({ userId: meId, type: 'note', source: 'student', title: 'mine' });
    expect((await supertest(app).patch(`/api/notebook/${card._id}/archive`)).status).toBe(200);

    const saved = await LearningCard.findById(card._id).lean();
    expect(saved.archived).toBe(true);
    expect((await supertest(app).get('/api/notebook')).body.cards).toEqual([]);
  });

  test('I cannot archive another student’s card', async () => {
    const theirs = await LearningCard.create({ userId: otherId, type: 'note', source: 'student', title: 'theirs' });
    expect((await supertest(app).patch(`/api/notebook/${theirs._id}/archive`)).status).toBe(404);
    expect((await LearningCard.findById(theirs._id).lean()).archived).toBe(false);
  });
});
