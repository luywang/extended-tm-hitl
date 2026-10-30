import { useState, useCallback, useReducer, useEffect } from 'react'
import { agentSessions as initialSessions, activityEvents as seedActivityEvents, hitlScenario, currentUser } from './data'
import { HITL_STORAGE_KEY, hitlReducer, restoreHitlState, hasHitlNotification } from './hitlState'
import {
  MESSAGE_DELETIONS_STORAGE_KEY, canDeleteMessage, messageKey,
  restoreDeletedMessageKeys, isMessageDeleted, isNotificationDeleted,
  undoMessageDeletion,
} from './messageState'
import NavRail from './components/NavRail'
import ChatList from './components/ChatList'
import ChatView from './components/ChatView'
import ActivityList from './components/ActivityList'
import TitleBar from './components/TitleBar'
import { FreModal } from './components/common'
import { DesktopToast } from './components/HitlDemo'
import './App.css'

function loadHitlState() {
  try {
    return restoreHitlState(localStorage.getItem(HITL_STORAGE_KEY), Date.now())
  } catch {
    return restoreHitlState(null, Date.now())
  }
}

function messageTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  })
}

function loadDeletedMessageKeys() {
  try {
    return restoreDeletedMessageKeys(localStorage.getItem(MESSAGE_DELETIONS_STORAGE_KEY))
  } catch {
    return []
  }
}

function messageLifetime(expiresAt) {
  const date = new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
  })
  return `Extended targeted message · 30 days + buffer · Available until ${date}`
}

