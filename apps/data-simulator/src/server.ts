import { WebSocketServer } from 'ws';
import { DroneSimulator } from './drone-simulator.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const INITIAL_DRONE_COUNT = 100;

const wss = new WebSocketServer({ port: PORT });

console.log(`
╔════════════════════════════════════════════════╗
║   Tactical Map Data Simulator                  ║
║   WebSocket Server                             ║
╚════════════════════════════════════════════════╝
`);

console.log(`📡 WebSocket server listening on ws://localhost:${PORT}`);
console.log(`🎯 Initial configuration: ${INITIAL_DRONE_COUNT} drones @ 30 Hz\n`);

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`\n🔌 Client connected from ${clientIp}`);

  const simulator = new DroneSimulator(INITIAL_DRONE_COUNT);
  simulator.start(ws);

  ws.on('message', (message) => {
    try {
      console.log('📨 Received message:', message.toString());
      const data = JSON.parse(message.toString());

      // Handle configuration updates from client
      if (data.type === 'config') {
        console.log('⚙️  Config update:', data);
        if (data.droneCount) {
          simulator.setDroneCount(data.droneCount);
          console.log(`✅ Drone count updated to ${data.droneCount}`);
        }
        if (data.updateRate) {
          simulator.setUpdateRate(data.updateRate);
        }
      }
    } catch (error) {
      console.error('❌ Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`\n🔌 Client disconnected from ${clientIp}`);
    simulator.stop();
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    simulator.stop();
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down server...');
  wss.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
