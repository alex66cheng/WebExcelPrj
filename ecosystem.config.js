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
      // Production build served by serve-dist.mjs (compressed + browser-cached), not the
      // Vite dev server. Each start/restart rebuilds first (~30 s), so restarting always
      // serves the latest code. For hot-reload while coding, run `npm run dev` separately.
      name: 'frontend',
      script: 'npm',
      args: 'run serve:prod',
      cwd: './my-app-pt1',
    },
  ],
};
