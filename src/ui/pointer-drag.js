export const POINTER_DRAG_THRESHOLD_PX = Object.freeze({
  mouse: 6,
  pen: 8,
  touch: 10,
});

export function pointerDragThreshold(pointerType = "mouse") {
  return POINTER_DRAG_THRESHOLD_PX[pointerType] ?? POINTER_DRAG_THRESHOLD_PX.mouse;
}

export function exceedsPointerDragThreshold(pointerType, deltaX, deltaY) {
  const threshold = pointerDragThreshold(pointerType);
  return deltaX * deltaX + deltaY * deltaY > threshold * threshold;
}

export function isPointerDragCancellation(eventType) {
  return eventType === "pointercancel" || eventType === "lostpointercapture";
}

export function selectionAfterPointerGesture(previousIndex, handIndex, options = {}) {
  if (options.canceled) return previousIndex;
  if (options.moved) return handIndex;
  return previousIndex === handIndex ? null : handIndex;
}

export function canStartPointerCarry(pointerType, hasFineHover) {
  return pointerType === "mouse" && hasFineHover === true;
}

export function dragGhostPosition(clientX, clientY, offsetX, offsetY) {
  return {
    x: Math.round(clientX - offsetX),
    y: Math.round(clientY - offsetY),
  };
}

export function handCardPointerEffect(clientX, clientY, bounds, maxTilt = 8) {
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return { shineX: 50, shineY: 50, tiltX: 0, tiltY: 0 };
  }

  const left = Number(bounds?.left) || 0;
  const top = Number(bounds?.top) || 0;
  const x = Math.min(1, Math.max(0, (clientX - left) / width));
  const y = Math.min(1, Math.max(0, (clientY - top) / height));
  return {
    shineX: Math.round(x * 100),
    shineY: Math.round(y * 100),
    tiltX: Number(((0.5 - y) * maxTilt * 2).toFixed(2)),
    tiltY: Number(((x - 0.5) * maxTilt * 2).toFixed(2)),
  };
}
