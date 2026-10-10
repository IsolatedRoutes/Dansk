// Opens a web page. In the iPhone app it opens in Safari, and iOS then shows its
// own small "◀ Broen" arrow at the very top left of the screen, one tap to come
// back. On the website it opens a new tab.
export function openLink(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}
