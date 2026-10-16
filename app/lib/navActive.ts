// Which app nav item is lit for a given route. Shared by the desktop rail and
// the phone tab bar so the two can never disagree about where you are.
//
// startsWith so a tool page keeps "Make" lit. Library has no child routes any
// more (a folder is ?folder= on /folders), but the prefix match costs nothing
// and is right if one is ever added. Exact match on /dashboard, which is a
// prefix of nothing but would otherwise stay lit on every route if it were.
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
