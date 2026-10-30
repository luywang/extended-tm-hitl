import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canDeleteMessage, messageKey, restoreDeletedMessageKeys,
  applyMessageDeletions, isNotificationDeleted,
  canUndoMessage, undoMessageDeletion,
} from './messageState.js'

test('only Alex and Copilot messages are eligible for deletion', () => {
  assert.equal(canDeleteMessage({ senderId: 'me' }), true)
  assert.equal(canDeleteMessage({ senderId: 'copilot', isExtendedTm: true }), true)
  assert.equal(canDeleteMessage({ senderId: 1 }), false)
  assert.equal(canDeleteMessage({ senderId: 4 }), false)
  assert.equal(canDeleteMessage({ senderId: 'me', isDeleted: true }), false)
})

test('deleting a public root removes content and attachments but preserves its replies', () => {
  const reply = { id: 'reply', senderId: 'copilot', text: 'Private draft.', isExtendedTm: true }
  const root = {
    id: 'root', senderId: 'me', text: 'Original request.', time: '9:00 AM',
    cards: [{ title: 'Private attachment' }], reactions: [{ emoji: '👀' }],
    isHitlThread: true, replies: [reply],
  }
  const [deleted] = applyMessageDeletions([root], [messageKey(23, 'root')], 23)
  assert.equal(deleted.isDeleted, true)
  assert.equal(canUndoMessage(deleted), true)
  assert.equal(deleted.text, 'This message has been deleted.')
  assert.equal(deleted.isHitlThread, true)
  assert.deepEqual(deleted.replies, [reply])
  assert.equal(deleted.cards, undefined)
  assert.equal(deleted.reactions, undefined)
  assert.equal(root.text, 'Original request.')
})

test('deleted TMs disappear without removing the root or other replies', () => {
  const root = {
    id: 'root', senderId: 'me', replies: [
      { id: 'tm', senderId: 'copilot', isExtendedTm: true },
      { id: 'public', senderId: 'copilot', text: 'Public result.' },
    ],
  }
  const [result] = applyMessageDeletions([root], [messageKey(23, 'tm')], 23)
  assert.deepEqual(result.replies, [root.replies[1]])
  assert.deepEqual(applyMessageDeletions([root.replies[0]], [messageKey(23, 'tm')], 23), [])
})

test('deletion keys distinguish chats and sessions even when message ids repeat', () => {
  const message = { id: 2, senderId: 'me', text: 'Original.' }
  const keys = [messageKey(1, 2), messageKey(2, 2, 'session-a')]
  assert.equal(applyMessageDeletions([message], keys, 1)[0].isDeleted, true)
  assert.equal(applyMessageDeletions([message], keys, 2)[0].isDeleted, undefined)
  assert.equal(applyMessageDeletions([message], keys, 2, 'session-a')[0].isDeleted, true)
  assert.equal(applyMessageDeletions([message], keys, 2, 'session-b')[0].isDeleted, undefined)
})

test('notifications are removed only for their deleted source, not a deleted thread root', () => {
  const keys = [messageKey(23, 'root'), messageKey(23, 'tm')]
  assert.equal(isNotificationDeleted({ chatId: 23, messageId: 'tm' }, keys), true)
  assert.equal(isNotificationDeleted({ chatId: 23, postId: 'root' }, keys), true)
  assert.equal(isNotificationDeleted({ chatId: 23, postId: 'root', replyId: 'reply' }, keys), false)
  assert.equal(isNotificationDeleted({ chatId: 1, messageId: 'tm' }, keys), false)
})

test('restoring deletion keys tolerates corrupt or invalid browser storage', () => {
  const key = messageKey(23, 'tm')
  assert.deepEqual(restoreDeletedMessageKeys(JSON.stringify([key, key])), [key])
  for (const value of [null, '{broken', '{}', '["valid", 123]']) {
    assert.deepEqual(restoreDeletedMessageKeys(value), [])
  }
})

test('Undo restores public content and replies while leaving a deleted Extended TM deleted', () => {
  const publicReply = { id: 'public', senderId: 'copilot', text: 'Approved response.' }
  const root = {
    id: 'root', senderId: 'me', text: 'Original request.',
    cards: [{ title: 'Launch readiness' }], reactions: [{ emoji: '👀' }],
    replies: [
      { id: 'tm', senderId: 'copilot', isExtendedTm: true, text: 'Private draft.' },
      publicReply,
    ],
  }
  const keys = [messageKey(23, 'root'), messageKey(23, 'tm'), messageKey(1, 'root')]
  const [tombstone] = applyMessageDeletions([root], keys, 23)
  const restoredKeys = undoMessageDeletion(keys, 23, tombstone)
  assert.deepEqual(restoredKeys, [messageKey(23, 'tm'), messageKey(1, 'root')])
  const [restored] = applyMessageDeletions([root], restoredKeys, 23)
  assert.deepEqual(restored, { ...root, replies: [publicReply] })
  assert.equal(isNotificationDeleted({ chatId: 23, messageId: 'tm' }, restoredKeys), true)
  assert.equal(isNotificationDeleted({ chatId: 23, messageId: 'root' }, restoredKeys), false)
})

test('Undo never restores Extended TMs, private messages, or unavailable public source content', () => {
  const keys = [messageKey(23, 'message')]
  for (const message of [
    { id: 'message', senderId: 'me', isDeleted: true, isExtendedTm: true, canUndo: true },
    { id: 'message', senderId: 'copilot', isDeleted: true, isPrivate: true, canUndo: true },
    { id: 'message', senderId: 'me', isDeleted: true, canUndo: false },
  ]) {
    assert.equal(canUndoMessage(message), false)
    assert.equal(undoMessageDeletion(keys, 23, message), keys)
  }
  for (const source of [
    { id: 'message', senderId: 'me', isPrivate: true },
    { id: 'message', senderId: 'copilot', canUndo: false },
  ]) {
    assert.equal(canUndoMessage(applyMessageDeletions([source], keys, 23)[0]), false)
  }
})
