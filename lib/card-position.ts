// Convert client coordinates into the actual overlay coordinate system. Mobile
// Safari can offset fixed layers while its keyboard/browser chrome is closing.
export function positionCard(
  el: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
  angle = 0,
) {
  const layer = el.parentElement;
  const rect = layer?.getBoundingClientRect();
  const scale = layer?.offsetWidth && rect ? rect.width / layer.offsetWidth : 1;
  const baseWidth = parseFloat(el.style.width) || el.offsetWidth || width;
  const baseHeight = parseFloat(el.style.height) || el.offsetHeight || height;
  const x = (left - (rect?.left || 0)) / scale;
  const y = (top - (rect?.top || 0)) / scale;
  el.style.visibility = 'visible';
  el.style.transform = `translate3d(${x}px,${y}px,0) rotate(${angle}deg) scale(${width / (baseWidth * scale)},${height / (baseHeight * scale)})`;
}
