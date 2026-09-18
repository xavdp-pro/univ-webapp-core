/**
 * PM2 process definition. The app name is read from package.json ("name"):
 * a fork renames there, and both processes, the cookie name and the default
 * database name follow.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs --only <app>-api --update-env   # after editing .env
 *
 * Ports and public host come from .env (PORT, VITE_PORT, VITE_HMR_HOST, ...).
 * In production, set SERVE_DIST=true, run `npm run build` and start only <app>-api.
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const APP = require('./package.json').name
const API_PORT = process.env.PORT || '7700'
const VITE_PORT = process.env.VITE_PORT || '7701'

const shared = {
  cwd: __dirname,
  autorestart: true,
  max_restarts: 20,
  min_uptime: '5s',
  restart_delay: 2000,
  merge_logs: true,
  time: true,
}

module.exports = {
  apps: [
    {
      ...shared,
      name: `${APP}-api`,
      script: 'server/index.js',
      watch: ['server'],
      ignore_watch: ['node_modules', 'dist', 'src', 'public', '.pm2', 'log', 'tmp'],
      env: {
        // The API runs as production so its guard refuses a default JWT secret.
        NODE_ENV: process.env.NODE_ENV || 'production',
        PORT: API_PORT,
      },
    },
    {
      ...shared,
      name: `${APP}-vite`,
      script: 'node_modules/vite/bin/vite.js',
      args: `--host 127.0.0.1 --port ${VITE_PORT} --strictPort`,
      watch: ['vite.config.js'],
      ignore_watch: ['node_modules', 'dist', '.pm2', 'log', 'tmp'],
      env: {
        NODE_ENV: 'development',
        PORT: API_PORT,
        VITE_PORT,
      },
    },
  ],
}
