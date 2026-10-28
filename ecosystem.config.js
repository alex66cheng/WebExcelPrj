module.exports = {
  apps: [
    {
      name: 'mongodb',
      script: '/home/alex/mongodb/server/bin/mongod',
      args: '--dbpath /home/alex/mongodb/data --bind_ip 127.0.0.1 --port 27017',
    },
    {
      name: 'websideapi',
      script: 'index.js',
      cwd: './WebSideAPI',
    },
    {
      // Serves the prebuilt dist/ with serve-dist.mjs (Node built-ins only), so the server
      // needs neither the frontend source nor its node_modules. dist/ is built elsewhere and
      // uploaded by my-app-pt1/scripts/deploy-dist.sh, which then restarts this app
      // (serve-dist.mjs loads dist/ into memory at startup). To build on this machine
      // instead, run `npm run build` in my-app-pt1 and `pm2 restart frontend`.
      name: 'frontend',
      script: 'serve-dist.mjs',
      args: '--host 103.200.219.246 --port 5173',
      cwd: './my-app-pt1',
    },
  ],
};
