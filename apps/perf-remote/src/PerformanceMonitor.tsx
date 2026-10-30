import { useEffect, useRef, useState } from "react";
import type {
  RemoteComponentProps,
  DroneUpdateEvent,
} from "@packages/contracts";

interface PerformanceStats {
  fps: number;
  frameTime: number;
  droneCount: number;
  updateRate: number;
  memoryUsage?: number;
}

export default function PerformanceMonitor({ hostAPI }: RemoteComponentProps) {
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 0,
    frameTime: 0,
    droneCount: 0,
    updateRate: 0,
  });
  const [isConnected, setIsConnected] = useState(false);

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const fpsHistoryRef = useRef<number[]>([]);

  // FPS measurement
  useEffect(() => {
    let animationFrameId: number;

    const measureFPS = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;

      frameCountRef.current++;

      // Update FPS every second
      if (delta >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / delta);
        const frameTime = delta / frameCountRef.current;

        // Keep FPS history for averaging
        fpsHistoryRef.current.push(fps);
        if (fpsHistoryRef.current.length > 10) {
          fpsHistoryRef.current.shift();
        }

        const avgFps = Math.round(
          fpsHistoryRef.current.reduce((a, b) => a + b, 0) /
            fpsHistoryRef.current.length,
        );

        setStats((prev) => ({
          ...prev,
          fps: avgFps,
          frameTime: Math.round(frameTime * 100) / 100,
          memoryUsage:
            // @ts-expect-error - performance.memory is Chrome-specific
            performance.memory?.usedJSHeapSize / 1048576, // MB
        }));

        // Report to host
        hostAPI.eventBus.publish("performance:update", {
          type: "performance:update",
          payload: {
            fps: avgFps,
            frameTime: Math.round(frameTime * 100) / 100,
            memoryUsage:
              // @ts-expect-error - performance.memory is Chrome-specific
              performance.memory?.usedJSHeapSize / 1048576,
          },
        });

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      animationFrameId = requestAnimationFrame(measureFPS);
    };

    animationFrameId = requestAnimationFrame(measureFPS);

    return () => cancelAnimationFrame(animationFrameId);
  }, [hostAPI]);

  // Subscribe to drone updates
  useEffect(() => {
    const unsubscribeDrones = hostAPI.eventBus.subscribe<DroneUpdateEvent>(
      "drone:update",
      (event) => {
        setStats((prev) => ({
          ...prev,
          droneCount: event.payload.drones.size,
          updateRate: 30, // TODO: Calculate from actual updates
        }));
      },
    );

    const unsubscribeConnection = hostAPI.eventBus.subscribe(
      "connection:status",
      (event: any) => {
        setIsConnected(event.payload.connected);
      },
    );

    return () => {
      unsubscribeDrones();
      unsubscribeConnection();
    };
  }, [hostAPI]);

  const getFpsColor = (fps: number) => {
    if (fps >= 55) return "#10b981"; // green
    if (fps >= 30) return "#fbbf24"; // yellow
    return "#ef4444"; // red
  };

  return (
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
        minWidth: "200px",
        zIndex: 1000,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <span style={{ color: "#9ca3af" }}>FPS:</span>
          <span
            style={{
              fontSize: "32px",
              fontWeight: "bold",
              color: getFpsColor(stats.fps),
            }}
          >
            {stats.fps}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <span style={{ color: "#9ca3af" }}>Frame Time:</span>
          <span>{stats.frameTime.toFixed(2)}ms</span>
        </div>

        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.2)",
            margin: "8px 0",
            paddingTop: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <span style={{ color: "#9ca3af" }}>Entities:</span>
            <span style={{ color: "#3b82f6", fontWeight: "bold" }}>
              {stats.droneCount}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <span style={{ color: "#9ca3af" }}>Update Rate:</span>
            <span>{stats.updateRate} Hz</span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <span style={{ color: "#9ca3af" }}>Connected:</span>
            <span style={{ color: isConnected ? "#10b981" : "#ef4444" }}>
              {isConnected ? "✓" : "✗"}
            </span>
          </div>

          {stats.memoryUsage && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
              }}
            >
              <span style={{ color: "#9ca3af" }}>Memory:</span>
              <span>{stats.memoryUsage.toFixed(1)} MB</span>
            </div>
          )}
        </div>

        {/* FPS Graph (mini sparkline) */}
        <div
          style={{
            marginTop: "8px",
            height: "32px",
            display: "flex",
            alignItems: "flex-end",
            gap: "2px",
          }}
        >
          {fpsHistoryRef.current.map((fps, i) => (
            <div
              key={i}
              style={{
                width: "8px",
                height: `${(fps / 60) * 100}%`,
                backgroundColor: getFpsColor(fps),
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
