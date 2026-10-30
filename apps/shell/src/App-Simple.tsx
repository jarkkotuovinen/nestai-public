import {
  useEffect,
  useRef,
  useState,
  useTransition,
  useDeferredValue,
} from "react";
import type { DroneData } from "@packages/contracts";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";

/**
 * Tactical Map Dashboard - React 19 Concurrent Features Demo
 *
 * React Rendering Model:
 * ----------------------
 * 1. RENDER PHASE (interruptible):
 *    - React calls component functions to determine what changed
 *    - Creates a virtual DOM tree (fiber tree)
 *    - Diffs with previous tree (reconciliation)
 *    - Can be paused/resumed/abandoned for higher priority work
 *
 * 2. COMMIT PHASE (synchronous, uninterruptible):
 *    - Applies changes to actual DOM
 *    - Runs useLayoutEffect hooks
 *    - Browser paints
 *    - Runs useEffect hooks
 *
 * React 19 Concurrent Features Used:
 * -----------------------------------
 * - useTransition: Marks drone count updates as low-priority (keeps UI responsive)
 * - useDeferredValue: Defers expensive marker renders during user interactions
 * - Automatic batching: Multiple setState calls batched into single render (30Hz updates)
 * - StrictMode: Double-mounting in dev to catch side effect bugs
 */
