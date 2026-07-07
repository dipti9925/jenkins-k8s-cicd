const http = require('http');
const port = 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from my Jenkins + Kubernetes CI/CD pipeline! Version 1\n');
});

server.listen(port, () => console.log(`Running on port ${port}`));