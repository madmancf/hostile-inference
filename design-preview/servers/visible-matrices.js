// A parked continent/pooled actor has no render, shadow or reflection consumers.
// Keep its previous world matrices and update the complete subtree on re-entry.
// Active geometry, bones and animation retain Three's ordinary update method.
export function parkHiddenMatrices(root) {
  const update = root.updateMatrixWorld;
  root.updateMatrixWorld = function(force) {
    if (!this.visible) return;
    return update.call(this, force);
  };
  return root;
}
