import { computed, onMounted, ref, type CSSProperties, type Ref } from "vue";
import { useDraggable, useResizeObserver } from "@vueuse/core";

export function useDraggablePanel(panel: Ref<HTMLElement | null>, slot = 0) {
  const handle = ref<HTMLElement | null>(null);
  const positioned = ref(false);
  const parent = computed(() => panel.value?.parentElement);
  const { position, isDragging: dragging } = useDraggable(panel, {
    handle,
    containerElement: parent,
    preventDefault: true,
    onStart: (_position, event) => {
      if (!event.isPrimary || (event.target as HTMLElement).closest("button")) return false;
      handle.value?.setPointerCapture(event.pointerId);
    },

    onMove: ({ x, y }) => move(x, y),

    onEnd: (_position, event) => {
      if (handle.value?.hasPointerCapture(event.pointerId)) handle.value.releasePointerCapture(event.pointerId);
    },
  });

  function move(x: number, y: number, width?: number, height?: number) {
    const node = panel.value, parent = node?.parentElement;
    if (!node || !parent || !parent.clientWidth || !parent.clientHeight) return;
    position.value = {
      x: Math.max(8, Math.min(x, parent.clientWidth - (width ?? node.offsetWidth) - 8)),
      y: Math.max(8, Math.min(y, parent.clientHeight - (height ?? node.offsetHeight) - 8)),
    };
    positioned.value = true;
  }

  function anchor() {
    const node = panel.value;
    if (node) move(node.offsetLeft, node.offsetTop);
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
  });

  useResizeObserver(() => [panel.value, parent.value], () => {
    if (positioned.value) move(position.value.x, position.value.y);
  });
  const style = computed<CSSProperties>(() => positioned.value
    ? { left: position.value.x + "px", top: position.value.y + "px", right: "auto" } : {});
  return { handle, style, dragging, anchor, move, keyMove };
}
