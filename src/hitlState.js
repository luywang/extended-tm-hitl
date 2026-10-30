export const HITL_STORAGE_KEY = 'teams-extended-tm-demo-v1'
const DAY = 24 * 60 * 60 * 1000

export const initialHitlState = { phase: 'idle' }

export function expireHitl(state, now) {
  if (state.phase === 'review' && now >= state.expiresAt) {
    return { ...state, phase: 'expired', draftText: '', editText: null, unread: false }
  }
  if (state.phase === 'rejected' && now >= state.expiresAt && state.draftText) {
    return { ...state, draftText: '', unread: false }
  }
  if (state.unread && now >= state.notificationExpiresAt) {
    return { ...state, unread: false }
  }
  return state
}

export function restoreHitlState(value, now) {
  try {
    const state = JSON.parse(value)
    if (!state || !['drafting', 'review', 'shared', 'rejected', 'deleted', 'expired'].includes(state.phase)) {
      return initialHitlState
    }
    if (state.phase === 'rejected' &&
        (!Number.isFinite(state.rejectedAt) || !Number.isFinite(state.rejectionExpiresAt))) {
      return initialHitlState
    }
    if (typeof state.id !== 'string' || typeof state.prompt !== 'string' ||
        typeof state.draftText !== 'string' || !Number.isFinite(state.deliveryAt) ||
        !Number.isFinite(state.expiresAt) || !Number.isFinite(state.notificationExpiresAt)) {
      return initialHitlState
    }
    return expireHitl(state, now)
  } catch {
    return initialHitlState
  }
}

export function hitlReducer(previous, action) {
  const state = action.now === undefined ? previous : expireHitl(previous, action.now)
  switch (action.type) {
    case 'request': {
      if (state.phase !== 'idle' || !action.prompt.trim()) return state
      const deliveryAt = action.now + 2400
      return {
        phase: 'drafting',
        id: `extended-tm-${action.now}`,
        prompt: action.prompt.trim(),
        requestedAt: action.now,
        deliveryAt,
        notificationExpiresAt: deliveryAt + 30 * DAY,
        // Demo buffer: notifications expire at day 30, the TM at day 31.
        expiresAt: deliveryAt + 31 * DAY,
        draftText: action.draft,
        editText: null,
        unread: false,
        toastDismissed: false,
      }
    }
    case 'deliver':
      return state.phase === 'drafting' && state.id === action.id
        ? expireHitl({ ...state, phase: 'review', unread: true }, action.now)
        : state
    case 'read':
      return state.unread ? { ...state, unread: false } : state
    case 'dismiss-toast':
      return { ...state, toastDismissed: true }
    case 'edit':
      return state.phase === 'review'
        ? { ...state, editText: state.draftText, unread: false }
        : state
    case 'change-draft':
      return state.phase === 'review' && state.editText !== null
        ? { ...state, editText: action.text }
        : state
    case 'cancel-edit':
      return { ...state, editText: null }
    case 'save-edit':
      return state.phase === 'review' && state.editText?.trim()
        ? { ...state, draftText: state.editText.trim(), editText: null }
        : state
    case 'share':
      return state.phase === 'review' && state.editText === null && state.draftText.trim()
        ? {
            ...state, phase: 'shared', sharedText: state.draftText, sharedAt: action.now,
            draftText: '', unread: false,
          }
        : state
    case 'reject':
      return state.phase === 'review'
        ? {
            ...state, phase: 'rejected', rejectedAt: action.now,
            rejectionExpiresAt: action.now + 31 * DAY, editText: null, unread: false,
          }
        : state
    case 'expire':
      return state
    case 'restore':
      return action.state
    case 'reset':
      return initialHitlState
    default:
      return state
  }
}

export function hasHitlNotification(state, now) {
  return ['review', 'rejected'].includes(state.phase) && now < state.notificationExpiresAt
}
