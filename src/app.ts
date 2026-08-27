import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import apiRouter from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { config } from './config';

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

// Ensure upload directories exist
const uploadDir = config.uploadsRoot;
const blogsUploadDir = config.blogsUploadDir;
const resumesUploadDir = config.resumesUploadDir;
const ourWorksUploadDir = config.ourWorksUploadDir;
[uploadDir, blogsUploadDir, resumesUploadDir, ourWorksUploadDir].forEach(
  (dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
);

// Serve uploaded static files publicly at /uploads/*
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
