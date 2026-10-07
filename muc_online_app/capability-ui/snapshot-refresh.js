function versionOf(value) {
  const revision = Number(value?.capabilityVersion ?? value?.revision);
  const masterDataVersion = Number(value?.masterDataVersion);
  return Number.isSafeInteger(revision) && revision >= 0 && Number.isSafeInteger(masterDataVersion) && masterDataVersion >= 0
    ? { revision, masterDataVersion } : null;
}

const newer = (a, b) => !!a && (!b || a.revision > b.revision || a.masterDataVersion > b.masterDataVersion);

// One coordinator per active workspace. Events arriving during a request are
// checked against its response, so the initial SSE message joins the first load.
export function createSnapshotRefresh({ load, onSnapshot }) {
  let snapshot = null, wanted = null, inFlight = null, forceAgain = false, disposed = false;
  const abort = new AbortController();
  function refresh(version = null, { force = false } = {}) {
    if (disposed) return Promise.resolve(null);
    const next = versionOf(version);
    if (next) wanted = wanted ? {
      revision: Math.max(wanted.revision, next.revision),
      masterDataVersion: Math.max(wanted.masterDataVersion, next.masterDataVersion)
    } : next;
    if (inFlight) {
      if (force) forceAgain = true;
      return inFlight;
    }
    if (snapshot && !force && !newer(wanted, versionOf(snapshot))) return Promise.resolve(snapshot);
    inFlight = Promise.resolve().then(async () => {
      let attempts = 0;
      do {
        forceAgain = false;
        const previous = versionOf(snapshot);
        const result = await load(abort.signal);
        if (disposed) return null;
        const received = versionOf(result);
        // Do not replace a newer view with an older response.
        if (!previous || (received && received.revision >= previous.revision && received.masterDataVersion >= previous.masterDataVersion)) {
          snapshot = result;
          onSnapshot(result);
        }
        attempts++;
        // A non-advancing server must not create a tight retry loop.
        if (attempts > 1 && !forceAgain && !newer(received, previous)) break;
      } while (forceAgain || newer(wanted, versionOf(snapshot)));
      return snapshot;
    }).finally(() => { inFlight = null; });
    return inFlight;
  }
  return { refresh, dispose() { disposed = true; abort.abort(); } };
}
