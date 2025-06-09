import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static('example'));
app.use('/dist', express.static('dist'));

// Endpoint to get environment variables (without exposing secrets in HTML)
app.get('/api/config', (req, res) => {
  res.json({
    DNS: process.env.DNS,
    ZONEID: process.env.ZONEID,
    API: process.env.API,
    ROOMID: process.env.ROOMID
  });
});

// Serve the example with injected env
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'example', 'index.html'));
});

app.listen(port, () => {
  console.log(`P2P2 example server running at http://localhost:${port}`);
  console.log('Environment loaded:', {
    DNS: process.env.DNS,
    ZONEID: process.env.ZONEID ? '***' : undefined,
    API: process.env.API ? '***' : undefined,
    ROOMID: process.env.ROOMID
  });
});