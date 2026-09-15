const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.get('/', (_req, res) => res.json({ message: 'Hello from DeployShield Deployed App!', status: 'online' }));
app.get('/hello', (_req, res) => res.json({ message: 'Hello World subpath works!' }));
app.post('/data', (req, res) => res.json({ received: req.body }));
app.listen(port, () => console.log(`Sample app running on port ${port}`));
