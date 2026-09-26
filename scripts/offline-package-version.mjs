export function offlinePackageVersion(packageVersion, releaseTag) {
  if (!releaseTag) return packageVersion;
  if (!releaseTag.startsWith('v')) return packageVersion;

  const version = releaseTag.slice(1);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(\`Invalid release tag version: \${releaseTag}\`);
  }
  return version;
}
