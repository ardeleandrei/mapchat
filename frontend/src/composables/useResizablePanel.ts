import { computed, ref, type CSSProperties, type Ref } from "vue";
import { useDraggable, useResizeObserver } from "@vueuse/core";

export function useResizablePanel(
  panel: Ref<HTMLElement | null>,
  anchor: () => void,
  move: (left: number, top: number, width: number, height: number) => void,
) {
  const handle = ref<HTMLElement | null>(null);
  const size = ref<{ width: number; height: number } | null>(null);
  let start = { x: 0, y: 0, right: 0, top: 0, width: 0, height: 0 };
  const { isDragging: resizing } = useDraggable(handle, {
    preventDefault: true,
    onStart: (_position, event) => {
      const node = panel.value;
      if (!node || !event.isPrimary) return false;
      // Capture the opposite corner so dragging the left edge keeps the right edge fixed.
      anchor();
      start = {
        x: event.clientX, y: event.clientY, right: node.offsetLeft + node.offsetWidth,
        top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight,
      };
      handle.value?.setPointerCapture(event.pointerId);
    },

    onMove: (_position, event) => fit(
      start.width - event.clientX + start.x, start.height + event.clientY - start.y, start.right, start.top,
    ),

    onEnd: (_position, event) => {
      if (handle.value?.hasPointerCapture(event.pointerId)) handle.value.releasePointerCapture(event.pointerId);
    },
  });

  function fit(width: number, height: number, fixedRight?: number, fixedTop?: number) {
    const node = panel.value, parent = node?.parentElement;
    if (!node || !parent || !parent.clientWidth || !parent.clientHeight || !node.offsetWidth || !node.offsetHeight) return;
    // Account for the drag helper reclamping position after a viewport resize.
    const right = Math.max(9, Math.min(fixedRight ?? node.offsetLeft + node.offsetWidth, parent.clientWidth - 8));
    const top = Math.max(8, Math.min(fixedTop ?? node.offsetTop, parent.clientHeight - node.offsetHeight - 8));
    const maxWidth = Math.max(1, right - 8);
    const maxHeight = Math.max(1, parent.clientHeight - top - 8);
    const minWidth = Math.max(1, Math.min(280, parent.clientWidth - 72, maxWidth));
    const next = {
      width: Math.min(maxWidth, Math.max(minWidth, width)),
      height: Math.min(maxHeight, Math.max(Math.min(260, maxHeight), height)),
    };
    if (next.width !== size.value?.width || next.height !== size.value?.height) size.value = next;
    move(right - next.width, top, next.width, next.height);
  }

  function keyResize(event: KeyboardEvent) {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = delta[event.key], node = panel.value;
    if (!direction || !node) return;
    event.preventDefault(); event.stopPropagation();
    anchor();
    const step = event.shiftKey ? 30 : 10;
    fit(node.offsetWidth - direction[0] * step, node.offsetHeight + direction[1] * step);
  }

  useResizeObserver(() => [panel.value, panel.value?.parentElement], () => {
    if (size.value) fit(size.value.width, size.value.height);
  });
  const style = computed<CSSProperties>(() => size.value ? {
    width: size.value.width + "px", height: size.value.height + "px",
    maxWidth: "calc(100% - 16px)", maxHeight: "calc(100% - 16px)",
  } : {});
  return { handle, resizing, style, keyResize };
}
