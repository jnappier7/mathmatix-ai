/**
 * /unsubscribe — the opt-out works from an inbox, is honored by the bulk
 * sender's audience, and a GET alone never unsubscribes anyone.
 * Real database (mongodb-memory-server).
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.BASE_URL = 'https://test.mathmatix.ai';

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const Waitlist = require('../../models/waitlist');
const AdminEmail = require('../../models/adminEmail');
const { signUnsubscribeToken, unsubscribeUrl, setMarketingOptOut } = require('../../utils/emailUnsubscribe');

let mem, app;
const uniq = () => Math.random().toString(36).slice(2, 9);

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/unsubscribe', require('../../routes/unsubscribe'));
});
afterAll(async () => { await mongoose.disconnect(); if (mem) await mem.stop(); });

async function student(over = {}) {
  const u = uniq();
  return User.create({ username: `s${u}`, email: `s${u}@e.com`, firstName: 'Sam', lastName: 'K', role: 'student', roles: ['student'], ...over });
}
const tokenFor = (doc, kind = 'user') => signUnsubscribeToken({ kind, id: doc._id });
const fresh = (doc) => User.findById(doc._id).lean();

describe('GET /unsubscribe', () => {
  test('shows the address and a confirm button, and changes nothing', async () => {
    const s = await student();
    const res = await supertest(app).get('/unsubscribe').query({ t: tokenFor(s) }).expect(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain(s.email);
    expect(res.text).toContain('Unsubscribe from MATHMATIX.AI updates?');
    expect(res.text).toContain('name="action" value="unsubscribe"');
    expect((await fresh(s)).emailPreferences.marketingOptOut).toBe(false);
  });

  test('escapes the address it echoes', async () => {
    const s = await student({ email: `"<img src=x onerror=alert(1)>"@e.com` });
    const res = await supertest(app).get('/unsubscribe').query({ t: tokenFor(s) }).expect(200);
    expect(res.text).not.toContain('<img');
    expect(res.text).toContain('&lt;img');
  });

  test('an already-unsubscribed address gets the resubscribe form', async () => {
    const s = await student();
    await setMarketingOptOut('user', s._id, true, 'admin');
    const res = await supertest(app).get('/unsubscribe').query({ t: tokenFor(s) }).expect(200);
    expect(res.text).toContain("You're already unsubscribed");
    expect(res.text).toContain('name="action" value="resubscribe"');
  });

  test('a bad or missing token is a 400 page with a support fallback, never a 500', async () => {
    await supertest(app).get('/unsubscribe').expect(400);
    const r = await supertest(app).get('/unsubscribe').query({ t: 'user.000000000000000000000000.bogus' }).expect(400);
    expect(r.text).toContain('mailto:');
    // Valid signature, recipient gone
    const ghost = signUnsubscribeToken({ kind: 'user', id: new mongoose.Types.ObjectId() });
    await supertest(app).get('/unsubscribe').query({ t: ghost }).expect(400);
  });
});

describe('POST /unsubscribe', () => {
  test('the page form opts the recipient out and records how', async () => {
    const s = await student();
    const res = await supertest(app).post('/unsubscribe').type('form')
      .send({ t: tokenFor(s), action: 'unsubscribe' }).expect(200);
    expect(res.text).toContain("You're unsubscribed");
    const u = await fresh(s);
    expect(u.emailPreferences.marketingOptOut).toBe(true);
    expect(u.emailPreferences.marketingOptOutSource).toBe('link');
    expect(u.emailPreferences.marketingOptOutAt).toBeInstanceOf(Date);
  });

  test('RFC 8058 one-click: token in the query, List-Unsubscribe=One-Click in the body, 200 plain', async () => {
    const s = await student();
    const res = await supertest(app).post(`/unsubscribe?t=${encodeURIComponent(tokenFor(s))}`)
      .type('form').send('List-Unsubscribe=One-Click').expect(200);
    expect(res.headers['content-type']).not.toMatch(/html/);
    const u = await fresh(s);
    expect(u.emailPreferences.marketingOptOut).toBe(true);
    expect(u.emailPreferences.marketingOptOutSource).toBe('one-click');
  });

  test('one-click with a forged token is a 400, not a 500 and not an opt-out', async () => {
    const s = await student();
    const [kind, , sig] = tokenFor(s).split('.');
    const other = await student();
    await supertest(app).post(`/unsubscribe?t=${kind}.${other._id}.${sig}`)
      .type('form').send('List-Unsubscribe=One-Click').expect(400);
    expect((await fresh(other)).emailPreferences.marketingOptOut).toBe(false);
  });

  test('resubscribe clears the opt-out and its audit fields', async () => {
    const s = await student();
    await setMarketingOptOut('user', s._id, true, 'link');
    const res = await supertest(app).post('/unsubscribe').type('form')
      .send({ t: tokenFor(s), action: 'resubscribe' }).expect(200);
    expect(res.text).toContain('Welcome back');
    const u = await fresh(s);
    expect(u.emailPreferences.marketingOptOut).toBe(false);
    expect(u.emailPreferences.marketingOptOutAt).toBeUndefined();
    expect(u.emailPreferences.marketingOptOutSource).toBeUndefined();
  });

  test('a waitlist signup can unsubscribe too', async () => {
    const w = await Waitlist.create({ email: `w${uniq()}@e.com`, role: 'parent' });
    await supertest(app).post('/unsubscribe').type('form')
      .send({ t: tokenFor(w, 'waitlist'), action: 'unsubscribe' }).expect(200);
    expect((await Waitlist.findById(w._id).lean()).emailPreferences.marketingOptOut).toBe(true);
  });

  test('the link the sender embeds is the link the route accepts', async () => {
    const s = await student();
    const url = new URL(unsubscribeUrl('user', s._id));
    expect(url.origin + url.pathname).toBe('https://test.mathmatix.ai/unsubscribe');
    await supertest(app).post(`/unsubscribe${url.search}`).type('form').send('List-Unsubscribe=One-Click').expect(200);
    expect((await fresh(s)).emailPreferences.marketingOptOut).toBe(true);
  });
});

describe('the bulk-email audience honors it', () => {
  test('an opted-out user is not resolved into any audience; roles HELD decide the audience', async () => {
    const tag = uniq();
    const inStudent = await student({ email: `in-${tag}@e.com` });
    const outStudent = await student({ email: `out-${tag}@e.com` });
    await setMarketingOptOut('user', outStudent._id, true, 'one-click');
    // Admin who also holds parent, currently in the admin view: still a parent to email.
    const multi = await User.create({ username: `m${tag}`, email: `multi-${tag}@e.com`, firstName: 'Pat', lastName: 'Q', role: 'admin', roles: ['admin', 'parent'] });
    const outParent = await User.create({ username: `p${tag}`, email: `pout-${tag}@e.com`, firstName: 'Lee', lastName: 'R', role: 'parent', roles: ['parent'] });
    await setMarketingOptOut('user', outParent._id, true, 'settings');
    const wIn = await Waitlist.create({ email: `win-${tag}@e.com` });
    const wOut = await Waitlist.create({ email: `wout-${tag}@e.com` });
    await setMarketingOptOut('waitlist', wOut._id, true, 'link');

    const emails = (rows) => rows.map(r => r.email);
    const students = emails(await AdminEmail.getRecipientsByAudienceType('all_students'));
    expect(students).toContain(inStudent.email);
    expect(students).not.toContain(outStudent.email);

    const parents = emails(await AdminEmail.getRecipientsByAudienceType('all_parents'));
    expect(parents).toContain(multi.email);
    expect(parents).not.toContain(outParent.email);

    const custom = emails(await AdminEmail.getRecipientsByAudienceType('custom', null, [inStudent._id, outStudent._id]));
    expect(custom).toEqual([inStudent.email]);

    const waitlist = emails(await AdminEmail.getRecipientsByAudienceType('waitlist'));
    expect(waitlist).toContain(wIn.email);
    expect(waitlist).not.toContain(wOut.email);
  });
});
