import http from 'http';

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

console.log('Starting server...');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
      <head><title>Test Page</title></head>
      <body><h1>Hello from Node.js HTTP Server!</h1></body>
    </html>
  `);
});

server.on('error', (err) => {
  console.error('Server failed to start:', err);
});

server.listen(PORT, HOST, () => {
  console.log(`Serving custom HTML at http://localhost:${PORT}`);
});
