module.exports = {
  apps: [
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
