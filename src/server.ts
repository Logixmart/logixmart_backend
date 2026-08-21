import app from './app';
import { config } from './config';

const server = app.listen(config.port, () => {
  console.log(`=================================`);
  console.log(`  Server is running on port ${config.port}`);
  console.log(`  Environment: ${config.nodeEnv}`);
  console.log(`=================================`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('[UNCAUGHT EXCEPTION] Shutting down...');
  console.error(err.name, err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('[UNHANDLED REJECTION] Shutting down...');
  console.error(err.name, err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  server.close(() => {
    process.exit(1);
  });
});
