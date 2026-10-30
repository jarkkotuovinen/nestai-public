import { useState, useEffect, useTransition } from 'react';
import type { RemoteComponentProps } from '@packages/contracts';

export default function DemoControls({ hostAPI }: RemoteComponentProps) {
  const [droneCount, setDroneCount] = useState(100);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'dark' | 'street'>('satellite');
  const [isPending, startTransition] = useTransition();

  // Send drone count updates via WebSocket
  const handleDroneCountChange = (count: number) => {
    setDroneCount(count);

    // Non-blocking network request using startTransition
    startTransition(() => {
      // Publish via event bus to notify other components
      hostAPI.eventBus.publish('config:droneCount', {
        type: 'config:droneCount',
        payload: { count },
      });

      hostAPI.reportMetric('config.droneCount', count);
    });
  };

  const handleMapStyleChange = (style: 'satellite' | 'dark' | 'street') => {
    setMapStyle(style);
    hostAPI.eventBus.publish('map:style', {
      type: 'map:style',
      payload: { style },
    });
  };

  const handleToggleDroneList = () => {
    hostAPI.eventBus.publish('map:toggleDroneList', {
      type: 'map:toggleDroneList',
      payload: {},
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        color: 'white',
        padding: '16px',
        borderRadius: '8px',
        minWidth: '240px',
        zIndex: 1000,
        border: '1px solid rgba(255, 255, 255, 0.2)',
      }}
    >
      <div style={{ marginBottom: '12px' }}>
        <label
          style={{
            display: 'block',
            fontSize: '14px',
            color: '#9ca3af',
            marginBottom: '4px',
          }}
        >
          Map Style
        </label>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => handleMapStyleChange('satellite')}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '12px',
              backgroundColor: mapStyle === 'satellite' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Satellite
          </button>
          <button
            onClick={() => handleMapStyleChange('dark')}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '12px',
              backgroundColor: mapStyle === 'dark' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Tactical
          </button>
          <button
            onClick={() => handleMapStyleChange('street')}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '12px',
              backgroundColor: mapStyle === 'street' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Street
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label
          style={{
            display: 'block',
            fontSize: '14px',
            color: '#9ca3af',
            marginBottom: '4px',
          }}
        >
          Drone Count:{' '}
          <span style={{ color: 'white', fontWeight: 'bold' }}>{droneCount}</span>
          {isPending && (
            <span style={{ marginLeft: '8px', color: '#fbbf24', fontSize: '12px' }}>
              ⏳ updating...
            </span>
          )}
        </label>
        <input
          type="range"
          min="10"
          max="500"
          step="10"
          value={droneCount}
          onChange={(e) => handleDroneCountChange(parseInt(e.target.value))}
          style={{
            width: '100%',
            opacity: isPending ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}
        />
      </div>

      <div
        style={{
          marginBottom: '8px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <button
          onClick={handleToggleDroneList}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '14px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          📋 Toggle Drone List
        </button>
      </div>

      <div
        style={{
          fontSize: '12px',
          color: '#9ca3af',
          borderTop: '1px solid rgba(255, 255, 255, 0.2)',
          paddingTop: '8px',
        }}
      >
        <div>← → ↑ ↓ Pan</div>
        <div>+ / - Zoom</div>
        <div>ESC Close detail</div>
      </div>
    </div>
  );
}
