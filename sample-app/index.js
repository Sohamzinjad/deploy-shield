const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Hello from DeployShield Deployed App!',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

app.get('/hello', (req, res) => {
  res.json({ message: 'Hello World subpath works!' });
});

app.post('/data', (req, res) => {
  res.json({ received: req.body });
});

app.listen(PORT, () => {
  console.log(`Sample app running on port ${PORT}`);
});
