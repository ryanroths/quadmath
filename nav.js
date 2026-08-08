/* Mobile nav toggle — shared by every page carrying the site header.
   No framework, no dependencies. Above the 670px breakpoint the panel styles
   in style.css do not apply at all, so this script is inert there apart from
   clearing state on the way back up. */
(function () {
  'use strict';

  var btn = document.getElementById('navToggle');
  var nav = document.getElementById('site-nav');
  if (!btn || !nav) return;

  // Must match the breakpoint in style.css. Kept in one place here so the two
  // can only drift if someone edits both.
  var mq = window.matchMedia('(max-width: 767px)');

  function isOpen() {
    return btn.getAttribute('aria-expanded') === 'true';
  }

  function setOpen(open) {
    nav.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  btn.addEventListener('click', function () {
    setOpen(!isOpen());
  });

  // Close on link click. Most links are same-page anchors, which do not
  // reload, so the panel would otherwise stay open over the target section.
  nav.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    btn.focus(); // Escape should not strand focus inside a hidden panel
  });

  // Tapping the page outside an open panel closes it.
  document.addEventListener('click', function (e) {
    if (!isOpen()) return;
    if (nav.contains(e.target) || btn.contains(e.target)) return;
    setOpen(false);
  });

  // Resizing past the breakpoint with the panel open would otherwise leave
  // aria-expanded="true" on a button that is no longer rendered.
  function syncToBreakpoint() {
    if (!mq.matches) setOpen(false);
  }
  if (mq.addEventListener) mq.addEventListener('change', syncToBreakpoint);
  else if (mq.addListener) mq.addListener(syncToBreakpoint); // Safari < 14
})();
