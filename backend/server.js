const express = require('express');
const cors = require('cors');
const path = require('path');
const logsRouter = require('./routes/logs');

const app = express();
const PORT = process.env.PORT || 3001;

// Allow requests from the Vite dev server and same-origin in production
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  optionsSuccessStatus: 200,
}));

app.use(express.json());

// API routes
app.use('/api/logs', logsRouter);

// Serve the built frontend in production
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(distPath));

// Catch-all: serve index.html for SPA client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Xstore Log Viewer backend running on http://localhost:${PORT}`);
});
