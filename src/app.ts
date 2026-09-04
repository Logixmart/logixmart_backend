import compression from 'compression';
import express, { Application, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import apiRouter from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { apiLimiter } from './middlewares/rateLimit';
import { config } from './config';
import { AppError } from './utils/AppError';

const app: Application = express();

const staticCacheOptions = {
  maxAge: config.isProduction ? '7d' : 0,
  etag: true,
  immutable: config.isProduction,
  setHeaders: (res: Response) => {
    // Allows performance observation and eliminates extension timing crashes
    res.setHeader('Timing-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Origin', '*');
  },
};

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(compression({ threshold: 1024 }));

app.use(
  cors(
    config.corsOrigins.length
      ? { origin: config.corsOrigins, credentials: true }
      : undefined
  )
);

app.use(
  morgan(config.isProduction ? 'combined' : 'dev', {
    skip: (req) =>
      req.originalUrl === '/api/health' || req.url === '/health',
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const uploadDirs = [
  config.uploadsRoot,
  config.blogsUploadDir,
  config.resumesUploadDir,
  config.ourWorksUploadDir,
];

uploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Public portfolio assets — served with Timing-Allow-Origin headers
app.use(
  '/uploads/blogs',
  express.static(config.blogsUploadDir, staticCacheOptions)
);
app.use(
  '/uploads/our-works',
  express.static(config.ourWorksUploadDir, staticCacheOptions)
);

app.use('/api', apiLimiter, apiRouter);

app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Not Found - ${req.originalUrl}`, 404));
});

app.use(errorHandler);

export default app;