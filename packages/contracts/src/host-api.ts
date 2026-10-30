import type { DroneData } from './drone-types.js';

/**
 * API provided by host application to all remotes
 * This is the contract that ensures type-safe communication
 */
export interface HostAPI {
  /**
   * Event bus for cross-remote communication
   */
  eventBus: {
    subscribe<T>(event: string, handler: (data: T) => void): () => void;
    publish<T>(event: string, data: T): void;
  };

  /**
   * Access shared drone data
   */
  getDroneData(): Map<string, DroneData>;

  /**
   * Telemetry and error reporting
   */
  reportError(remote: string, error: Error): void;
  reportMetric(name: string, value: number): void;
}

/**
 * Props that every remote component receives
 */
export interface RemoteComponentProps {
  hostAPI: HostAPI;
}

/**
 * Remote manifest for version compatibility checks
 */
export interface RemoteManifest {
  name: string;
  version: string;
  react: {
    minVersion: string;
    maxVersion: string;
  };
  maxBundleSize: number; // bytes
  maxLoadTime: number;   // ms
}
