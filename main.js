const { startServer } = require('./server');

function main() {
  let port = 3000;
  let host = 'localhost';
  startServer(port, host);
}

if (require.main === module) {
  main();
}
