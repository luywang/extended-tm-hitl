export const MESSAGE_DELETIONS_STORAGE_KEY = 'teams-deleted-messages-v1'

export function messageKey(chatId, messageId, contextId = null) {
  return JSON.stringify([String(chatId), contextId, String(messageId)])
}

export function canDeleteMessage(message) {
  return !message.isDeleted && (message.senderId === 'me' || message.senderId === 'copilot')
}

export function canUndoMessage(message) {
  return message.isDeleted && message.canUndo === true &&
    !message.isExtendedTm && !message.isPrivate &&
    (message.senderId === 'me' || message.senderId === 'copilot')
}

export function undoMessageDeletion(keys, chatId, message, contextId = null) {
  if (!canUndoMessage(message)) return keys
  const key = messageKey(chatId, message.id, contextId)
  return keys.filter(deletedKey => deletedKey !== key)
}

export function restoreDeletedMessageKeys(value) {
  try {
    const keys = JSON.parse(value)
    return Array.isArray(keys) && keys.every(key => typeof key === 'string') ? [...new Set(keys)] : []
  } catch {
    return []
  }
}

export function isMessageDeleted(keys, chatId, messageId, contextId = null) {
  return keys.includes(messageKey(chatId, messageId, contextId))
}

export function applyMessageDeletions(messages, keys, chatId, contextId = null) {
  return messages.flatMap(message => {
    const replies = message.replies
      ? applyMessageDeletions(message.replies, keys, chatId, contextId)
      : undefined
    if (!isMessageDeleted(keys, chatId, message.id, contextId)) {
      return [{ ...message, ...(replies ? { replies } : {}) }]
    }
    if (message.isExtendedTm) return []
    return [{
      id: message.id,
      senderId: message.senderId,
      time: message.time,
      text: 'This message has been deleted.',
      isDeleted: true,
      canUndo: message.canUndo !== false && !message.isPrivate && canDeleteMessage(message),
      ...(replies ? { replies } : {}),
      ...(message.isHitlThread ? { isHitlThread: true } : {}),
      ...(message.threadReply ? { threadReply: message.threadReply } : {}),
    }]
  })
}

export function isNotificationDeleted(event, keys) {
  const messageId = event.replyId ?? event.messageId ?? event.postId
  return messageId != null && isMessageDeleted(keys, event.chatId, messageId, event.sessionId ?? null)
}
