/* Scroll reveal for index, bench, gear and tune-database.

   No library and no scroll listener: a single IntersectionObserver, and each
   element is unobserved the moment it has been shown, so nothing re-hides when
   you scroll back up and no work happens after the last reveal.

   sim.html deliberately does not load this file — that page has a Three.js
   frame budget to protect. Nothing here targets an affiliate CTA: those live
   inside gear.html's #ryfly section, which carries no .reveal class, so they
   are painted at full opacity from first paint and never animate.

   The first section on each page carries no .reveal either — it is above the
   fold, so the observer would fire on it immediately and the only thing the
   class achieved was to hold the LCP paint until this deferred file had run.
   That leaves gear.html with no .reveal elements at all; it still loads this
   file, which now no-ops and clears the flag. */
(function () {
  'use strict';

  // The hidden state lives behind `.js-motion`, which the inline <head> script
  // only sets when IntersectionObserver exists. Nothing else can lift that
  // state, so every path out of this file that skips the observer has to drop
  // the class first — otherwise the page is left blank. The case this file
  // cannot cover is never running at all (404, offline, blocked); that one is
  // handled by the `onerror` on the <script> tag in each page.
  //
  // If we somehow get here without the observer, drop the class.
  if (!('IntersectionObserver' in window)) {
    document.documentElement.classList.remove('js-motion');
    return;
  }

  // The stylesheet already gates the reveal on prefers-reduced-motion. This is
  // the belt to that braces: with the class gone, the hidden state cannot apply
  // even if the media query is ever loosened.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.remove('js-motion');
    return;
  }

  // Nothing to reveal (gear.html, after the above-the-fold section lost its
  // .reveal). Drop the flag rather than leave a hiding class on <html> with no
  // observer left to lift it.
  var targets = document.querySelectorAll('.reveal');
  if (!targets.length) {
    document.documentElement.classList.remove('js-motion');
    return;
  }

  var everFired = false;

  // Everything that could throw is inside the try. There is no recovering from
  // a half-set-up observer, and a thrown error here would leave every .reveal
  // section at opacity 0 for good, so the catch drops the flag and lets the
  // page paint unanimated.
  try {
    var io = new IntersectionObserver(function (entries) {
      everFired = true;
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        entries[i].target.classList.add('is-visible');
        io.unobserve(entries[i].target);
      }
    }, {
      threshold: 0.05,
      // Start the reveal a little before the element is fully in view, so it
      // has finished by the time it is properly on screen.
      rootMargin: '0px 0px -8% 0px'
    });

    for (var i = 0; i < targets.length; i++) io.observe(targets[i]);

    // Failsafe. An observer always delivers one initial callback per observed
    // element, so if nothing has arrived at all by now the observer is not
    // running — a throttled background tab, a non-compositing embedded view,
    // or some future engine quirk. Hiding content behind a callback that never
    // comes is far worse than showing it unanimated, so drop the flag and let
    // everything paint. Checking `everFired` rather than a per-element state
    // means legitimately-below-the-fold sections are left alone.
    window.setTimeout(function () {
      if (everFired) return;
      io.disconnect();
      document.documentElement.classList.remove('js-motion');
    }, 1500);
  } catch (e) {
    document.documentElement.classList.remove('js-motion');
  }
})();
