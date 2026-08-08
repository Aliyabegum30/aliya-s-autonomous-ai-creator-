// Server entry point. Only responsibility: bind the Express app (src/app.js)
// to a port. Keeping this separate from app.js means the app can be
// required directly (e.g. by a future test) without opening a socket.

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[server] Postmortem agent listening on port ${PORT}`);
});
