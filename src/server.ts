import app from './app';
import { config } from './config';
import prisma from './lib/prisma';

const server = app.listen(config.port, () => {
  console.log(`=================================`);
  console.log(`  Server is running on port ${config.port}`);
  console.log(`  Environment: ${config.nodeEnv}`);
  console.log(`=================================`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[${signal}] Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('uncaughtException', (err: Error) => {
  console.error('[UNCAUGHT EXCEPTION] Shutting down...');
  console.error(err.name, err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (err: Error) => {
  console.error('[UNHANDLED REJECTION] Shutting down...');
  console.error(err.name, err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(1);
  });
});
