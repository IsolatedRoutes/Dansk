// Fades out the opening screen defined in index.html.
export function hideSplash() {
  const el = document.getElementById("splash");
  if (!el) return;
  const shownFor = Date.now() - (window.__splashStart || 0);
  setTimeout(() => {
    el.classList.add("splash-hide");
    setTimeout(() => el.remove(), 1000);
  }, Math.max(0, 1600 - shownFor));
}
