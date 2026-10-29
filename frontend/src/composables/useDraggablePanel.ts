import { computed, onMounted, onUnmounted, ref, type CSSProperties, type Ref } from "vue";

export function useDraggablePanel(panel: Ref<HTMLElement | null>, slot = 0) {
  const position = ref<{ x: number; y: number } | null>(null);
  const dragging = ref(false);
  let grab: { id: number; x: number; y: number } | null = null;
  let observer: ResizeObserver | undefined;

  function move(x: number, y: number) {
    const node = panel.value, parent = node?.parentElement;
    if (!node || !parent) return;
    position.value = {
      x: Math.max(8, Math.min(x, parent.clientWidth - node.offsetWidth - 8)),
      y: Math.max(8, Math.min(y, parent.clientHeight - node.offsetHeight - 8)),
    };
  }

  function pointerDown(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary || (event.target as HTMLElement).closest("button")) return;
    const node = panel.value;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    grab = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging.value = true;
    event.preventDefault();
  }

  function pointerMove(event: PointerEvent) {
    if (!grab || grab.id !== event.pointerId) return;
    const parent = panel.value?.parentElement?.getBoundingClientRect();
    if (parent) move(event.clientX - parent.left - grab.x, event.clientY - parent.top - grab.y);
  }

  function pointerEnd(event: PointerEvent) {
    if (grab?.id !== event.pointerId) return;
    grab = null; dragging.value = false;
  }

  function keyMove(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    const direction: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const delta = direction[event.key], node = panel.value;
    if (!delta || !node) return;
    event.preventDefault();
    const step = event.shiftKey ? 30 : 10;
    move(node.offsetLeft + delta[0] * step, node.offsetTop + delta[1] * step);
  }
  onMounted(() => {
    const node = panel.value;
    if (node?.parentElement && slot > 0) {
      const columns = Math.max(1, Math.floor((node.parentElement.clientWidth - 40) / (node.offsetWidth + 16)));
      const column = slot % columns, row = Math.floor(slot / columns) % 6;
      move(node.offsetLeft - column * (node.offsetWidth + 16) - row * 20, node.offsetTop + row * 36);
    }
    observer = new ResizeObserver(() => { if (position.value) move(position.value.x, position.value.y); });
    if (panel.value) {
      observer.observe(panel.value);
      if (panel.value.parentElement) observer.observe(panel.value.parentElement);
    }
  });
  onUnmounted(() => observer?.disconnect());
  const style = computed<CSSProperties>(() => position.value
    ? { left: position.value.x + "px", top: position.value.y + "px", right: "auto" } : {});
  return { style, dragging, pointerDown, pointerMove, pointerEnd, keyMove };
}
