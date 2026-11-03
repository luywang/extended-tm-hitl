import { useState } from 'react'
import { Clock, Lock } from './Icon'
import IconButton from './IconButton'
import './PrivateDisclaimer.css'

// "Only you can see this conversation" strip. Used in private message bubbles
// (MessageRow) and above the agents-rail chat thread (AgentsRail).
export default function PrivateDisclaimer({ text = 'Only you can see this conversation', expirationLabel, expiresSoon = false }) {
  const [showExpiration, setShowExpiration] = useState(false)
  return (
    <div className="private-disclaimer">
      <Lock size={12} />
      <span>{text}</span>
      {expirationLabel && (
        <span className="private-disclaimer-expiry">
          <IconButton
            className={expiresSoon ? 'private-disclaimer-expiring' : undefined}
            label={expirationLabel}
            title={expirationLabel}
            aria-expanded={showExpiration}
            onClick={() => setShowExpiration(show => !show)}
            onBlur={() => setShowExpiration(false)}
            onKeyDown={event => { if (event.key === 'Escape') setShowExpiration(false) }}
          >
            <Clock size={12} />
          </IconButton>
          {showExpiration && <span className="private-disclaimer-date" role="status">{expirationLabel}</span>}
        </span>
      )}
    </div>
  )
}
