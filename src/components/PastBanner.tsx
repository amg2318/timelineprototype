import { posToTarget } from '../history';
import { useStore } from '../store';

export function PastBanner() {
  const { viewing, versions, pos, branches, currentBranch, pastNotice, fork, setPos } = useStore();
  if (!viewing) return null;
  const { i, k } = posToTarget(versions, pos!);
  const v = versions[i];
  const when = new Date(k > 0 ? v.strokes[k - 1].t1 : v.start).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
  const branch = branches.length > 1 ? `${currentBranch.name} · ` : '';
  return (
    <>
      <div className="past-banner">
        <span className="past-dot" />
        <span>
          Viewing {branch}v{v.n} · stroke {k}/{v.strokes.length} · {when}
        </span>
        <button className="pill" onClick={fork}>
          Fork from here
        </button>
        <button className="pill pill-now" onClick={() => setPos(null, { fromUser: true })}>
          Back to now
        </button>
      </div>
      {pastNotice && (
        <div className="past-notice">
          Past versions are read-only.{' '}
          <button className="pill" onClick={fork}>
            Fork from here
          </button>{' '}
          to draw from this point on a new branch, or go back to now.
        </div>
      )}
    </>
  );
}

export function Toast() {
  const { toastText } = useStore();
  return toastText ? <div className="toast">{toastText}</div> : null;
}
