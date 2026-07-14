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