export function App() {
  const [drones, setDrones] = useState<Map<string, DroneData>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const [droneCount, setDroneCount] = useState(100);
  const [mapStyle, setMapStyle] = useState<"satellite" | "dark" | "street">(
    "satellite",
  );
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [showDroneList, setShowDroneList] = useState(false);
  const [sortBy, setSortBy] = useState<"id" | "battery" | "status">("id");

  // React 19 concurrent features
  const [isPending, startTransition] = useTransition();
  const deferredDrones = useDeferredValue(drones);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const workerRef = useRef<Worker | null>(null);
  const wsInitializedRef = useRef(false);

  // FPS measurement
  useEffect(() => {
    const frameCountRef = { current: 0 };
    const lastTimeRef = { current: performance.now() };
    let animationFrameId: number;

    const measureFPS = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      frameCountRef.current++;

      if (delta >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / delta);
        setFps(currentFps);
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      animationFrameId = requestAnimationFrame(measureFPS);
    };

    animationFrameId = requestAnimationFrame(measureFPS);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // ESC key handler to close detail panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedDroneId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Map style configurations
  const getMapStyle = (style: "satellite" | "dark" | "street") => {
    if (style === "satellite") {
      return {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Esri, Maxar, Earthstar Geographics",
            maxzoom: 18,
          },
          labels: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
          },
        },
        layers: [
          { id: "satellite", type: "raster", source: "satellite" },
          { id: "labels", type: "raster", source: "labels" },
        ],
      };
    } else if (style === "dark") {
      return "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
    } else {
      return {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "&copy; OpenStreetMap Contributors",
            maxzoom: 19,
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      };
    }
  };

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(mapStyle) as any,
      center: [24.9384, 60.1699], // Helsinki city center
      zoom: 14,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-left");

    // Wait for map to fully load before setting ref
    map.on("load", () => {
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

    // Remove all markers before changing style
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    const currentMap = mapRef.current;

    // Temporarily set mapRef to null so markers won't be added during style load
    mapRef.current = null;

    currentMap.setStyle(getMapStyle(mapStyle) as any);

    // Wait for style to load before allowing markers again
    currentMap.once("styledata", () => {
      mapRef.current = currentMap;
    });
  }, [mapStyle]);

  // WebSocket connection with Web Worker
  // Proper StrictMode handling: use a ref flag to prevent double initialization
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // StrictMode-safe initialization: check if already connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    // Only mark as initialized after successful connection
    if (wsInitializedRef.current) {
      return;
    }

    // Create Web Worker for off-main-thread data processing
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("./worker/drone-processor.worker.ts", import.meta.url),
        {
          type: "module",
        },
      );

      // Worker message handler - React 19 batches these updates automatically
      workerRef.current.onmessage = (event) => {
        const updatedDrones = new Map(event.data) as Map<string, DroneData>;
        // This state update happens at 30Hz but React 19 batches them efficiently
        setDrones(updatedDrones);
      };
    }

    const ws = new WebSocket("ws://localhost:8080");
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Mark as initialized only after successful connection
      wsInitializedRef.current = true;
    };

    ws.onmessage = (event) => {
      // Offload binary parsing to Web Worker (keeps main thread responsive)
      workerRef.current?.postMessage(event.data);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsInitializedRef.current = false;
    };

    return () => {
      // In StrictMode, cleanup runs but we don't want to close a working connection
      // Only close if we're the "real" unmount (not StrictMode's fake unmount)
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  // Send drone count updates to server
  // Using useTransition: UI updates immediately, network request is non-blocking
  const handleDroneCountChange = (count: number) => {
    // Immediate UI update (not wrapped in transition - user sees slider move instantly)
    setDroneCount(count);

    // Non-blocking network request using startTransition
    // This tells React: "This update can be interrupted if something more urgent comes in"
    startTransition(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({ type: "config", droneCount: count });
        wsRef.current.send(message);
      }
    });
  };

  // Update markers on map
  // Using useDeferredValue: marker updates can be deferred during urgent interactions
  // React 19 rendering phases:
  // 1. Render phase: React calculates what changed (interruptible)
  // 2. Commit phase: React applies changes to DOM (synchronous)
  // useDeferredValue lets us defer expensive renders during the render phase
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    // Remove markers that no longer exist
    markersRef.current.forEach((marker, id) => {
      if (!deferredDrones.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Update or create markers
    const colors = {
      active: "#10b981",
      idle: "#fbbf24",
      returning: "#f59e0b",
      critical: "#ef4444",
    };

    // Use deferred drone data - React can skip this update if user is interacting
    deferredDrones.forEach((drone) => {
      let marker = markersRef.current.get(drone.id);

      if (!marker) {
        // Validate coordinates before creating marker
        if (isNaN(drone.lon) || isNaN(drone.lat)) {
          console.error("Invalid coordinates for new drone", drone.id, drone);
          return;
        }

        const el = document.createElement("div");
        el.className = "drone-marker";
        el.setAttribute("data-drone-id", drone.id);
        el.style.width = "18px";
        el.style.height = "18px";
        el.style.borderRadius = "50%";
        el.style.border = "3px solid rgba(255, 255, 255, 0.95)";
        el.style.cursor = "pointer";
        el.style.transition = "all 0.3s ease";
        el.style.transformOrigin = "center";
        el.style.boxShadow =
          "0 0 12px rgba(0, 0, 0, 0.8), 0 0 6px rgba(255, 255, 255, 0.5)";
        el.style.backgroundColor = colors[drone.status] || colors.active;

        // Click handler - use data attribute to avoid closure issues
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const droneId = (e.currentTarget as HTMLElement).getAttribute(
            "data-drone-id",
          );
          if (droneId) {
            setSelectedDroneId(droneId);
          }
        });

        marker = new maplibregl.Marker({ element: el })
          .setLngLat([drone.lon, drone.lat])
          .addTo(mapRef.current!);

        markersRef.current.set(drone.id, marker);
      } else {
        // Update position and color only
        if (isNaN(drone.lon) || isNaN(drone.lat)) {
          console.error("Invalid coordinates for drone", drone.id, drone);
          return;
        }
        marker.setLngLat([drone.lon, drone.lat]);
        const el = marker.getElement();
        el.style.backgroundColor = colors[drone.status] || colors.active;
      }
    });
  }, [deferredDrones]); // Use deferred value in dependency array

  // Separate effect for updating selection highlighting
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      const isSelected = id === selectedDroneId;

      // Only change visual effects - no size/position changes
      el.style.border = isSelected
        ? "3px solid #ffffff"
        : "3px solid rgba(255, 255, 255, 0.95)";
      el.style.boxShadow = isSelected
        ? "0 0 24px rgba(59, 130, 246, 1), 0 0 48px rgba(59, 130, 246, 0.6), 0 0 12px rgba(255, 255, 255, 1)"
        : "0 0 12px rgba(0, 0, 0, 0.8), 0 0 6px rgba(255, 255, 255, 0.5)";
      el.style.zIndex = isSelected ? "1000" : "1";
    });
  }, [selectedDroneId]);

  const getFpsColor = (fps: number) => {
    if (fps >= 55) return "#10b981";
    if (fps >= 30) return "#fbbf24";
    return "#ef4444";
  };

  // Get sorted drone list
  const getSortedDrones = () => {
    const dronesArray = Array.from(drones.values());

    switch (sortBy) {
      case "battery":
        return dronesArray.sort((a, b) => a.battery - b.battery);
      case "status":
        const statusOrder = { critical: 0, returning: 1, idle: 2, active: 3 };
        return dronesArray.sort(
          (a, b) => statusOrder[a.status] - statusOrder[b.status],
        );
      case "id":
      default:
        return dronesArray.sort((a, b) => a.id.localeCompare(b.id));
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#1a1a1a",
      }}
    >
      {/* Map Container */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Connection Banner */}
      {!isConnected && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: "#ef4444",
            color: "white",
            padding: "8px",
            textAlign: "center",
            fontSize: "14px",
            fontWeight: "bold",
            zIndex: 9999,
          }}
        >
          ⚠️ Disconnected from data source
        </div>
      )}

      {/* Performance Monitor */}
      <div
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(8px)",
          color: "white",
          padding: "16px",
          borderRadius: "8px",
          fontFamily: "monospace",
          fontSize: "14px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          minWidth: "180px",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span style={{ color: "#9ca3af" }}>FPS:</span>
          <span
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: getFpsColor(fps),
            }}
          >
            {fps}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span style={{ color: "#9ca3af" }}>Entities:</span>
          <span style={{ color: "#3b82f6", fontWeight: "bold" }}>
            {drones.size}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#9ca3af" }}>Connected:</span>
          <span style={{ color: isConnected ? "#10b981" : "#ef4444" }}>
            {isConnected ? "✓" : "✗"}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          position: "fixed",
          bottom: "16px",
          left: "16px",
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(8px)",
          color: "white",
          padding: "16px",
          borderRadius: "8px",
          minWidth: "240px",
          zIndex: 1000,
          border: "1px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <div style={{ marginBottom: "12px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              color: "#9ca3af",
              marginBottom: "4px",
            }}
          >
            Map Style
          </label>
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={() => setMapStyle("satellite")}
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: "12px",
                backgroundColor:
                  mapStyle === "satellite"
                    ? "#3b82f6"
                    : "rgba(255, 255, 255, 0.1)",
                color: "white",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "4px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Satellite
            </button>
            <button
              onClick={() => setMapStyle("dark")}
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: "12px",
                backgroundColor:
                  mapStyle === "dark" ? "#3b82f6" : "rgba(255, 255, 255, 0.1)",
                color: "white",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "4px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Tactical
            </button>
            <button
              onClick={() => setMapStyle("street")}
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: "12px",
                backgroundColor:
                  mapStyle === "street"
                    ? "#3b82f6"
                    : "rgba(255, 255, 255, 0.1)",
                color: "white",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "4px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Street
            </button>
          </div>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              color: "#9ca3af",
              marginBottom: "4px",
            }}
          >
            Drone Count:{" "}
            <span style={{ color: "white", fontWeight: "bold" }}>
              {droneCount}
            </span>
            {isPending && (
              <span
                style={{
                  marginLeft: "8px",
                  color: "#fbbf24",
                  fontSize: "12px",
                }}
              >
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
              width: "100%",
              opacity: isPending ? 0.7 : 1,
              transition: "opacity 0.2s",
            }}
          />
        </div>

        <div
          style={{
            marginBottom: "8px",
            paddingTop: "12px",
            borderTop: "1px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          <button
            onClick={() => setShowDroneList(!showDroneList)}
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "14px",
              backgroundColor: showDroneList
                ? "#3b82f6"
                : "rgba(255, 255, 255, 0.1)",
              color: "white",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "4px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {showDroneList ? "✕ Close" : "📋 Show"} Drone List
          </button>
        </div>

        <div
          style={{
            fontSize: "12px",
            color: "#9ca3af",
            borderTop: "1px solid rgba(255, 255, 255, 0.2)",
            paddingTop: "8px",
          }}
        >
          <div>← → ↑ ↓ Pan</div>
          <div>+ / - Zoom</div>
          <div>ESC Close detail</div>
        </div>
      </div>

      {/* Drone Detail Panel */}
      {selectedDroneId &&
        drones.get(selectedDroneId) &&
        (() => {
          const drone = drones.get(selectedDroneId)!;
          const statusColors = {
            active: "#10b981",
            idle: "#fbbf24",
            returning: "#f59e0b",
            critical: "#ef4444",
          };
          const statusColor = statusColors[drone.status];

          return (
            <div
              style={{
                position: "fixed",
                top: "16px",
                right: "220px",
                backgroundColor: "rgba(0, 0, 0, 0.9)",
                backdropFilter: "blur(12px)",
                color: "white",
                padding: "20px",
                borderRadius: "8px",
                fontFamily: "monospace",
                fontSize: "13px",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                minWidth: "280px",
                maxWidth: "320px",
                zIndex: 1001,
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: "bold",
                    color: "#ffffff",
                  }}
                >
                  {drone.id}
                </h3>
                <button
                  onClick={() => setSelectedDroneId(null)}
                  style={{
                    background: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    color: "white",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Status Badge */}
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    borderRadius: "12px",
                    backgroundColor: statusColor,
                    color: "white",
                    fontSize: "11px",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                  }}
                >
                  {drone.status}
                </div>
              </div>

              {/* Battery */}
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <span style={{ color: "#9ca3af" }}>Battery</span>
                  <span
                    style={{
                      color: drone.battery < 20 ? "#ef4444" : "#ffffff",
                      fontWeight: "bold",
                    }}
                  >
                    {Math.round(drone.battery)}%
                  </span>
                </div>
                <div
                  style={{
                    height: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(0, Math.min(100, drone.battery))}%`,
                      backgroundColor:
                        drone.battery < 20
                          ? "#ef4444"
                          : drone.battery < 30
                            ? "#f59e0b"
                            : "#10b981",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>

              {/* Position & Movement */}
              <div
                style={{
                  borderTop: "1px solid rgba(255, 255, 255, 0.2)",
                  paddingTop: "12px",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    <div style={{ color: "#9ca3af", marginBottom: "2px" }}>
                      Latitude
                    </div>
                    <div style={{ color: "#ffffff", fontWeight: "bold" }}>
                      {drone.lat.toFixed(5)}°
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#9ca3af", marginBottom: "2px" }}>
                      Longitude
                    </div>
                    <div style={{ color: "#ffffff", fontWeight: "bold" }}>
                      {drone.lon.toFixed(5)}°
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#9ca3af", marginBottom: "2px" }}>
                      Altitude
                    </div>
                    <div style={{ color: "#ffffff", fontWeight: "bold" }}>
                      {Math.round(drone.altitude)}m
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#9ca3af", marginBottom: "2px" }}>
                      Speed
                    </div>
                    <div style={{ color: "#ffffff", fontWeight: "bold" }}>
                      {drone.speed.toFixed(1)} m/s
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#9ca3af", marginBottom: "2px" }}>
                      Heading
                    </div>
                    <div style={{ color: "#ffffff", fontWeight: "bold" }}>
                      {Math.round(drone.heading)}°
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer note */}
              <div
                style={{
                  marginTop: "12px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255, 255, 255, 0.2)",
                  fontSize: "10px",
                  color: "#6b7280",
                }}
              >
                Press ESC or click ✕ to close
              </div>
            </div>
          );
        })()}

      {/* Drone List Panel */}
      {showDroneList && (
        <div
          style={{
            position: "fixed",
            bottom: "16px",
            right: "16px",
            width: "400px",
            maxHeight: "80vh",
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            backdropFilter: "blur(12px)",
            color: "white",
            borderRadius: "8px",
            fontFamily: "monospace",
            fontSize: "13px",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            zIndex: 1001,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>
                Drone Fleet ({drones.size})
              </h3>
              <button
                onClick={() => setShowDroneList(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "white",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Sort Buttons */}
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                onClick={() => setSortBy("id")}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: "11px",
                  backgroundColor:
                    sortBy === "id" ? "#3b82f6" : "rgba(255, 255, 255, 0.1)",
                  color: "white",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                ID
              </button>
              <button
                onClick={() => setSortBy("battery")}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: "11px",
                  backgroundColor:
                    sortBy === "battery"
                      ? "#3b82f6"
                      : "rgba(255, 255, 255, 0.1)",
                  color: "white",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Battery
              </button>
              <button
                onClick={() => setSortBy("status")}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: "11px",
                  backgroundColor:
                    sortBy === "status"
                      ? "#3b82f6"
                      : "rgba(255, 255, 255, 0.1)",
                  color: "white",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Status
              </button>
            </div>
          </div>

          {/* Drone List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {getSortedDrones().map((drone) => {
              const statusColors = {
                active: "#10b981",
                idle: "#fbbf24",
                returning: "#f59e0b",
                critical: "#ef4444",
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
                    padding: "12px",
                    marginBottom: "4px",
                    backgroundColor: isSelected
                      ? "rgba(59, 130, 246, 0.3)"
                      : "rgba(255, 255, 255, 0.05)",
                    border: `1px solid ${isSelected ? "#3b82f6" : "rgba(255, 255, 255, 0.1)"}`,
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor =
                        "rgba(255, 255, 255, 0.1)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor =
                        "rgba(255, 255, 255, 0.05)";
                    }
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                      {drone.id}
                    </div>
                    <div
                      style={{
                        padding: "2px 8px",
                        borderRadius: "10px",
                        backgroundColor: statusColor,
                        color: "white",
                        fontSize: "10px",
                        fontWeight: "bold",
                        textTransform: "uppercase",
                      }}
                    >
                      {drone.status}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      color: "#9ca3af",
                    }}
                  >
                    <div>
                      Battery:{" "}
                      <span
                        style={{
                          color: drone.battery < 20 ? "#ef4444" : "#ffffff",
                        }}
                      >
                        {Math.round(drone.battery)}%
                      </span>
                    </div>
                    <div>Alt: {Math.round(drone.altitude)}m</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
