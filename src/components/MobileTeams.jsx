import { useEffect, useRef, useState } from 'react'
import {
  contacts, currentUser, messagesByContact, channelPostsByContact,
  copilotAgent, hitlScenario, deviceRoamingScenario,
  favorites, projectNorthwind, chatList,
} from '../data'
import { applyMessageDeletions } from '../messageState'
import { Avatar, IconButton, ChevronLeft, Close, Search, Send, ChatMultiple, Activity, PrivateDisclaimer, TypingIndicator } from './common'
import MessageRow from './MessageRow'
import './MobileTeams.css'

function flattenText(text) {
  return Array.isArray(text) ? text.map(part => typeof part === 'string' ? part : part.name).join('') : text || ''
}

function withThreadBadge(message) {
  if (!message.replies?.length && !message.isHitlThread) return message
  return {
    ...message,
    threadReply: {
      participantIds: [...new Set((message.replies || []).map(reply => reply.senderId))].slice(0, 3).concat(message.replies?.length ? [] : ['copilot']),
      count: message.replies?.length || 0,
    },
  }
}

export default function MobileTeams({
  hitl, now, hitlMessages, events, readChatIds, deletedMessageKeys, sharedMessages,
  onReadChat, onReadEvent, onReadReview, onRequestReview, onReviewAction,
  onDraftChange, onDeleteMessage, onUndoDeleteMessage, onResetDemo, onSendMessage, onDismissToast,
}) {
  const [tab, setTab] = useState('chat')
  const [chatId, setChatId] = useState(null)
  const [postId, setPostId] = useState(null)
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState({})
  const [notice, setNotice] = useState(false)
  const [highlightId, setHighlightId] = useState(null)
  const bodyRef = useRef(null)
  const composeRef = useRef(null)
  const contact = contacts.find(item => item.id === chatId)
  const isHitlChat = chatId === hitlScenario.chatId
  const source = contact?.isChannel ? channelPostsByContact[chatId] : messagesByContact[chatId]
  const messages = [
    ...(source || []), ...(sharedMessages[chatId] || []), ...(isHitlChat ? hitlMessages : []),
  ]
  const posts = messages.map(message => ({
    ...message, replies: message.replies || sharedMessages[`thread:${chatId}:${message.id}`] ? [
      ...(message.replies || []), ...(sharedMessages[`thread:${chatId}:${message.id}`] || []),
    ] : undefined,
  }))
  const post = postId ? posts.find(message => message.id === postId) : null
  const draftKey = postId ? `thread:${chatId}:${postId}` : chatId
  const input = drafts[draftKey] || ''
  const isRequest = isHitlChat && !postId && /^[/@]Copilot\b/i.test(input)
  const privateRequest = isRequest && input.startsWith('/')
  const canSend = !!input.trim() && (!isRequest || (hitl.phase === 'idle' && !!input.replace(/^[/@]Copilot\b\s*/i, '').trim()))
  const visibleMessages = post ? [post, ...(post.replies || [])] : posts
  const renderedMessages = applyMessageDeletions(visibleMessages, deletedMessageKeys, chatId)

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const target = highlightId && body.querySelector(`[data-message-id="${CSS.escape(String(highlightId))}"]`)
    if (target) body.scrollTop = target.offsetTop - body.offsetTop - 24
    else body.scrollTop = body.scrollHeight
  }, [chatId, postId, highlightId])

  useEffect(() => {
    if (!hitl.unread || !isHitlChat || !bodyRef.current) return
    const review = bodyRef.current.querySelector(`[data-message-id="${CSS.escape(hitl.id)}"]`)
    if (!review) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onReadReview()
    }, { root: bodyRef.current })
    observer.observe(review)
    return () => observer.disconnect()
  }, [hitl.id, hitl.phase, hitl.unread, isHitlChat, postId, onReadReview])

  const openChat = (id, threadId = null) => {
    setChatId(id)
    setPostId(threadId)
    setNotice(false)
    setHighlightId(null)
    onReadChat(id)
  }
  const openEvent = event => {
    onReadEvent(event)
    openChat(event.chatId, event.postId || null)
    setHighlightId(event.replyId || event.messageId || null)
  }
  const send = event => {
    event.preventDefault()
    if (!canSend) return
    if (isRequest) {
      const visibility = privateRequest ? 'private' : 'public'
      const id = onRequestReview(input.replace(/^[/@]Copilot\b\s*/i, ''), visibility)
      if (visibility === 'public') setPostId(`${id}-request`)
    } else onSendMessage(chatId, input, postId)
    setDrafts(previous => ({ ...previous, [draftKey]: '' }))
  }
  const seedRequest = visibility => {
    setDrafts(previous => ({
      ...previous, [draftKey]: `${visibility === 'private' ? '/' : '@'}Copilot ${input.replace(/^[/@]Copilot\b\s*/i, '').trim() || hitlScenario.prompt}`,
    }))
    composeRef.current?.focus()
  }

  return (
    <section className="ios-phone" aria-label="iOS Teams client">
      <div className="ios-status-bar" aria-label="iOS status bar"><span>9:41</span><span className="ios-status-island" /><span>5G ▰</span></div>
      {hitl.id && !hitl.toastDismissed && !['drafting', 'deleted', 'rejected'].includes(hitl.phase) && (
        <aside className="ios-notification" aria-label="Mobile Teams notification">
          <button type="button" onClick={() => {
            openChat(hitlScenario.chatId, hitl.visibility === 'public' ? `${hitl.id}-request` : null)
            onDismissToast()
            onReadReview()
            setHighlightId(hitl.id)
            setNotice(hitl.phase !== 'review' || now >= hitl.expiresAt)
          }}><Avatar contact={copilotAgent} size={28} /><span><strong>Copilot · Northwind launch</strong>Your private draft is ready to review.</span></button>
          <IconButton label="Dismiss mobile notification" onClick={onDismissToast}><Close size={14} /></IconButton>
        </aside>
      )}
      {contact ? (
        <>
          <header className="ios-conversation-header">
            <IconButton label={postId ? 'Back to conversation' : 'Back to chats'} onClick={() => {
              if (postId) setPostId(null)
              else setChatId(null)
              setHighlightId(null)
            }}><ChevronLeft size={22} /></IconButton>
            <Avatar contact={contact} size={32} />
            <div><h2>{postId ? 'Thread' : contact.name}</h2><span>{postId ? contact.name : contact.isGroup ? `${contact.memberCount || 7} participants` : 'Chat'}</span></div>
          </header>
          <div className="ios-conversation-tabs"><span className="ios-tab-selected">{postId ? 'Replies' : 'Chat'}</span><span>Shared</span></div>
          <div className="ios-messages" ref={bodyRef}>
            {isHitlChat && !postId && hitl.phase === 'idle' && (
              <div className="ios-request-options">
                <p>Ask Copilot for a launch update. Review your request, then tap Send.</p>
                <button type="button" onClick={() => seedRequest('private')}>Send privately to Copilot</button>
                <button type="button" onClick={() => seedRequest('public')}>Send publicly to Copilot</button>
              </div>
            )}
            {isHitlChat && ['shared', 'rejected', 'deleted', 'expired'].includes(hitl.phase) && (
              <div className="ios-demo-status" role="status">
                {hitl.phase === 'shared' ? 'Response shared with the group.' : hitl.phase === 'rejected' ? "Draft deleted. Copilot confirmed Don't share." : hitl.phase === 'expired' ? 'Private draft expired. Nothing was shared.' : 'Private draft deleted. Nothing was shared.'}
                <button type="button" onClick={onResetDemo}>Restart demo</button>
              </div>
            )}
            {notice && <p role="status">This private message is no longer available.</p>}
            {post?.isHitlThread && (hitl.phase === 'drafting' || post.replies?.some(reply => reply.isPrivate)) && (
              <PrivateDisclaimer text="Copilot's draft is only visible to you. Your original request is public." />
            )}
            {renderedMessages.map(message => (
              <MessageRow
                key={message.id}
                message={postId ? { ...message, threadReply: undefined } : withThreadBadge(message)}
                activeContact={contact}
                autoFocusCardInput={false}
                onCardAction={message.id === hitl.id ? onReviewAction : undefined}
                onCardInputChange={message.id === hitl.id ? onDraftChange : undefined}
                onOpenThread={() => setPostId(message.id)}
                onDeleteMessage={message => onDeleteMessage(chatId, message)}
                onUndoDeleteMessage={message => onUndoDeleteMessage(chatId, message)}
              />
            ))}
            {isHitlChat && hitl.phase === 'drafting' && (hitl.visibility !== 'public' || postId === `${hitl.id}-request`) && <TypingIndicator contact={copilotAgent} />}
          </div>
          <form className="ios-compose" onSubmit={send}>
            {privateRequest && <PrivateDisclaimer text="Private request to Copilot. The group won't see it." />}
            <div className="ios-compose-box">
              <textarea ref={composeRef} aria-label={postId ? 'Mobile public thread reply' : 'Mobile message'} placeholder={postId ? 'Reply publicly in thread' : 'Type a message'} value={input} rows={2} onChange={event => setDrafts(previous => ({ ...previous, [draftKey]: event.target.value }))} />
              <IconButton label="Send mobile message" type="submit" disabled={!canSend}><Send size={22} /></IconButton>
            </div>
          </form>
        </>
      ) : (
        <>
          <header className="ios-list-header"><Avatar contact={currentUser} size={32} /><h2>{tab === 'chat' ? 'Chat' : 'Activity'}</h2></header>
          <label className="ios-search"><Search size={18} /><input aria-label="Search mobile Teams" placeholder="Search" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="ios-list-filters">
            {['chat', 'activity', 'mentions'].map(filter => <button type="button" key={filter} aria-pressed={tab === filter} onClick={() => setTab(filter)}>{filter === 'chat' ? 'All' : filter === 'activity' ? 'Activity' : 'Mentions'}</button>)}
          </div>
          <div className="ios-list">
            {tab === 'chat' ? deviceRoamingScenario.chatIds.map(id => {
              const chat = contacts.find(item => item.id === id)
              if (!chat.name.toLowerCase().includes(search.toLowerCase())) return null
              const seededUnread = [...favorites, ...projectNorthwind, ...chatList].some(entry => entry.contactId === id && entry.bold)
              const unread = events.some(event => event.chatId === id && event.isTargeted && event.unread) || (seededUnread && !readChatIds.has(id))
              const history = applyMessageDeletions([
                ...(chat.isChannel ? channelPostsByContact[id] || [] : messagesByContact[id] || []),
                ...(sharedMessages[id] || []),
                ...(id === hitlScenario.chatId ? hitlMessages : []),
              ], deletedMessageKeys, id)
              const preview = id === hitlScenario.chatId && hitl.phase === 'review' ? hitlScenario.preview : flattenText(history.at(-1)?.text)
              return <button type="button" key={id} className={`ios-chat-item${unread ? ' ios-unread' : ''}`} onClick={() => openChat(id)}>
                <Avatar contact={chat} size={44} /><span><strong>{chat.name}</strong><span>{preview || 'Open conversation'}</span></span>{unread && <span className="ios-unread-dot" aria-label="Unread" />}
              </button>
            }) : events.filter(event => (tab !== 'mentions' || event.type === 'mention') && `${event.preview} ${contacts.find(item => item.id === event.actorId)?.name}`.toLowerCase().includes(search.toLowerCase())).map(event => {
              const actor = contacts.find(item => item.id === event.actorId) || copilotAgent
              return <button type="button" className={`ios-chat-item${event.unread ? ' ios-unread' : ''}`} key={event.id} onClick={() => openEvent(event)}>
                <Avatar contact={actor} size={44} /><span><strong>{actor.name} {event.type === 'mention' ? 'mentioned you' : event.type === 'reply' ? 'replied' : 'reacted'}</strong><span>{event.preview}</span><small>{contacts.find(item => item.id === event.chatId)?.name} · {event.time}</small></span>{event.unread && <span className="ios-unread-dot" aria-label="Unread" />}
              </button>
            })}
            {tab !== 'chat' && !events.some(event => tab !== 'mentions' || event.type === 'mention') && <p className="ios-empty">You&apos;re all caught up.</p>}
          </div>
          <nav className="ios-bottom-nav" aria-label="Mobile Teams navigation">
            <button type="button" aria-pressed={tab !== 'chat'} onClick={() => setTab('activity')}><Activity /><span>Activity</span>{events.some(event => event.unread) && <span className="ios-nav-dot" />}</button>
            <button type="button" aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}><ChatMultiple size={24} /><span>Chat</span></button>
          </nav>
        </>
      )}
      <div className="ios-home-indicator" />
    </section>
  )
}
