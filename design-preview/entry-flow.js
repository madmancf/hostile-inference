// Navigation intent only. Account membership remains server-authoritative.
export const FACTIONS = ['misanthropic', 'closed', 'broke'];
export const validFaction = value => FACTIONS.includes(value) ? value : null;
export function entryIntent(search = location.search) {
  const p = new URLSearchParams(search);
  return {faction: validFaction(p.get('faction')), rival: validFaction(p.get('rival'))};
}
export function accountURL(faction, mode = 'signup') {
  const p = new URLSearchParams({faction: validFaction(faction) || 'misanthropic'});
  if (mode === 'login' || mode === 'recover') p.set('mode', mode);
  return '/account/index.html?' + p;
}
export function playURL(faction, mode = 'practice', rival) {
  const p = new URLSearchParams({faction: validFaction(faction) || 'misanthropic'});
  if (mode === 'learn') p.set('tutorial', '1');
  else if (mode === 'ranked') p.set('verified', '1');
  if (validFaction(rival) && rival !== faction) p.set('rival', rival);
  return '/demo/index.html?' + p;
}