export default function App() {
  const [activeView, setActiveView] = useState('chat') // 'chat' | 'activity'
  const [activeChatId, setActiveChatId] = useState(hitlScenario.chatId)
  const [readChatIds, setReadChatIds] = useState(() => new Set([hitlScenario.chatId]))
  const [activeSlice, setActiveSlice] = useState(null)
  const [hitl, dispatchHitl] = useReducer(hitlReducer, null, loadHitlState)
  const [deletedMessageKeys, setDeletedMessageKeys] = useState(loadDeletedMessageKeys)
  const [clock, setClock] = useState(() => Date.now())
  const [unavailableNotice, setUnavailableNotice] = useState(false)
  const [sessions, setSessions] = useState(initialSessions)
  const [dynamicSessionMessages, setDynamicSessionMessages] = useState({})
  // Activity feed: persist which events the user has opened so unread decorations clear.
  const [activityEvents, setActivityEvents] = useState(seedActivityEvents)
  const [activeActivityId, setActiveActivityId] = useState(null)
  // When navigating to a chat, optionally tell ChatView to open a specific
  // session (sessions rail), open a specific channel thread, or flash a
  // specific message so the user can see where a notification landed.
  const [navIntent, setNavIntent] = useState(null)
  // FRE shows on every load while iterating on the prototype — dismiss only
  // hides it for the current session. Swap to localStorage gating later if a
  // real first-run-only behavior is needed.
  const [showFre, setShowFre] = useState(true)

  const dismissFre = useCallback(() => setShowFre(false), [])

  useEffect(() => {
    try {
      localStorage.setItem(HITL_STORAGE_KEY, JSON.stringify(hitl))
    } catch {
      // The demo still works in memory when browser storage is unavailable.
    }
  }, [hitl])

  useEffect(() => {
    try {
      localStorage.setItem(MESSAGE_DELETIONS_STORAGE_KEY, JSON.stringify(deletedMessageKeys))
    } catch {
      // Deletion still works in memory when browser storage is unavailable.
    }
  }, [deletedMessageKeys])

  useEffect(() => {
    if (hitl.phase !== 'drafting') return
    const timer = setTimeout(() => {
      dispatchHitl({ type: 'deliver', id: hitl.id, now: Date.now() })
    }, Math.max(0, hitl.deliveryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [hitl.phase, hitl.id, hitl.deliveryAt])

  useEffect(() => {
    const refresh = () => {
      const now = Date.now()
      setClock(now)
      dispatchHitl({ type: 'expire', now })
    }
    const onStorage = (event) => {
      if (event.key === MESSAGE_DELETIONS_STORAGE_KEY) {
        setDeletedMessageKeys(restoreDeletedMessageKeys(event.newValue))
        return
      }
      if (event.key !== HITL_STORAGE_KEY) return
      const now = Date.now()
      setClock(now)
      dispatchHitl({ type: 'restore', state: restoreHitlState(event.newValue, now) })
    }
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const selectChat = useCallback((chatId) => {
    setActiveChatId(chatId)
    setActiveSlice(null)
    setUnavailableNotice(false)
    setReadChatIds(prev => (prev.has(chatId) ? prev : new Set(prev).add(chatId)))
  }, [])

  const navigateToChat = useCallback((chatId, { showSessions, sessionId } = {}) => {
    selectChat(chatId)
    if (showSessions) setNavIntent({ chatId, sessionId: sessionId || null })
  }, [selectChat])

  const clearNavIntent = useCallback(() => setNavIntent(null), [])

  const addSession = useCallback((agentId, session, messages) => {
    setSessions(prev => ({
      ...prev,
      [agentId]: [session, ...(prev[agentId] || [])],
    }))
    if (messages) {
      setDynamicSessionMessages(prev => ({ ...prev, [session.id]: messages }))
    }
  }, [])

  const updateSession = useCallback((agentId, sessionId, updates) => {
    setSessions(prev => ({
      ...prev,
      [agentId]: (prev[agentId] || []).map(s =>
        s.id === sessionId ? { ...s, ...updates } : s
      ),
    }))
  }, [])

  const updateSessionMessages = useCallback((sessionId, messages) => {
    setDynamicSessionMessages(prev => ({ ...prev, [sessionId]: messages }))
  }, [])

  const selectActivity = useCallback((event) => {
    setActiveSlice(null)
    setUnavailableNotice(false)
    if (event.isTargeted) dispatchHitl({ type: 'read', now: Date.now() })
    setActiveActivityId(event.id)
    setActivityEvents(prev =>
      prev.map(e => (e.id === event.id && e.unread ? { ...e, unread: false } : e))
    )
    setActiveChatId(event.chatId)
    setReadChatIds(prev => (prev.has(event.chatId) ? prev : new Set(prev).add(event.chatId)))
    setNavIntent({
      chatId: event.chatId,
      channelThreadPostId: event.postId || null,
      highlightMessageId: event.messageId || null,
    })
  }, [])

  const reviewDeleted = isMessageDeleted(deletedMessageKeys, hitlScenario.chatId, hitl.id)
  const targetedEvent = hasHitlNotification(hitl, clock) && !reviewDeleted ? {
    id: `${hitl.id}-notification`,
    type: 'mention',
    actorId: 'copilot',
    chatId: hitlScenario.chatId,
    messageId: hitl.id,
    postId: hitl.visibility === 'public' ? `${hitl.id}-request` : null,
    preview: hitlScenario.preview,
    time: messageTime(hitl.deliveryAt),
    unread: hitl.unread,
    isTargeted: true,
  } : null
  const allActivityEvents = (targetedEvent ? [targetedEvent, ...activityEvents] : activityEvents)
    .filter(event => !isNotificationDeleted(event, deletedMessageKeys))
  const activityUnreadCount = allActivityEvents.reduce((n, e) => n + (e.unread ? 1 : 0), 0)
  const mentionUnreadCount = allActivityEvents.filter(e => e.type === 'mention' && e.unread).length
  const showMentions = () => { setActiveView('chat'); setActiveSlice('mentions') }

  const hitlMessages = []
  if (hitl.phase !== 'idle' && (hitl.visibility === 'public' || clock < hitl.expiresAt)) {
    hitlMessages.push({
      id: `${hitl.id}-request`,
      senderId: 'me',
      text: [{ type: 'mention', name: hitl.visibility === 'public' ? '@Copilot' : '/Copilot' }, ` ${hitl.prompt}`],
      time: messageTime(hitl.requestedAt),
      isPrivate: hitl.visibility !== 'public',
      isExtendedTm: hitl.visibility !== 'public',
      privateLabel: 'Only you and Copilot can see this message',
      canUndo: !!hitl.prompt.trim(),
      reactions: hitl.visibility === 'public' ? [{ emoji: '👀', count: 1, label: 'Copilot reacted with Eyes: looking at this message' }] : undefined,
    })
  }
  if (hitl.phase === 'review' && clock < hitl.expiresAt) {
    const editing = hitl.editText !== null
    hitlMessages.push({
      id: hitl.id,
      senderId: 'copilot',
      text: [{ type: 'mention', name: currentUser.name }, ', your launch update is ready. Review it before sharing.'],
      time: messageTime(hitl.deliveryAt),
      isPrivate: true,
      isExtendedTm: true,
      privateLabel: 'Only you can see this message',
      cards: [{
        title: 'Launch readiness update',
        subtitle: 'Review for Northwind launch',
        accentColor: '#5B5FC7',
        badge: { text: 'Awaiting your approval', tone: 'amber' },
        sections: editing ? [] : [{ text: hitl.draftText }],
        input: editing ? { label: 'Edit draft for the group', value: hitl.editText } : null,
        footer: messageLifetime(hitl.expiresAt),
        actions: editing ? [
          { id: 'save-edit', label: 'Save changes', primary: true, disabled: !hitl.editText.trim() },
          { id: 'cancel-edit', label: 'Cancel' },
        ] : [
          { id: 'share', label: 'Share with group', primary: true },
          { id: 'edit', label: 'Edit draft' },
          { id: 'reject', label: "Don't share" },
        ],
      }],
    })
  }
  if (hitl.phase === 'rejected' && (hitl.visibility === 'public' || clock < hitl.rejectionExpiresAt)) {
    hitlMessages.push({
      id: `${hitl.id}-rejection`,
      senderId: 'copilot',
      text: hitl.visibility === 'public'
        ? `${currentUser.name} ${hitlScenario.publicRejection}`
        : hitlScenario.rejection,
      time: messageTime(hitl.rejectedAt),
      isPrivate: hitl.visibility !== 'public',
      isExtendedTm: hitl.visibility !== 'public',
      privateLabel: 'Only you can see this message',
      lifetimeLabel: hitl.visibility === 'public' ? undefined : messageLifetime(hitl.rejectionExpiresAt),
    })
  }
  if (hitl.phase === 'shared') {
    const sharedPrompt = hitl.sharedPrompt ?? hitl.prompt
    hitlMessages.push({
      id: `${hitl.id}-shared`,
      senderId: 'copilot',
      text: hitl.visibility !== 'public' && sharedPrompt
        ? `${currentUser.name} asked privately: "${sharedPrompt}"\n\n${hitl.sharedText}`
        : hitl.sharedText,
      time: messageTime(hitl.sharedAt),
      canUndo: !!hitl.sharedText?.trim(),
    })
  }

  const hitlCanvasMessages = hitl.visibility === 'public'
    ? hitlMessages.filter(message => message.id === `${hitl.id}-request`).map(message => ({
        ...message,
        isHitlThread: true,
        replies: hitlMessages.filter(reply => reply.id !== message.id),
      }))
    : hitlMessages

  const handleReviewAction = (action) => {
    dispatchHitl({ type: action, now: Date.now() })
  }

  const deleteMessage = (chatId, message, contextId = null) => {
    if (!canDeleteMessage(message)) return
    const key = messageKey(chatId, message.id, contextId)
    setDeletedMessageKeys(previous => previous.includes(key) ? previous : [...previous, key])
    if (chatId === hitlScenario.chatId && contextId === null) {
      dispatchHitl({ type: 'delete-message', messageId: message.id, now: Date.now() })
    }
    setUnavailableNotice(false)
  }

  const resetDemo = () => {
    dispatchHitl({ type: 'reset' })
    setUnavailableNotice(false)
    setActiveActivityId(null)
  }

  const undoDeleteMessage = (chatId, message, contextId = null) => {
    setDeletedMessageKeys(previous => undoMessageDeletion(previous, chatId, message, contextId))
  }

  const openToast = () => {
    setActiveView('chat')
    selectChat(hitlScenario.chatId)
    dispatchHitl({ type: 'dismiss-toast' })
    dispatchHitl({ type: 'read', now: Date.now() })
    if (hitl.phase === 'review' && Date.now() < hitl.expiresAt) {
      setNavIntent({
        chatId: hitlScenario.chatId,
        highlightMessageId: hitl.id,
        channelThreadPostId: hitl.visibility === 'public' ? `${hitl.id}-request` : null,
      })
    } else {
      setUnavailableNotice(true)
    }
  }

  return (
    <div className="app">
      <TitleBar onShowFre={() => setShowFre(true)} />
      <div className="app-body">
        <NavRail
          activeView={activeView}
          onSelectView={(view) => { setActiveView(view); setActiveSlice(null) }}
          activityUnreadCount={activityUnreadCount}
        />
        {activeView === 'activity' ? (
          <ActivityList
            events={allActivityEvents}
            activeEventId={activeActivityId}
            onSelectEvent={selectActivity}
          />
        ) : (
          <ChatList
            activeChatId={activeChatId}
            onSelectChat={selectChat}
            readChatIds={readChatIds}
            activeSlice={activeSlice}
            onShowMentions={showMentions}
            mentionUnreadCount={mentionUnreadCount}
            targetedUnreadChatId={targetedEvent?.unread ? hitlScenario.chatId : null}
          />
        )}
        <div className={`app-chat-canvas${activeSlice === 'mentions' ? ' app-chat-canvas-hidden' : ''}`}>
          <ChatView
            activeChatId={activeChatId}
            onSelectChat={navigateToChat}
            sessions={sessions}
            addSession={addSession}
            updateSession={updateSession}
            updateSessionMessages={updateSessionMessages}
            dynamicSessionMessages={dynamicSessionMessages}
            navIntent={navIntent}
            clearNavIntent={clearNavIntent}
            hitl={hitl}
            hitlMessages={hitlCanvasMessages}
            deletedMessageKeys={deletedMessageKeys}
            onDeleteMessage={deleteMessage}
            onUndoDeleteMessage={undoDeleteMessage}
            onRequestReview={(prompt, visibility) => dispatchHitl({ type: 'request', prompt, visibility, draft: hitlScenario.draft, now: Date.now() })}
            onReviewAction={handleReviewAction}
            onDraftChange={(text) => dispatchHitl({ type: 'change-draft', text, now: Date.now() })}
            onResetDemo={resetDemo}
            onShowActivity={() => { setActiveView('activity'); setActiveSlice(null) }}
            onShowMentions={showMentions}
            unavailableNotice={unavailableNotice}
          />
        </div>
        {activeSlice === 'mentions' && (
          <ActivityList
            events={allActivityEvents}
            activeEventId={activeActivityId}
            onSelectEvent={selectActivity}
            isMentionsSlice
          />
        )}
      </div>
      {hitl.phase !== 'idle' && hitl.phase !== 'drafting' && !hitl.toastDismissed && !reviewDeleted && (
        <DesktopToast onOpen={openToast} onDismiss={() => dispatchHitl({ type: 'dismiss-toast' })} />
      )}
      {showFre && (
        <FreModal
          title="Review privately. Share confidently."
          subtitle="Copilot brings you a private draft in the group chat. You decide what everyone sees."
          onDismiss={dismissFre}
          dismissLabel="Try the demo"
        >
          <h3 className="fre-section-title">1. Ask Copilot</h3>
          <p>In Northwind launch, choose Send privately to Copilot or Send publicly to
            Copilot to populate the compose box. Review or edit the request, then click
            Send. Public requests are visible to the group; Copilot reacts with Eyes
            to show it is looking at your message, then sends your private draft in its thread.</p>
          <h3 className="fre-section-title">2. Get notified and review</h3>
          <p>A desktop toast, Activity item, and Mentions card lead to the same private
            response. Extended targeted messages last 30 days plus a buffer, so review
            doesn&apos;t have to happen right away.</p>
          <h3 className="fre-section-title">3. You control what gets shared</h3>
          <p>Edit the draft or share it with the group. Sharing posts a new group-visible
            response in the original thread for public requests, or in the main chat
            for private requests, and withdraws the private review card. For private requests,
            the public response includes your original prompt as plain text, not a quoted
            targeted message. Choosing
            Don&apos;t share deletes the draft and its notifications. For public requests,
            Copilot tells the thread you reviewed the response and suggested not sharing
            it at this time. For private requests, Copilot confirms your decision privately.</p>
          <p className="fre-modal-footnote">Interactive prototype with mocked content and an
            in-app desktop toast. Progress survives reloads in this browser; real device
            roaming and OS notifications require the Teams service.</p>
        </FreModal>
      )}
    </div>
  )
}
