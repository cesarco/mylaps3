module.exports = {
  apps: [{
    name: 'mylaps-simulator',
    script: 'server.js',
    cwd: '/home/linuxuser/mylaps/node-simulator',
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 6050
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 6050
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/home/linuxuser/mylaps/node-simulator/logs/err.log',
    out_file: '/home/linuxuser/mylaps/node-simulator/logs/out.log',
    log_file: '/home/linuxuser/mylaps/node-simulator/logs/combined.log',
    time: true
  }]
};
