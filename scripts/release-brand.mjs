// Historical asset names remain immutable. Releases from 4.10.3 use the to-agy brand.
export function desktopBrand(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a release version');
  const [major, minor, patch] = version.split('.').map(Number);
  if (major < 4 || (major === 4 && minor < 9)) {
    return { prefix: 'Antigravity-Tools-Lite', app: 'Antigravity Tools Lite', executable: 'antigravity-tools' };
  }
  if (major === 4 && (minor === 9 || (minor === 10 && patch <= 2))) {
    return { prefix: 'agy-switch', app: minor > 9 || patch >= 1 ? 'AntiGravity Switch' : 'agy-switch', executable: 'agy-switch-desktop' };
  }
  return { prefix: 'to-agy', app: 'to-agy', executable: 'agy-switch-desktop' };
}
