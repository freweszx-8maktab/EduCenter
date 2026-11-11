/* Runs before first paint (classic script in <head>) so the page never flashes the wrong theme. */
(function () {
  var root = document.documentElement;
  var dark = false;
  try {
    var p = localStorage.getItem('educenter.theme') || 'light';
    dark = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (e) { /* storage blocked: stay light */ }
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
