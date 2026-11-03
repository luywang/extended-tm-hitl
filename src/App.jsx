import { useState, useCallback, useReducer, useEffect } from 'react'
import { agentSessions as initialSessions, activityEvents as seedActivityEvents, hitlScenario, currentUser, deviceRoamingScenario } from './data'
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
import MobileTeams from './components/MobileTeams'
import { FreModal } from './components/common'
import { DesktopToast } from './components/HitlDemo'
import './App.css'

const DEVICE_CONTENT_KEY = 'teams-same-account-preview-v1'

function loadDeviceContent(value) {
  try {
    const content = JSON.parse(value === undefined ? localStorage.getItem(DEVICE_CONTENT_KEY) : value)
    if (content && typeof content.messages === 'object' && content.messages !== null &&
        Array.isArray(content.readChatIds) && Array.isArray(content.readActivityIds)) {
      return { ...content, timeOffset: Number.isFinite(content.timeOffset) ? content.timeOffset : 0 }
    }
  } catch { /* The preview also works without browser storage. */ }
  return { messages: {}, readChatIds: [hitlScenario.chatId], readActivityIds: [], timeOffset: 0 }
}

function persistContent(key, content) {
  try {
    const value = JSON.stringify(content)
    if (localStorage.getItem(key) !== value) localStorage.setItem(key, value)
  } catch { /* Keep in-memory state authoritative when storage is unavailable. */ }
}

function loadHitlState() {
  try {
    return restoreHitlState(localStorage.getItem(HITL_STORAGE_KEY), Date.now() + loadDeviceContent().timeOffset)
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

function messageLifetime(expiresAt, now) {
  const expiresSoon = expiresAt > now && expiresAt - now <= 24 * 60 * 60 * 1000
  const date = new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles',
  })
  return {
    lifetimeLabel: expiresSoon ? 'Expire tomorrow' : `Expires on ${date}`,
    lifetimeWarning: expiresSoon,
  }
}

