
✅ PATCH INSTRUCTIONS

To activate session summary saving:

1. Add this route to your Express setup in server.js:
   const saveSummaryRoute = require('./routes/memory');  // already exists
   app.use('/memory', saveSummaryRoute);                // already exists

2. From the client, send POST to /memory/save-summary like this:

   fetch('/memory/save-summary', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       userId: localStorage.getItem("userId"),
       summary: "Today we reviewed systems of equations and substitution.",
       messages: chatHistory  // if you want to store full convo
     })
   });

3. The summary will be saved into MongoDB and retrieved next session.
