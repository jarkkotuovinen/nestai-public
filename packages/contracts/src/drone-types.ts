/**
 * Core drone data structure
 */
export interface DroneData {
  id: string;
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  speed: number;
  battery: number;
  status: 'active' | 'idle' | 'returning' | 'critical';
}

/**
 * Drone update payload
 */
export interface DroneUpdatePayload {
  drones: Map<string, DroneData>;
  timestamp: number;
  updateRate: number;
}
