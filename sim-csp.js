// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// The page's Content-Security-Policy is the <meta http-equiv> at the top of
// sim.html. Whatever it blocks is a warning in the console, so a break on the
// live site shows in DevTools: the directive, and what was blocked ("inline"
// and "eval" for code, else the URL). Loaded right after the policy, before
// anything the policy could block. It hears the page's document only: a
// worker's violations, or a blank iframe's, are in the console as the
// browser's own CSP errors, not here.
document.addEventListener('securitypolicyviolation', function (e) {
  console.warn('[CSP] ' + e.effectiveDirective + ' blocked ' + (e.blockedURI || '(no URI)') +
    (e.sourceFile ? ' at ' + e.sourceFile + ':' + e.lineNumber : ''));
});
