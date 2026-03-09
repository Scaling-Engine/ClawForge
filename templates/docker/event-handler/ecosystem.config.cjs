module.exports = {
  apps: [{
    name: 'next',
    script: 'lib/ws/server.js',
    kill_timeout: 120000,
    env: {
      NODE_ENV: 'production',
      PORT: '80',
    },
  }]
};
