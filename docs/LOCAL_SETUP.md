# 🚀 Local Development Setup

## Prerequisites

- **Node.js** >= 20.14 ([Download](https://nodejs.org/))
- **MongoDB** (Local or Atlas account)
  - Local: [Install MongoDB Community](https://www.mongodb.com/docs/manual/installation/)
  - Cloud: [MongoDB Atlas Free Tier](https://www.mongodb.com/cloud/atlas/register)
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))

---

## 🏃 Quick Start (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit .env with your values (see below)
```

**Minimal .env for local dev:**
```env
# Database (choose one)
MONGO_URI=mongodb://localhost:27017/mathmatix_dev
# OR
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/mathmatix_dev

# Session secret (generate random string)
SESSION_SECRET=abc123_change_this_to_random_string

# OpenAI (REQUIRED)
OPENAI_API_KEY=sk-your_actual_key_here

# OAuth (use dummy values for local dev if not testing login)
GOOGLE_CLIENT_ID=dummy_google_id
GOOGLE_CLIENT_SECRET=dummy_google_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
MICROSOFT_CLIENT_ID=dummy_ms_id
MICROSOFT_CLIENT_SECRET=dummy_ms_secret
MICROSOFT_CALLBACK_URL=http://localhost:3000/auth/microsoft/callback

# Other services (optional for core features)
ELEVENLABS_API_KEY=dummy_key
MATHPIX_APP_ID=dummy_id
MATHPIX_APP_KEY=dummy_key
```

**Generate a secure SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start MongoDB (if running locally)
```bash
# macOS with Homebrew
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
net start MongoDB
```

### 4. Seed Test Data (Optional but Recommended)
```bash
# Creates 1 teacher + 5 students with active sessions
npm run seed:test
```

This creates:
- **Teacher**: `teacher@test.com` / password: `password`
- **Students**: `student1@test.com` through `student5@test.com` / password: `password`
- Sample active conversations with struggles for testing live feed

### 5. Start Development Server
```bash
npm run dev
```

Server starts at: **http://localhost:3000**

---

## 🧪 Testing New Features

### Test Whiteboard (Just Built!)
1. Login as student: `student1@test.com` / `password`
2. Start a chat session
3. Ask: "Can you show me a graph of y=x^2?"
4. Whiteboard should open with interactive drawing
5. Try user drawing tools (pen, shapes, eraser)

### Test Teacher Live Feed (Just Built!)
1. Open another browser (or incognito)
2. Login as teacher: `teacher@test.com` / `password`
3. Go to Teacher Dashboard
4. You should see:
   - Live activity feed (left sidebar)
   - Active student sessions
   - Struggle alerts when students say "I don't understand"

### Test Struggle Detection
1. As student, chat: "I don't understand fractions"
2. As teacher, refresh dashboard
3. Should see yellow "struggling" alert in live feed

---

## 📁 Project Structure

```
mathmatix-ai/
├── server.js              # Express app entry point
├── routes/
│   ├── chat.js            # Student chat + struggle detection
│   ├── teacher.js         # Live feed + teacher APIs
│   └── ...
├── models/
│   ├── user.js            # User/Student/Teacher schema
│   ├── conversation.js    # Enhanced with live tracking
│   └── ...
├── utils/
│   ├── activitySummarizer.js  # AI summaries + struggle detection
│   ├── aiDrawingTools.js      # Whiteboard drawing parser
│   └── ...
├── public/
│   ├── chat.html          # Student chat interface
│   ├── teacher-dashboard.html
│   ├── js/
│   │   ├── whiteboard.js      # Whiteboard controller
│   │   └── teacher-live-feed.js
│   └── css/
│       ├── whiteboard.css
│       └── teacher-live-feed.css
└── scripts/
    └── seedTestData.js    # Test data generator
```

---

## 🐛 Common Issues

### "Missing required environment variables"
→ Check your `.env` file has all required vars from `.env.example`

### "MongoServerError: connect ECONNREFUSED"
→ MongoDB isn't running. Start it:
```bash
brew services start mongodb-community  # macOS
sudo systemctl start mongod            # Linux
```

### "Cannot find module 'XYZ'"
→ Re-run `npm install`

### OAuth login fails locally
→ Use direct login or set up Google/Microsoft OAuth apps
→ For testing, use seeded accounts: `student1@test.com` / `password`

### Port 3000 already in use
→ Change PORT in `.env` or kill existing process:
```bash
lsof -ti:3000 | xargs kill -9
```

---

## 🔧 Development Scripts

```bash
# Start with auto-reload (nodemon)
npm run dev

# Start production mode
npm start

# Seed test data
npm run seed:test

# Run weekly digest (background job)
npm run cron:weekly-digest

# Archive old conversations
npm run cron:archive
```

---

## 🎯 Quick Test Checklist

After setup, verify these work:

- [ ] Server starts without errors
- [ ] Login as student works
- [ ] Chat responds with AI tutor
- [ ] Whiteboard opens and draws graphs
- [ ] User can draw on whiteboard
- [ ] Login as teacher works
- [ ] Live feed shows active students
- [ ] Struggle alerts appear when student says "confused"
- [ ] Filter buttons work (All / Struggling / Milestones)

---

## 🚀 Ready to Code!

You're all set. The live feed polls every 30 seconds, so:
1. Keep a student session open in one browser
2. Keep teacher dashboard open in another
3. Watch the live feed update in real-time

**Pro tip:** Use Chrome DevTools Network tab to watch API calls to `/api/teacher/live-feed`

---

## 📞 Need Help?

- Check server logs: `npm run dev` shows all errors
- MongoDB logs: `/usr/local/var/log/mongodb/mongo.log` (macOS)
- Open an issue: https://github.com/jnappier7/mathmatix-ai/issues
