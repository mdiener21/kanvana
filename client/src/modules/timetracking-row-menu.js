// Where a touch row's ⋯ menu opens. All values are viewport pixels; `visibleBottom` is the lowest
// point the menu may reach (on phones, the top edge of the pinned tab bar).
// Opens upward only when opening downward would run past `visibleBottom` and the room above the
// anchor's top edge holds the whole menu; otherwise it opens downward.
export function rowMenuOpensUp({ anchorTop, anchorBottom, menuHeight, visibleBottom }) {
  const fitsBelow = anchorBottom + menuHeight <= visibleBottom;
  const fitsAbove = anchorTop - menuHeight >= 0;
  return !fitsBelow && fitsAbove;
}
