<template>
  <section class="map-panel" aria-label="Chatroom map">
    <div ref="container" class="map-canvas"
      aria-label="Map. Click to create a chatroom, or press Enter to add a pin at the center."
      @keydown.enter.self.prevent="addAtCenter"></div>
    <div v-if="tileError || chat.mapError || chat.truncated" class="map-notice" role="status">
      {{ chat.mapError || (tileError ? "Map tiles could not load. Check your internet connection." :
        "There are more rooms in this area. Zoom in to see them.") }}
      <button v-if="chat.mapError" @click="chat.refresh">Retry</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useDebounceFn, useResizeObserver } from "@vueuse/core";
import L from "leaflet";
import "leaflet.markercluster";
import { useChat } from "../../stores/chat";
import { roomTheme } from "../../utils/roomTheme";

const chat = useChat();
const container = ref<HTMLDivElement | null>(null);
const tileError = ref(false);
let map: L.Map | undefined;
let clusters: L.MarkerClusterGroup | undefined;
const markers = new Map<string, L.Marker>();

const wrap = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;

function publishBounds() {
  if (!map) return;
  const b = map.getBounds(), wide = b.getEast() - b.getWest() >= 360;
  chat.setBounds([wide ? -180 : wrap(b.getWest()), Math.max(-90, b.getSouth()),
    wide ? 180 : wrap(b.getEast()), Math.min(90, b.getNorth())].join(","));
}

const publishBoundsLater = useDebounceFn(publishBounds, 250);
useResizeObserver(container, () => map?.invalidateSize({ pan: false }));

function syncMarkers() {
  if (!clusters) return;
  const ids = new Set(chat.rooms.map(room => room.id));
  for (const [id, marker] of markers) if (!ids.has(id)) { clusters.removeLayer(marker); markers.delete(id); }
  for (const room of chat.rooms) {
    const pin = document.createElement("span");
    pin.className = "pin-shape";
    for (const [name, value] of Object.entries(roomTheme(room.id, room.color))) pin.style.setProperty(name, value);
    pin.append(document.createElement("span"));
    const icon = L.divIcon({
      className: "room-marker" + (room.id === chat.selectedRoomId ? " selected" : ""),
      html: pin,
      iconSize: [36, 44], iconAnchor: [18, 44],
    });
    let marker = markers.get(room.id);
    if (!marker) {
      const label = document.createElement("span"); label.textContent = room.title;
      marker = L.marker([room.location.coordinates[1], room.location.coordinates[0]], {
        title: "Open " + room.title, keyboard: true, bubblingMouseEvents: false,
      }).bindTooltip(label, { direction: "top", offset: [0, -36] })
        .on("click", () => {
          const current = chat.rooms.find(item => item.id === room.id);
          if (current) void chat.selectRoom(current);
        }).addTo(clusters);
      markers.set(room.id, marker);
    }
    marker.options.title = "Open " + room.title;
    const label = document.createElement("span"); label.textContent = room.title;
    marker.setTooltipContent(label).setIcon(icon).setZIndexOffset(room.id === chat.selectedRoomId ? 1000 : 0);
  }
}

function addAtCenter() {
  const point = map?.getCenter().wrap();
  if (point) chat.requestRoom(point.lng, point.lat);
}

function focusSelectedRoom(panel?: DOMRect, roomId = chat.selectedRoomId) {
  const room = chat.rooms.find(room => room.id === roomId), currentMap = map;
  if (!room || !currentMap || !clusters) return;
  const marker = markers.get(room.id);
  if (!marker) return;
  const size = currentMap.getSize(), bounds = currentMap.getContainer().getBoundingClientRect();
  let target = size.divideBy(2);
  if (panel) {
    const left = Math.max(0, panel.left - bounds.left - 24);
    const right = Math.min(size.x, panel.right - bounds.left + 24);
    const top = Math.max(0, panel.top - bounds.top - 24);
    const bottom = Math.min(size.y, panel.bottom - bounds.top + 24);
    if (target.x > left && target.x < right && target.y > top && target.y < bottom + 44) {
      const spaces = [
        { area: left * size.y, point: L.point(left / 2, size.y / 2) },
        { area: (size.x - right) * size.y, point: L.point((right + size.x) / 2, size.y / 2) },
        { area: top * size.x, point: L.point(size.x / 2, top / 2) },
        { area: (size.y - bottom) * size.x, point: L.point(size.x / 2, (bottom + size.y) / 2) },
      ];
      target = spaces.sort((a, b) => b.area - a.area)[0]!.point;
    }
  }
  const zoom = Math.min(currentMap.getMaxZoom(), Math.max(currentMap.getZoom(), 16));
  const location = L.latLng(room.location.coordinates[1], room.location.coordinates[0]);
  const center = currentMap.unproject(currentMap.project(location, zoom).subtract(target).add(size.divideBy(2)), zoom);
  currentMap.setView(center, zoom, { animate: false });
  const parent = clusters.getVisibleParent(marker);
  if (parent instanceof L.MarkerCluster) parent.spiderfy();
  marker.openTooltip();
}
defineExpose({ focusSelectedRoom });

