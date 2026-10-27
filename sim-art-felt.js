// SPDX-License-Identifier: GPL-3.0-or-later. Part of the QuadMath simulator; see SIM-NOTICE.txt.
// Felt Scale — QuadMath studio material / lighting lock.
// Visual only. Palettes stay per-map. Night maps keep their hour.
// Living Room (Clay Parlor) is the reference implementation.
// Nothing here is copied from the GPL whoop sim. No new colliders.

export const FELT_SCALE = Object.freeze({
  id: 'felt-scale',
  name: 'Felt Scale',
  referenceMap: 'living',
  metalnessMax: 0.05,
  roughnessMin: 0.92,
  envMax: 0.28,
  sunMaxDay: 0.55,
  bloomOnLow: false,
  aoOnLow: false,
  extraPassesOnLow: false,
  pixelRatioCapPhone: 1,
  shadowMapSizePhone: 512,
});

export function applyFeltMaterial(mat, opts) {
  if (!mat) return mat;
  const o = opts || {};
  const roughMin = o.roughnessMin != null ? o.roughnessMin : FELT_SCALE.roughnessMin;
  if (mat.metalness != null) mat.metalness = Math.min(Number(mat.metalness) || 0, FELT_SCALE.metalnessMax);
  if (mat.roughness != null) mat.roughness = Math.max(Number(mat.roughness) || 0, roughMin);
  if (mat.envMapIntensity != null) {
    const cap = o.envMax != null ? o.envMax : FELT_SCALE.envMax;
    mat.envMapIntensity = Math.min(Number(mat.envMapIntensity) || 0, cap);
  }
  if (!mat.userData) mat.userData = {};
  mat.userData.looksSkip = true;
  mat.userData.artLocked = true;
  mat.userData.feltLocked = true;
  return mat;
}

export function feltBasic(THREE, hex, extras) {
  const m = new THREE.MeshBasicMaterial(Object.assign({
    color: hex,
    toneMapped: false,
    fog: true,
  }, extras || {}));
  return applyFeltMaterial(m);
}

export function feltClay(THREE, hex, extras) {
  return feltBasic(THREE, hex, extras);
}

export function feltEmissive(THREE, hex, extras) {
  return feltBasic(THREE, hex, Object.assign({
    toneMapped: false,
  }, extras || {}));
}

export function studioPhoneBudget(applied, vibe) {
  const low = applied === 'low';
  const vibeBloom = !(vibe && vibe.post && vibe.post.bloom === false);
  return Object.freeze({
    bloom: !low && vibeBloom,
    ao: !low,
    extraPasses: !low,
    pixelRatioCap: FELT_SCALE.pixelRatioCapPhone,
    shadowMapSize: FELT_SCALE.shadowMapSizePhone,
  });
}

export function qualityWantsStudioBloom(applied, vibe) {
  return !!studioPhoneBudget(applied, vibe).bloom;
}
