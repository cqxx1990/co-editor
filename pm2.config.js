module.exports = {
  apps: [{
    name: 'co-editor',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DB_PATH: './co-editor.db',
      HTTPS_ENABLED: false,
      HTTPS_KEY_PATH: './certs/privkey.pem',
      HTTPS_CERT_PATH: './certs/cert.pem'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
