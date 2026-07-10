const http = require('http');
const port = 5000;

// Fake in-memory "database" of orders
const orders = {
  101: { id: 101, userId: 1, item: "Laptop", amount: 75000 },
  102: { id: 102, userId: 2, item: "Headphones", amount: 2500 },
  103: { id: 103, userId: 1, item: "Mouse", amount: 800 }
};

// Kubernetes will let us reach users-service by its Service name later
const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || 'http://localhost:4000';

function fetchUser(userId) {
  return new Promise((resolve, reject) => {
    http.get(`${USERS_SERVICE_URL}/users/${userId}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'orders-service' }));
    return;
  }

  const match = req.url.match(/^\/orders\/(\d+)$/);
  if (match) {
    const orderId = match[1];
    const order = orders[orderId];
    if (!order) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Order not found' }));
      return;
    }

    try {
      const user = await fetchUser(order.userId);
      res.writeHead(200);
      res.end(JSON.stringify({ ...order, customer: user }));
    } catch (err) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Could not reach users-service', details: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(port, () => console.log(`orders-service running on port ${port}`));
