import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { config } from '../config';
import { AppError } from '../utils/AppError';

export interface HttpError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size must be less than 5MB';
    } else {
      message = err.message || 'File upload failed';
    }
  } else if (
    message.includes('Only images') ||
    message.includes('Only resume files') ||
    message.toLowerCase().includes('file type')
  ) {
    statusCode = 400;
  }

  console.error(`[Error] ${statusCode} - ${message}`);
  if (err.stack && config.nodeEnv !== 'production') {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(config.nodeEnv !== 'production' && { stack: err.stack }),
  });
};
