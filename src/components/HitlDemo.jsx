import { copilotAgent, hitlScenario } from '../data'
import { Avatar, CheckCircle, Close, IconButton, Lock } from './common'
import './HitlDemo.css'

export function HitlDemoBar({ phase, onDraft, onReset, onShowActivity, onShowMentions }) {
  const completed = ['shared', 'rejected', 'deleted', 'expired'].includes(phase)
  const labels = {
    idle: 'Get a private draft from Copilot before sharing with the group.',
    drafting: 'Copilot is drafting your launch update. You can leave this chat while it works.',
    review: 'Your draft is private. Nothing is shared until you approve it.',
    shared: 'Approved response shared with the group. Copilot withdrew the private review card.',
    rejected: 'Draft rejected. Copilot sent you a private confirmation; nothing was shared with the group.',
    deleted: 'Private review deleted permanently. Nothing was shared with the group.',
    expired: 'The private review has expired. Nothing was shared with the group.',
  }
  return (
    <div className={`hitl-demo-bar${phase === 'shared' ? ' hitl-demo-bar-complete' : ''}`}>
      {phase === 'shared' ? <CheckCircle size={18} /> : <Lock size={14} />}
      <span className="hitl-demo-bar-copy" role="status">{labels[phase]}</span>
      <div className="hitl-demo-bar-actions">
        {phase === 'idle' && <button type="button" onClick={onDraft}>Draft with Copilot</button>}
        {phase === 'review' && (
          <>
            <button type="button" onClick={onShowActivity}>Activity</button>
            <button type="button" onClick={onShowMentions}>Mentions</button>
          </>
        )}
        {completed && <button type="button" onClick={onReset}>Restart demo</button>}
      </div>
    </div>
  )
}

export function DesktopToast({ onOpen, onDismiss }) {
  return (
    <aside className="desktop-toast" aria-label="Desktop notification">
      <div className="desktop-toast-header">
        <span className="desktop-toast-app">Microsoft Teams</span>
        <span className="desktop-toast-time">Now</span>
        <IconButton label="Dismiss desktop notification" onClick={onDismiss}>
          <Close size={14} />
        </IconButton>
      </div>
      <button type="button" className="desktop-toast-body" onClick={onOpen}>
        <Avatar contact={copilotAgent} size={36} />
        <span className="desktop-toast-content">
          <strong>Copilot mentioned you</strong>
          <span className="desktop-toast-location">Northwind launch</span>
          <span>{hitlScenario.preview}</span>
          <span className="desktop-toast-link">Review private draft</span>
        </span>
      </button>
      <span className="desktop-toast-announcement" role="status">
        Copilot mentioned you in Northwind launch. Your private draft is ready to review.
      </span>
    </aside>
  )
}
