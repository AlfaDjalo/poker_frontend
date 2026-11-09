import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

// Mouse: drag after 4px. Touch: press-and-hold 180ms (moving >6px before
// that cancels the drag so the browser scrolls instead).
export function useDndSensors() {
    return useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
    );
}