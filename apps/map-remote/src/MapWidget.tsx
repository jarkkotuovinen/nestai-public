import { useEffect, useRef, useState, useDeferredValue } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { RemoteComponentProps, DroneUpdateEvent, DroneData } from '@packages/contracts';

export default function MapWidget({ hostAPI }: RemoteComponentProps) {
  const [drones, setDrones] = useState<Map<string, DroneData>>(new Map());
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [showDroneList, setShowDroneList] = useState(false);
  const [sortBy, setSortBy] = useState<'id' | 'battery' | 'status'>('id');
  const [mapStyle, setMapStyle] = useState<'satellite' | 'dark' | 'street'>('satellite');

  const deferredDrones = useDeferredValue(drones);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // Map style configurations
  const getMapStyle = (style: 'satellite' | 'dark' | 'street') => {
    if (style === 'satellite') {
      return {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: 'Esri, Maxar, Earthstar Geographics',
            maxzoom: 18,
          },
          labels: {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
          },
        },
        layers: [
          { id: 'satellite', type: 'raster', source: 'satellite' },
          { id: 'labels', type: 'raster', source: 'labels' },
        ],
      };
    } else if (style === 'dark') {
      return 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    } else {
      return {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap Contributors',
            maxzoom: 19,
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      };
    }
  };

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(mapStyle) as any,
      center: [24.9384, 60.1699], // Helsinki
      zoom: 14,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');

    map.on('load', () => {
      mapRef.current = map;
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map style when changed
  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    const currentMap = mapRef.current;
    mapRef.current = null;

    currentMap.setStyle(getMapStyle(mapStyle) as any);

    currentMap.once('styledata', () => {
      mapRef.current = currentMap;
    });
  }, [mapStyle]);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDroneId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Subscribe to drone updates and events
  useEffect(() => {
    const unsubscribeDrones = hostAPI.eventBus.subscribe<DroneUpdateEvent>(
      'drone:update',
      (event) => {
        setDrones(event.payload.drones);
      }
    );

    const unsubscribeMapStyle = hostAPI.eventBus.subscribe(
      'map:style',
      (event: any) => {
        setMapStyle(event.payload.style);
      }
    );

    const unsubscribeDroneList = hostAPI.eventBus.subscribe(
      'map:toggleDroneList',
      () => {
        setShowDroneList((prev) => !prev);
      }
    );

    return () => {
      unsubscribeDrones();
      unsubscribeMapStyle();
      unsubscribeDroneList();
    };
  }, [hostAPI]);

  // Update markers on map
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove markers that no longer exist
    markersRef.current.forEach((marker, id) => {
      if (!deferredDrones.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Update or create markers
    const colors = {
      active: '#10b981',
      idle: '#fbbf24',
      returning: '#f59e0b',
      critical: '#ef4444',
    };

    deferredDrones.forEach((drone) => {
      let marker = markersRef.current.get(drone.id);

      if (!marker) {
        if (isNaN(drone.lon) || isNaN(drone.lat)) {
          console.error('Invalid coordinates for new drone', drone.id, drone);
          return;
        }

        const el = document.createElement('div');
        el.className = 'drone-marker';
        el.setAttribute('data-drone-id', drone.id);
        el.style.width = '18px';
        el.style.height = '18px';
        el.style.borderRadius = '50%';
        el.style.border = '3px solid rgba(255, 255, 255, 0.95)';
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.3s ease';
        el.style.transformOrigin = 'center';
        el.style.boxShadow =
          '0 0 12px rgba(0, 0, 0, 0.8), 0 0 6px rgba(255, 255, 255, 0.5)';
        el.style.backgroundColor = colors[drone.status] || colors.active;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const droneId = (e.currentTarget as HTMLElement).getAttribute('data-drone-id');
          if (droneId) {
            setSelectedDroneId(droneId);
          }
        });

        marker = new maplibregl.Marker({ element: el })
          .setLngLat([drone.lon, drone.lat])
          .addTo(mapRef.current!);

        markersRef.current.set(drone.id, marker);
      } else {
        if (isNaN(drone.lon) || isNaN(drone.lat)) {
          console.error('Invalid coordinates for drone', drone.id, drone);
          return;
        }
        marker.setLngLat([drone.lon, drone.lat]);
        const el = marker.getElement();
        el.style.backgroundColor = colors[drone.status] || colors.active;
      }
    });
  }, [deferredDrones]);

  // Update selection highlighting
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      const isSelected = id === selectedDroneId;

      el.style.border = isSelected
        ? '3px solid #ffffff'
        : '3px solid rgba(255, 255, 255, 0.95)';
      el.style.boxShadow = isSelected
        ? '0 0 24px rgba(59, 130, 246, 1), 0 0 48px rgba(59, 130, 246, 0.6), 0 0 12px rgba(255, 255, 255, 1)'
        : '0 0 12px rgba(0, 0, 0, 0.8), 0 0 6px rgba(255, 255, 255, 0.5)';
      el.style.zIndex = isSelected ? '1000' : '1';
    });
  }, [selectedDroneId]);

  // Get sorted drone list
  const getSortedDrones = () => {
    const dronesArray = Array.from(drones.values());

    switch (sortBy) {
      case 'battery':
        return dronesArray.sort((a, b) => a.battery - b.battery);
      case 'status':
        const statusOrder = { critical: 0, returning: 1, idle: 2, active: 3 };
        return dronesArray.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
      case 'id':
      default:
        return dronesArray.sort((a, b) => a.id.localeCompare(b.id));
    }
  };

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Drone Detail Panel */}
      {selectedDroneId && drones.get(selectedDroneId) && (() => {
        const drone = drones.get(selectedDroneId)!;
        const statusColors = {
          active: '#10b981',
          idle: '#fbbf24',
          returning: '#f59e0b',
          critical: '#ef4444',
        };
        const statusColor = statusColors[drone.status];

        return (
          <div
            style={{
              position: 'fixed',
              top: '16px',
              right: '220px',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              backdropFilter: 'blur(12px)',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '13px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              minWidth: '280px',
              maxWidth: '320px',
              zIndex: 1001,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#ffffff' }}>{drone.id}</h3>
              <button
                onClick={() => setSelectedDroneId(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  backgroundColor: statusColor,
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                }}
              >
                {drone.status}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#9ca3af' }}>Battery</span>
                <span style={{ color: drone.battery < 20 ? '#ef4444' : '#ffffff', fontWeight: 'bold' }}>
                  {Math.round(drone.battery)}%
                </span>
              </div>
              <div style={{ height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(0, Math.min(100, drone.battery))}%`,
                    backgroundColor: drone.battery < 20 ? '#ef4444' : drone.battery < 30 ? '#f59e0b' : '#10b981',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)', paddingTop: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <div style={{ color: '#9ca3af', marginBottom: '2px' }}>Latitude</div>
                  <div style={{ color: '#ffffff', fontWeight: 'bold' }}>{drone.lat.toFixed(5)}°</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', marginBottom: '2px' }}>Longitude</div>
                  <div style={{ color: '#ffffff', fontWeight: 'bold' }}>{drone.lon.toFixed(5)}°</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', marginBottom: '2px' }}>Altitude</div>
                  <div style={{ color: '#ffffff', fontWeight: 'bold' }}>{Math.round(drone.altitude)}m</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', marginBottom: '2px' }}>Speed</div>
                  <div style={{ color: '#ffffff', fontWeight: 'bold' }}>{drone.speed.toFixed(1)} m/s</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', marginBottom: '2px' }}>Heading</div>
                  <div style={{ color: '#ffffff', fontWeight: 'bold' }}>{Math.round(drone.heading)}°</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.2)', fontSize: '10px', color: '#6b7280' }}>
              Press ESC or click ✕ to close
            </div>
          </div>
        );
      })()}

      {/* Drone List Panel */}
      {showDroneList && (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            width: '400px',
            maxHeight: '50vh',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(12px)',
            color: 'white',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '13px',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            zIndex: 1001,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
                Drone Fleet ({drones.size})
              </h3>
              <button
                onClick={() => setShowDroneList(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setSortBy('id')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '11px',
                  backgroundColor: sortBy === 'id' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                ID
              </button>
              <button
                onClick={() => setSortBy('battery')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '11px',
                  backgroundColor: sortBy === 'battery' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Battery
              </button>
              <button
                onClick={() => setSortBy('status')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '11px',
                  backgroundColor: sortBy === 'status' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Status
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {getSortedDrones().map((drone) => {
              const statusColors = {
                active: '#10b981',
                idle: '#fbbf24',
                returning: '#f59e0b',
                critical: '#ef4444',
              };
              const statusColor = statusColors[drone.status];
              const isSelected = selectedDroneId === drone.id;

              return (
                <div
                  key={drone.id}
                  onClick={() => {
                    setSelectedDroneId(drone.id);
                    if (mapRef.current) {
                      mapRef.current.flyTo({
                        center: [drone.lon, drone.lat],
                        zoom: 16,
                        duration: 1000,
                      });
                    }
                  }}
                  style={{
                    padding: '12px',
                    marginBottom: '4px',
                    backgroundColor: isSelected
                      ? 'rgba(59, 130, 246, 0.3)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{drone.id}</div>
                    <div
                      style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        backgroundColor: statusColor,
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                      }}
                    >
                      {drone.status}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
                    <div>
                      Battery: <span style={{ color: drone.battery < 20 ? '#ef4444' : '#ffffff' }}>{Math.round(drone.battery)}%</span>
                    </div>
                    <div>Alt: {Math.round(drone.altitude)}m</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
