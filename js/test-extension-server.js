import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 8080;

// Serve static files
app.use(express.static('.'));

app.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
});