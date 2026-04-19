/**
 * PM2 Ecosystem Config
 * Start:   pm2 start ecosystem.config.js
 * Restart: pm2 restart portfolio-backend
 * Logs:    pm2 logs portfolio-backend
 * Status:  pm2 list
 */
module.exports = {
  apps: [
    {
      name: 'portfolio-backend',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
