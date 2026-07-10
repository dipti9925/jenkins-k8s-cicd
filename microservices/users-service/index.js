const http = require('http');
const port = 4000;

const users = {
  1: { id: 1, name: "Dipti Badwaik", email: "dipti@example.com" },
  2: { id: 2, name: "Rahul Sharma", email: "rahul@example.com" },
  3: { id: 3, name: "Anita Verma", email: "anita@example.com" }
};

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'users-service' }));
    return;
  }

  const match = req.url.match(/^\/users\/(\d+)$/);
  if (match) {
    const userId = match[1];
    const user = users[userId];
    if (user) {
      res.writeHead(200);
      res.end(JSON.stringify(user));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'User not found' }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(port, () => console.log(`users-service running on port ${port}`));
