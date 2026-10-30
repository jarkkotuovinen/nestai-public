import type { DroneData } from '@packages/contracts';
import type WebSocket from 'ws';

export class DroneSimulator {
  private drones: Map<string, DroneData> = new Map();
  private updateRate: number;
  private intervalId?: NodeJS.Timeout;

  constructor(numDrones: number, updateRate = 30) {
    this.updateRate = updateRate;
    this.initializeDrones(numDrones);
  }

  private initializeDrones(count: number) {
    // Initialize drones in Helsinki region
    for (let i = 0; i < count; i++) {
      const id = `DRONE-${i.toString().padStart(3, '0')}`;
      this.drones.set(id, {
        id,
        lat: 60.1699 + (Math.random() - 0.5) * 0.1, // ~5km radius
        lon: 24.9384 + (Math.random() - 0.5) * 0.1,
        altitude: 50 + Math.random() * 100,
        heading: Math.random() * 360,
        speed: 5 + Math.random() * 15, // m/s
        battery: 60 + Math.random() * 40,
        status: Math.random() > 0.8 ? 'critical' : 'active',
      });
    }
    console.log(`✅ Initialized ${count} drones in Helsinki region`);
  }

  private updateDrones() {
    // Helsinki region bounds (approximately 10km radius)
    const BOUNDS = {
      minLat: 60.12,
      maxLat: 60.22,
      minLon: 24.88,
      maxLon: 24.99,
    };

    this.drones.forEach((drone) => {
      // Simulate realistic movement based on heading and speed
      // Speed is in m/s, update rate is Hz
      const distanceMeters = drone.speed / this.updateRate; // distance per update in meters
      const distanceKm = distanceMeters / 1000; // convert to km

      // Convert km to degrees (approximately)
      // 1 degree latitude ≈ 111 km
      const deltaLat = (distanceKm / 111) * Math.cos((drone.heading * Math.PI) / 180);
      const deltaLon =
        ((distanceKm / 111) * Math.sin((drone.heading * Math.PI) / 180)) /
        Math.cos((drone.lat * Math.PI) / 180);

      drone.lat += deltaLat;
      drone.lon += deltaLon;

      // Boundary checking - bounce back if out of bounds
      if (drone.lat < BOUNDS.minLat || drone.lat > BOUNDS.maxLat) {
        drone.lat = Math.max(BOUNDS.minLat, Math.min(BOUNDS.maxLat, drone.lat));
        drone.heading = 180 - drone.heading; // Reverse north/south direction
      }
      if (drone.lon < BOUNDS.minLon || drone.lon > BOUNDS.maxLon) {
        drone.lon = Math.max(BOUNDS.minLon, Math.min(BOUNDS.maxLon, drone.lon));
        drone.heading = 360 - drone.heading; // Reverse east/west direction
      }

      // Gradual heading changes (realistic flight patterns)
      drone.heading += (Math.random() - 0.5) * 5;
      if (drone.heading < 0) drone.heading += 360;
      if (drone.heading >= 360) drone.heading -= 360;

      // Battery drain (0.02 per update = ~3 minutes to drain at 30Hz)
      drone.battery -= 0.02;
      if (drone.battery < 0) drone.battery = 100; // Recharge

      // Status changes based on battery
      if (drone.battery < 20) {
        drone.status = 'critical';
      } else if (drone.battery < 30) {
        drone.status = 'returning';
      } else {
        drone.status = 'active';
      }

      // Altitude variation
      drone.altitude += (Math.random() - 0.5) * 2;
      drone.altitude = Math.max(10, Math.min(200, drone.altitude));
    });
  }

  /**
   * Encode drone data as binary for efficient transmission
   * Format: 32 bytes per drone
   * - lat (4 bytes, float32)
   * - lon (4 bytes, float32)
   * - altitude (4 bytes, float32)
   * - heading (4 bytes, float32)
   * - speed (4 bytes, float32)
   * - battery (4 bytes, float32)
   * - id number (2 bytes, uint16)
   * - status (1 byte, uint8)
   * - padding (1 byte)
   */
  private encodeUpdate(): ArrayBuffer {
    const buffer = new ArrayBuffer(this.drones.size * 32);
    const view = new DataView(buffer);
    let offset = 0;

    this.drones.forEach((drone) => {
      view.setFloat32(offset, drone.lat, true);
      offset += 4;
      view.setFloat32(offset, drone.lon, true);
      offset += 4;
      view.setFloat32(offset, drone.altitude, true);
      offset += 4;
      view.setFloat32(offset, drone.heading, true);
      offset += 4;
      view.setFloat32(offset, drone.speed, true);
      offset += 4;
      view.setFloat32(offset, drone.battery, true);
      offset += 4;

      const idNum = parseInt(drone.id.split('-')[1]);
      view.setUint16(offset, idNum, true);
      offset += 2;

      const statusMap = { active: 0, idle: 1, returning: 2, critical: 3 };
      view.setUint8(offset, statusMap[drone.status]);
      offset += 1;

      offset += 1; // padding
    });

    return buffer;
  }

  start(ws: WebSocket) {
    this.intervalId = setInterval(() => {
      this.updateDrones();
      const data = this.encodeUpdate();

      if (ws.readyState === 1) {
        // WebSocket.OPEN
        ws.send(data);
      } else {
        this.stop();
      }
    }, 1000 / this.updateRate);

    console.log(`🚀 Simulator started: ${this.drones.size} drones @ ${this.updateRate} Hz`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log('⏹️  Simulator stopped');
    }
  }

  setDroneCount(count: number) {
    this.drones.clear();
    this.initializeDrones(count);
  }

  setUpdateRate(rate: number) {
    this.updateRate = rate;
    console.log(`📊 Update rate changed to ${rate} Hz`);
  }
}
