// Fades out the opening screen defined in index.html.
export function hideSplash() {
  const el = document.getElementById("splash");
  if (!el) return;
  const shownFor = Date.now() - (window.__splashStart || 0);
  setTimeout(() => {
    el.classList.add("splash-hide");
    setTimeout(() => el.remove(), 1200);
  }, Math.max(0, 2200 - shownFor));
}
