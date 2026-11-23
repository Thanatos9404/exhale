// Applies the saved theme before first paint so there is no flash. Kept external for a strict CSP.
(function () {
  try {
    var pref = localStorage.getItem('exhale.theme') || 'dark';
    var dark =
      pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
