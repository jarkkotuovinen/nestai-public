import { Suspense, lazy, ComponentType } from 'react';
import type { HostAPI } from '@packages/contracts';

interface RemoteConfig {
  scope: string;
  module: string;
}

interface RemoteLoaderProps {
  config: RemoteConfig;
  hostAPI: HostAPI;
  fallback?: ComponentType;
}

export function RemoteLoader({ config, hostAPI, fallback: FallbackComponent }: RemoteLoaderProps) {
  let Component: ComponentType<any>;

  try {
    // Dynamically import the remote
    Component = lazy(() => import(config.scope).then((module) => ({ default: module[config.module] })));
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Failed to load remote');
    hostAPI.reportError(config.scope, err);

    if (FallbackComponent) {
      return <FallbackComponent />;
    }

    return (
      <div
        style={{
          padding: '16px',
          border: '1px solid #ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: '#ef4444',
          borderRadius: '8px',
          margin: '16px',
        }}
      >
        Failed to load {config.scope}: {err.message}
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div
          style={{
            padding: '16px',
            backgroundColor: 'rgba(107, 114, 128, 0.5)',
            borderRadius: '8px',
            margin: '16px',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        >
          Loading {config.scope}...
        </div>
      }
    >
      <Component hostAPI={hostAPI} />
    </Suspense>
  );
}
