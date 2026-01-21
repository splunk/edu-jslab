import pino from 'pino';

export const createLogger = (options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return pino({
    level: options.level || 'info',
    transport: isProduction ? undefined : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  });
};

export const logger = createLogger();
