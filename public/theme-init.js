/** Applies the saved theme before first paint, so there is no flash. External for the strict CSP. */
(function (d) {
  var t = 'dark';
  try {
    t = localStorage.getItem('exhale.theme') || t;
    if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? t : 'light';
  } catch (e) {}
  d.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
})(document.documentElement);
