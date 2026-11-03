import { Clock, Lock } from './Icon'
import './PrivateDisclaimer.css'

// "Only you can see this conversation" strip. Used in private message bubbles
// (MessageRow) and above the agents-rail chat thread (AgentsRail).
export default function PrivateDisclaimer({ text = 'Only you can see this conversation', expirationLabel }) {
  return (
    <div className="private-disclaimer">
      <Lock size={12} />
      <span>{text}</span>
      {expirationLabel && (
        <span className="private-disclaimer-expiry" role="img" tabIndex={0} title={expirationLabel} aria-label={expirationLabel}>
          <Clock size={12} />
        </span>
      )}
    </div>
  )
}