export default function App() {
  const [devicePreview, setDevicePreview] = useState(false)
  const [timeOffset, setTimeOffset] = useState(() => loadDeviceContent().timeOffset)
  const previewNow = useCallback(() => Date.now() + timeOffset, [timeOffset])
  const [sharedMessages, setSharedMessages] = useState(() => loadDeviceContent().messages)
  const [activeView, setActiveView] = useState('chat') // 'chat' | 'activity'
  const [activeChatId, setActiveChatId] = useState(hitlScenario.chatId)
  const [readChatIds, setReadChatIds] = useState(() => new Set(loadDeviceContent().readChatIds))
  const [activeSlice, setActiveSlice] = useState(null)
  const [hitl, dispatchHitl] = useReducer(hitlReducer, null, loadHitlState)
  const [deletedMessageKeys, setDeletedMessageKeys] = useState(loadDeletedMessageKeys)
  const [clock, setClock] = useState(() => Date.now() + loadDeviceContent().timeOffset)
  const [unavailableNotice, setUnavailableNotice] = useState(false)
  const [sessions, setSessions] = useState(initialSessions)
  const [dynamicSessionMessages, setDynamicSessionMessages] = useState({})
  // Activity feed: persist which events the user has opened so unread decorations clear.
  const [activityEvents, setActivityEvents] = useState(() => {
    const readIds = loadDeviceContent().readActivityIds
    return seedActivityEvents.map(event => readIds.includes(event.id) ? { ...event, unread: false } : event)
  })
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
    persistContent(HITL_STORAGE_KEY, hitl)
  }, [hitl])

  useEffect(() => {
    persistContent(MESSAGE_DELETIONS_STORAGE_KEY, deletedMessageKeys)
  }, [deletedMessageKeys])

  useEffect(() => {
    persistContent(DEVICE_CONTENT_KEY, {
      messages: sharedMessages,
      readChatIds: [...readChatIds],
      readActivityIds: activityEvents.filter(event => !event.unread).map(event => event.id),
      timeOffset,
    })
  }, [sharedMessages, readChatIds, activityEvents, timeOffset])

  useEffect(() => {
    if (hitl.phase !== 'drafting') return
    const timer = setTimeout(() => {
      dispatchHitl({ type: 'deliver', id: hitl.id, now: previewNow() })
    }, Math.max(0, hitl.deliveryAt - previewNow()))
    return () => clearTimeout(timer)
  }, [hitl.phase, hitl.id, hitl.deliveryAt, previewNow])

  useEffect(() => {
    const refresh = () => {
      const now = previewNow()
      setClock(now)
      dispatchHitl({ type: 'expire', now })
    }
    const onStorage = (event) => {
      if (event.key === DEVICE_CONTENT_KEY) {
        const content = loadDeviceContent(event.newValue)
        setSharedMessages(content.messages)
        setTimeOffset(content.timeOffset)
        setClock(Date.now() + content.timeOffset)
        dispatchHitl({ type: 'expire', now: Date.now() + content.timeOffset })
        setReadChatIds(new Set(content.readChatIds))
        setActivityEvents(seedActivityEvents.map(item => content.readActivityIds.includes(item.id) ? { ...item, unread: false } : item))
        return
      }
      if (event.key === MESSAGE_DELETIONS_STORAGE_KEY) {
        setDeletedMessageKeys(restoreDeletedMessageKeys(event.newValue))
        return
      }
      if (event.key !== HITL_STORAGE_KEY) return
      const now = previewNow()
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
  }, [previewNow])

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

  const readReview = useCallback(() => dispatchHitl({ type: 'read', now: previewNow() }), [previewNow])
  const readChat = useCallback(chatId => {
    setReadChatIds(previous => previous.has(chatId) ? previous : new Set(previous).add(chatId))
  }, [])
  const readEvent = useCallback(event => {
    if (event.isTargeted) dispatchHitl({ type: 'read', now: previewNow() })
    setActivityEvents(prev =>
      prev.map(e => (e.id === event.id && e.unread ? { ...e, unread: false } : e))
    )
    setReadChatIds(prev => (prev.has(event.chatId) ? prev : new Set(prev).add(event.chatId)))
  }, [previewNow])

  const selectActivity = useCallback((event) => {
    setActiveSlice(null)
    setUnavailableNotice(false)
    readEvent(event)
    setActiveActivityId(event.id)
    setActiveChatId(event.chatId)
    setNavIntent({
      chatId: event.chatId,
      channelThreadPostId: event.postId || null,
      highlightMessageId: event.messageId || null,
    })
  }, [readEvent])

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
      ...(hitl.visibility === 'public' ? {} : messageLifetime(hitl.expiresAt, clock)),
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
      ...messageLifetime(hitl.expiresAt, clock),
      cards: [{
        title: 'Launch readiness update',
        subtitle: 'Review for Northwind launch',
        accentColor: '#5B5FC7',
        badge: { text: 'Awaiting your approval', tone: 'amber' },
        sections: editing ? [] : [{ text: hitl.draftText }],
        input: editing ? { label: 'Edit draft for the group', value: hitl.editText } : null,
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
      ...(hitl.visibility === 'public' ? {} : messageLifetime(hitl.rejectionExpiresAt, clock)),
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
    dispatchHitl({ type: action, now: previewNow() })
  }

  const requestReview = (prompt, visibility) => {
    const now = previewNow()
    dispatchHitl({ type: 'request', prompt, visibility, draft: hitlScenario.draft, now })
    return `extended-tm-${now}`
  }

  const sendSharedMessage = (chatId, text, postId = null) => {
    if (!text.trim()) return
    const bucket = postId ? `thread:${chatId}:${postId}` : chatId
    const message = {
      id: `device-message-${crypto.randomUUID()}`, senderId: 'me', text: text.trim(),
      time: messageTime(previewNow()),
    }
    setSharedMessages(previous => ({ ...previous, [bucket]: [...(previous[bucket] || []), message] }))
  }

  const deleteMessage = (chatId, message, contextId = null) => {
    if (!canDeleteMessage(message)) return
    const key = messageKey(chatId, message.id, contextId)
    setDeletedMessageKeys(previous => previous.includes(key) ? previous : [...previous, key])
    if (chatId === hitlScenario.chatId && contextId === null) {
      dispatchHitl({ type: 'delete-message', messageId: message.id, now: previewNow() })
    }
    setUnavailableNotice(false)
  }

  const resetDemo = () => {
    setTimeOffset(0)
    setClock(Date.now())
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
    dispatchHitl({ type: 'read', now: previewNow() })
    if (hitl.phase === 'review' && previewNow() < hitl.expiresAt) {
      setNavIntent({
        chatId: hitlScenario.chatId,
        highlightMessageId: hitl.id,
        channelThreadPostId: hitl.visibility === 'public' ? `${hitl.id}-request` : null,
      })
    } else {
      setUnavailableNotice(true)
    }
  }

  const advanceClock = timestamp => {
    const now = Math.max(previewNow(), timestamp)
    setTimeOffset(now - Date.now())
    setClock(now)
    dispatchHitl({ type: 'expire', now })
  }

  return (
    <div className={`app${devicePreview ? ' device-roaming' : ''}`}>
      {devicePreview && (
        <header className="device-preview-header">
          <div><strong>{deviceRoamingScenario.title}</strong><span>{deviceRoamingScenario.description}</span></div>
          <div className="device-preview-controls">
            {timeOffset > 0 && <span>Demo time: {new Date(clock).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })}</span>}
            <button type="button" disabled={hitl.phase === 'idle' || hitl.phase === 'drafting'} onClick={() => advanceClock(hitl.notificationExpiresAt)}>Advance to day 30</button>
            <button type="button" disabled={hitl.phase === 'idle' || hitl.phase === 'drafting'} onClick={() => advanceClock(Math.max(hitl.expiresAt, hitl.rejectionExpiresAt || 0) + 1)}>Advance to TM expiry</button>
            <button type="button" onClick={() => setDevicePreview(false)}>Exit device preview</button>
          </div>
        </header>
      )}
      <div className="device-clients">
      <section className="desktop-client" aria-label="Teams web client">
      {devicePreview && <div className="device-client-label">Teams web · {currentUser.name}</div>}
      <TitleBar onShowFre={() => setShowFre(true)} onShowDevices={() => { setShowFre(false); setDevicePreview(true) }} showDeviceEntry={!devicePreview} />
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
            onRequestReview={requestReview}
            independentNavigation={devicePreview}
            sharedMessages={devicePreview ? sharedMessages : undefined}
            onSendSharedMessage={devicePreview ? sendSharedMessage : undefined}
            onReadReview={devicePreview ? readReview : undefined}
            onReviewAction={handleReviewAction}
            onDraftChange={(text) => dispatchHitl({ type: 'change-draft', text, now: previewNow() })}
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
      </section>
      {devicePreview && (
        <div className="mobile-client">
          <div className="device-client-label">iOS Teams · {currentUser.name}</div>
          <MobileTeams
            hitl={hitl}
            now={clock}
            hitlMessages={hitlCanvasMessages}
            events={allActivityEvents}
            readChatIds={readChatIds}
            deletedMessageKeys={deletedMessageKeys}
            sharedMessages={sharedMessages}
            onReadChat={readChat}
            onReadEvent={readEvent}
            onReadReview={readReview}
            onRequestReview={requestReview}
            onReviewAction={handleReviewAction}
            onDraftChange={text => dispatchHitl({ type: 'change-draft', text, now: previewNow() })}
            onDeleteMessage={deleteMessage}
            onUndoDeleteMessage={undoDeleteMessage}
            onResetDemo={resetDemo}
            onSendMessage={sendSharedMessage}
            onDismissToast={() => dispatchHitl({ type: 'dismiss-toast' })}
          />
        </div>
      )}
      </div>
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
