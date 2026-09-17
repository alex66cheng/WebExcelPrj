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
      name: 'frontend',
      script: 'npm',
      args: 'run dev -- --host 103.200.219.246',
      cwd: './my-app-pt1',
    },
  ],
};
