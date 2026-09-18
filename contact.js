// Formspree submit for the hire.html inquiry form.
//
// Its own file rather than a script.js tag: script.js builds its `els` map
// with unguarded getElementById calls and binds pitchKV/pitchCells/pitchFrame
// at script.js:1540, none of which exist on hire.html, so it throws before
// reaching the contact block. And not inline, because
// agent_policy.json html_checks.forbid_inline_script bans inline scripts
// outside the pinned-hash allowlist, which is the right default.
// Formspree submit, kept inline on purpose. script.js builds its `els` map with
// unguarded getElementById calls and binds pitchKV/pitchCells/pitchFrame at
// script.js:1540 -- none of which exist here -- so loading it on this page throws
// before the contact handler is ever reached.
(function () {
  var form = document.getElementById('contactForm');
  if (!form) return;
  var email = document.getElementById('contactEmail');
  var replyTo = document.getElementById('replyToField');
  email.addEventListener('input', function () { replyTo.value = this.value; });
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = document.getElementById('contactSubmit');
    var errEl = document.getElementById('contactError');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    errEl.style.display = 'none';
    try {
      var res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('non-ok');
      form.style.display = 'none';
      document.getElementById('contactSuccess').style.display = 'block';
    } catch (_) {
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Send Inquiry';
    }
  });
})();
