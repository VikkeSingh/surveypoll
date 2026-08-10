// Local development server. On Vercel, api/index.js is the entry point instead.
const app = require('./src/app');
const { port } = require('./src/config');

app.listen(port, () => {
  console.log(`surveypoll listening on http://localhost:${port}`);
});
