// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Pilot names on the online boards: what a name may be, the key a name is
// claimed under (so look-alikes are one name), and the names refused.
// The leaderboard Worker bundles this file; it has no imports.
//
// A name: 3 to 16 characters, ASCII letters and digits with single spaces,
// dots, dashes or underscores between them, and at least one letter. Spaces
// are trimmed and runs of them made one. Anything else is refused, not
// rewritten, so a pilot sees the name the boards will show.
//
// Its key: lower case, the separators dropped, and the look-alike letters and
// digits made one (0 o, 1 i l, 3 e, 4 a, 5 s, 7 t, v u). "RyFly", "ry_fly",
// "RYFLY", "Ry Fly", "RyFIy" (a capital i) and "RyF1y" are one key, held by
// the first pilot token to post under it.
//
// Refused: the reserved names (the default PILOT, the pace bot's, the site's),
// and a key holding a blocked word (NAME_BLOCK_ROOTS, matched on the key, so
// spelling it with look-alikes or separators does not get it past), or equal
// to a blocked short word (NAME_BLOCK_EXACT: inside longer names these are
// common in real ones). The Worker also refuses a key holding any word in
// D1's blocked_names table (DEPLOY.md: one command adds one).

export const PILOT_NAME_MIN = 3;
export const PILOT_NAME_MAX = 16;

const NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|[ ._-](?=[A-Za-z0-9]))*$/;
const LOOK_ALIKE = { 0: 'o', 1: 'l', i: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', v: 'u' };

// The name as the boards show it: trimmed, inner spaces made one.
export function pilotDisplayName(raw) {
  return String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
}

// The key a name is claimed and matched under.
export function pilotNameKey(raw) {
  return pilotDisplayName(raw).toLowerCase().replace(/[ ._-]/g, '').replace(/[01i3457v]/g, (c) => LOOK_ALIKE[c]);
}

const keys = (list) => Object.freeze(list.map(pilotNameKey));

export const NAME_RESERVED = keys([
  'pilot', 'pace', 'pace bot', 'autopilot', 'quadmath', 'admin', 'moderator', 'official', 'system',
]);
// Roots refused anywhere in a key. Kept to words that are not inside common
// names or words once look-alikes are folded (no "ass", "cock", "rape",
// "heil", "nazi", "rapist": Bass, Hancock, Grape, Shelly, Nazir, therapist).
export const NAME_BLOCK_ROOTS = keys([
  'fuck', 'shit', 'cunt', 'bitch', 'nigg', 'faggot', 'fagot', 'whore', 'slut',
  'hitler', 'kike', 'chink', 'gook', 'wetback', 'beaner', 'retard', 'tranny',
  'penis', 'vagina', 'pussy', 'porn', 'wanker', 'twat', 'jizz', 'molest', 'pedophile', 'paedo', 'kkk',
  'cocksuck', 'dickhead', 'motherf', 'asshole', 'arsehole', 'blowjob', 'handjob', 'cumshot', 'dildo',
]);
// Short words refused only as the whole key.
export const NAME_BLOCK_EXACT = keys([
  'ass', 'arse', 'cum', 'dick', 'cock', 'fag', 'rape', 'spic', 'pedo', 'tit', 'tits', 'sex', 'anal', 'piss',
]);

// Why a name can't go on a board, or null.
//   'SET A NAME'        none, or the default PILOT
//   'BAD NAME'          length or characters
//   'NAME NOT ALLOWED'  reserved or blocked
export function pilotNameProblem(raw) {
  const name = pilotDisplayName(raw);
  if (!name) return 'SET A NAME';
  const key = pilotNameKey(name);
  if (key === pilotNameKey('pilot')) return 'SET A NAME';
  if (name.length < PILOT_NAME_MIN || name.length > PILOT_NAME_MAX) return 'BAD NAME';
  if (!NAME_RE.test(name) || !/[A-Za-z]/.test(name)) return 'BAD NAME';
  if (NAME_RESERVED.includes(key)) return 'NAME NOT ALLOWED';
  if (NAME_BLOCK_EXACT.includes(key)) return 'NAME NOT ALLOWED';
  if (NAME_BLOCK_ROOTS.some((w) => key.includes(w))) return 'NAME NOT ALLOWED';
  return null;
}
