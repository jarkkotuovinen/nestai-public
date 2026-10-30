import type { DroneData } from "@packages/contracts";

self.onmessage = (event: MessageEvent) => {
  const buffer = event.data as ArrayBuffer;
  const view = new DataView(buffer);

  // Create a fresh map for each update to avoid accumulating old drones
  const dronesMap = new Map<string, DroneData>();

  const recordSize = 32;
  if (buffer.byteLength % recordSize !== 0) {
    console.error("Invalid drone update size", buffer.byteLength);
    return;
  }

  let offset = 0;
  const numDrones = buffer.byteLength / recordSize;

  for (let i = 0; i < numDrones; i++) {
    const lat = view.getFloat32(offset, true);
    offset += 4;
    const lon = view.getFloat32(offset, true);
    offset += 4;
    const altitude = view.getFloat32(offset, true);
    offset += 4;
    const heading = view.getFloat32(offset, true);
    offset += 4;
    const speed = view.getFloat32(offset, true);
    offset += 4;
    const battery = view.getFloat32(offset, true);
    offset += 4;

    const idNum = view.getUint16(offset, true);
    offset += 2;
    const statusCode = view.getUint8(offset);
    offset += 2;

    const id = `DRONE-${idNum.toString().padStart(3, "0")}`;
    const status =
      (["active", "idle", "returning", "critical"] as const)[statusCode] ??
      "active";

    dronesMap.set(id, {
      id,
      lat,
      lon,
      altitude,
      heading,
      speed,
      battery,
      status,
    });
  }

  // Send back to main thread
  self.postMessage(Array.from(dronesMap.entries()));
};
