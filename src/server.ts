import express from 'express';
import cors from 'cors';
import path from 'path';
import { jobsRouter } from './routes/jobs';
import { agentRouter } from './routes/agent';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/jobs', jobsRouter);
app.use('/api', agentRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve frontend static files from dist-ui/
const distUiPath = path.resolve(process.cwd(), 'dist-ui');
app.use(express.static(distUiPath));

// SPA fallback: any non-API route serves index.html
app.get('*', (req, res) => {
  const indexPath = path.join(distUiPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Medidator] Server running on port ${PORT}`);
  console.log(`[Medidator] Health: http://localhost:${PORT}/health`);
  console.log(`[Medidator] Agent: POST http://localhost:${PORT}/api/agent`);
});
