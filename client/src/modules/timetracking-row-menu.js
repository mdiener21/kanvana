// `visibleBottom` is the top edge of the pinned tab bar on phones, else the viewport bottom.
export function rowMenuOpensUp({ anchorTop, anchorBottom, menuHeight, visibleBottom }) {
  const fitsBelow = anchorBottom + menuHeight <= visibleBottom;
  const fitsAbove = anchorTop - menuHeight >= 0;
  return !fitsBelow && fitsAbove;
}
