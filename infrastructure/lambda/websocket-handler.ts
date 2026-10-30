import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

// Store connections in DynamoDB in production
const connections = new Set<string>();

// Drone simulation state
let drones: Map<string, any> = new Map();
let droneCount = 100;
let updateInterval: NodeJS.Timeout | null = null;

// Initialize drones
function initializeDrones(count: number) {
  drones.clear();
  const helsinkiLat = 60.1699;
  const helsinkiLon = 24.9384;

  for (let i = 0; i < count; i++) {
    const droneId = `DRONE-${String(i + 1).padStart(3, '0')}`;
    drones.set(droneId, {
      id: droneId,
      lat: helsinkiLat + (Math.random() - 0.5) * 0.05,
      lon: helsinkiLon + (Math.random() - 0.5) * 0.05,
      altitude: 50 + Math.random() * 100,
      speed: 5 + Math.random() * 15,
      heading: Math.random() * 360,
      battery: 20 + Math.random() * 80,
      status: ['active', 'idle', 'returning'][Math.floor(Math.random() * 3)],
    });
  }
}

// Update drone positions
function updateDrones() {
  drones.forEach((drone) => {
    const headingRad = (drone.heading * Math.PI) / 180;
    const speedInDegrees = (drone.speed / 111320) * (1/30); // 30 Hz update rate

    drone.lat += Math.sin(headingRad) * speedInDegrees;
    drone.lon += Math.cos(headingRad) * speedInDegrees;

    // Random heading changes
    if (Math.random() < 0.05) {
      drone.heading = (drone.heading + (Math.random() - 0.5) * 30) % 360;
    }

    // Battery drain
    drone.battery = Math.max(0, drone.battery - 0.01);

    // Update status based on battery
    if (drone.battery < 20) {
      drone.status = 'critical';
    } else if (drone.battery < 30) {
      drone.status = 'returning';
    }
  });
}

// Serialize drone data
function serializeDrones(): ArrayBuffer {
  const buffer = new ArrayBuffer(drones.size * 48);
  const view = new DataView(buffer);

  let offset = 0;
  drones.forEach((drone) => {
    // ID (first 16 bytes, ASCII)
    for (let i = 0; i < 16; i++) {
      view.setUint8(offset + i, drone.id.charCodeAt(i) || 0);
    }
    offset += 16;

    view.setFloat64(offset, drone.lat, true); offset += 8;
    view.setFloat64(offset, drone.lon, true); offset += 8;
    view.setFloat32(offset, drone.altitude, true); offset += 4;
    view.setFloat32(offset, drone.speed, true); offset += 4;
    view.setFloat32(offset, drone.heading, true); offset += 4;
    view.setFloat32(offset, drone.battery, true); offset += 4;
  });

  return buffer;
}

// Broadcast to all connections
async function broadcastToConnections(apiClient: ApiGatewayManagementApiClient) {
  updateDrones();
  const data = serializeDrones();

  const promises = Array.from(connections).map(async (connectionId) => {
    try {
      await apiClient.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(data),
      }));
    } catch (error: any) {
      if (error.statusCode === 410) {
        connections.delete(connectionId);
      }
    }
  });

  await Promise.all(promises);
}

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  const { requestContext } = event;
  const { connectionId, routeKey } = requestContext;

  const apiClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${requestContext.domainName}/${requestContext.stage}`,
  });

  console.log(`Route: ${routeKey}, ConnectionId: ${connectionId}`);

  try {
    switch (routeKey) {
      case '$connect':
        connections.add(connectionId!);
        console.log(`Client connected: ${connectionId}. Total connections: ${connections.size}`);

        // Initialize drones if not already done
        if (drones.size === 0) {
          initializeDrones(droneCount);
        }

        // Start broadcasting if first connection
        if (connections.size === 1 && !updateInterval) {
          updateInterval = setInterval(() => {
            broadcastToConnections(apiClient).catch(console.error);
          }, 1000 / 30); // 30 Hz
        }

        return { statusCode: 200 };

      case '$disconnect':
        connections.delete(connectionId!);
        console.log(`Client disconnected: ${connectionId}. Total connections: ${connections.size}`);

        // Stop broadcasting if no connections
        if (connections.size === 0 && updateInterval) {
          clearInterval(updateInterval);
          updateInterval = null;
        }

        return { statusCode: 200 };

      case '$default':
        // Handle configuration messages
        try {
          const body = JSON.parse(event.body || '{}');

          if (body.type === 'config' && body.droneCount) {
            droneCount = Math.min(500, Math.max(10, body.droneCount));
            initializeDrones(droneCount);
            console.log(`Drone count updated to: ${droneCount}`);
          }
        } catch (e) {
          console.error('Failed to parse message:', e);
        }

        return { statusCode: 200 };

      default:
        return { statusCode: 400 };
    }
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500 };
  }
};