onMounted(() => {
  if (!container.value) return;
  map = L.map(container.value, {
    zoomControl: false, minZoom: 2, maxZoom: 18, doubleClickZoom: false, worldCopyJump: true,
  }).setView([48, 15], 4);
  L.control.zoom({ position: "topleft" }).addTo(map);
  clusters = L.markerClusterGroup({
    animate: false,
    maxClusterRadius: 52,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    spiderfyDistanceMultiplier: 1.5,

    iconCreateFunction: cluster => {
      const count = cluster.getChildCount();
      return L.divIcon({
        className: "room-cluster",
        html: '<span aria-label="' + count + ' chatrooms. Zoom in to reveal pins.">' + count + '</span>',
        iconSize: [44, 44], iconAnchor: [22, 22],
      });
    },
  }).addTo(map);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  tiles.on("tileerror", () => { tileError.value = true; });
  tiles.on("tileload", () => { tileError.value = false; });
  map.on("click", (event: L.LeafletMouseEvent) => {
    if (event.originalEvent.detail > 1) return;
    const point = event.latlng.wrap(); chat.requestRoom(point.lng, point.lat);
  });
  map.on("moveend", () => { void publishBoundsLater(); });
  syncMarkers(); publishBounds();
});
watch(() => [chat.rooms, chat.selectedRoomId], syncMarkers, { deep: true });
watch(() => chat.ready, value => { if (value) publishBounds(); });
// Window activation (including closing or minimizing chats) must not move the map.
// Recenter only through the explicit header double-click action above.
onUnmounted(() => {
  publishBoundsLater.cancel();
  map?.remove(); map = undefined;
});
</script>


<style scoped>
.map-panel { position: absolute; inset: 0; isolation: isolate; background: #e8ece6; }
.map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }
.map-panel :deep(.leaflet-container) { font-family: inherit; }
.map-notice button { border: 0; padding: 2px 4px; background: transparent; font: inherit; text-decoration: underline; }
.map-notice { position: absolute; bottom: 30px; left: 10px; z-index: 600; max-width: min(420px, calc(100% - 20px)); padding: 10px 12px; border-radius: 12px; background: #fff6db; box-shadow: 0 3px 12px #1e293b18; font-size: 12px; }
.map-panel :deep(.room-marker) { background: none; border: none; }
.map-panel :deep(.room-cluster) { display: grid; place-items: center; border: 5px solid #6b858b38; border-radius: 50%; background: #e3efed; background-clip: padding-box; color: #29474c; box-shadow: 0 2px 5px #0002; font-size: 14px; font-weight: 700; }
.map-panel :deep(.room-cluster:hover) { background-color: #cddfdb; }
.map-panel :deep(.room-cluster:focus-visible) { outline: 2px solid #29474c; outline-offset: 3px; }
.map-panel :deep(.pin-shape) {
  display: grid; place-items: center; width: 34px; height: 34px; border: 2px solid var(--room-border);
  border-radius: 50% 50% 50% 0; background: var(--room-pin); transform: rotate(-45deg); box-shadow: 0 2px 4px #0003;
}
.map-panel :deep(.pin-shape span) { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--room-border); background: #fff; }
.map-panel :deep(.room-marker.selected .pin-shape) { box-shadow: 0 0 0 5px var(--room-halo), 0 2px 4px #0003; }
.map-canvas { font-family: inherit; }
.map-canvas:focus-visible { outline: 2px solid #237abb; outline-offset: 3px; }
</style>
