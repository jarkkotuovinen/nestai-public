import type { DroneData } from './drone-types.js';

/**
 * Event types for cross-remote communication
 */
export type AppEvent =
  | DroneUpdateEvent
  | DroneSelectedEvent
  | PerformanceUpdateEvent
  | ConnectionStatusEvent;

export interface DroneUpdateEvent {
  type: 'drone:update';
  payload: {
    drones: Map<string, DroneData>;
    timestamp: number;
  };
}

export interface DroneSelectedEvent {
  type: 'drone:selected';
  payload: {
    droneId: string | null;
  };
}

export interface PerformanceUpdateEvent {
  type: 'performance:update';
  payload: {
    fps: number;
    frameTime: number;
    memoryUsage?: number;
  };
}

export interface ConnectionStatusEvent {
  type: 'connection:status';
  payload: {
    connected: boolean;
    message?: string;
  };
}
