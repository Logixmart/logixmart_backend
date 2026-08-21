import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import apiRouter from './routes';
import { errorHandler } from './middlewares/errorHandler';

const app: Application = express();

// Set security HTTP headers (configure CORP to allow loading images cross-origin)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Enable CORS
app.use(cors());

// Development logging (skip health check logs to keep console clean)
app.use(
  morgan('dev', {
    skip: (req) => req.originalUrl === '/api/health' || req.url === '/health',
  })
);

// Parse incoming request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded static files
app.use('/uploads', express.static(uploadDir));

// API Routes
app.use('/api', apiRouter);

// Handle undefined routes
app.use((req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
});

// Global Error Handler
app.use(errorHandler);

export default app;

