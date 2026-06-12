const net = require('net');

const host = '84.247.162.186';
const ports = [5432, 5433, 5434, 5435, 80, 443, 3000, 8080, 8085];

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve({ port, open: true });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, open: false });
    });
    socket.on('error', () => {
      socket.destroy();
      resolve({ port, open: false });
    });
    socket.connect(port, host);
  });
}

async function run() {
  console.log(`Scanning ports on ${host}...`);
  for (const port of ports) {
    const res = await checkPort(port);
    if (res.open) {
      console.log(`  Port ${port} is OPEN`);
    } else {
      console.log(`  Port ${port} is closed`);
    }
  }
}
run();
