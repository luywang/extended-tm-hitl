import test from 'node:test'
import assert from 'node:assert/strict'
import { initialHitlState, hitlReducer, hasHitlNotification, restoreHitlState } from './hitlState.js'

const now = Date.parse('2026-10-29T18:00:00Z')
const request = (state = initialHitlState) => hitlReducer(state, {
  type: 'request', now, prompt: 'Draft a Northwind launch update.', draft: 'Kevin owns JIRA-4593.',
})
const deliver = () => {
  const pending = request()
  return hitlReducer(pending, { type: 'deliver', id: pending.id, now: pending.deliveryAt })
}

test('only delivery creates a notification; sharing publishes the approved edit once', () => {
  const pending = request()
  assert.equal(hasHitlNotification(pending, now), false)
  let state = deliver()
  assert.equal(state.unread, true)
  assert.equal(hasHitlNotification(state, state.deliveryAt), true)
  state = hitlReducer(state, { type: 'edit', now })
  state = hitlReducer(state, { type: 'change-draft', text: 'Hold rollout until staging is green.', now })
  assert.equal(hitlReducer(state, { type: 'share', now }).phase, 'review')
  state = hitlReducer(state, { type: 'save-edit', now })
  state = hitlReducer(state, { type: 'share', now })
  assert.equal(state.sharedText, 'Hold rollout until staging is green.')
  assert.equal(state.draftText, '')
  assert.equal(hasHitlNotification(state, now), false)
  assert.equal(state.toastDismissed, false)
  assert.equal(hitlReducer(state, { type: 'share', now }), state)
})

test('reject records one private decision without deleting the draft or publishing', () => {
  const review = deliver()
  const rejectedAt = review.deliveryAt + 1000
  const state = hitlReducer(review, { type: 'reject', now: rejectedAt })
  assert.equal(state.phase, 'rejected')
  assert.equal(state.draftText, review.draftText)
  assert.equal(state.expiresAt, review.expiresAt)
  assert.equal(state.rejectedAt, rejectedAt)
  assert.equal(state.rejectionExpiresAt, rejectedAt + 31 * 86400000)
  assert.equal(state.editText, null)
  assert.equal(state.unread, false)
  assert.equal(state.sharedText, undefined)
  assert.equal(hasHitlNotification(state, rejectedAt), true)
  assert.equal(state.toastDismissed, false)
  assert.equal(hitlReducer(state, { type: 'share', now: rejectedAt }), state)
  assert.equal(hitlReducer(state, { type: 'reject', now: rejectedAt + 1 }), state)
  assert.equal(hitlReducer(state, { type: 'edit', now: rejectedAt }), state)
  assert.deepEqual(restoreHitlState(JSON.stringify(state), rejectedAt), state)
})

test('rejection cannot record a decision for an expired review', () => {
  const review = deliver()
  const state = hitlReducer(review, { type: 'reject', now: review.expiresAt })
  assert.equal(state.phase, 'expired')
  assert.equal(state.rejectedAt, undefined)
})

test('the original draft expires independently of the later rejection message', () => {
  const review = deliver()
  const rejected = hitlReducer(review, { type: 'reject', now: review.expiresAt - 1000 })
  const restored = restoreHitlState(JSON.stringify(rejected), review.expiresAt)
  assert.equal(restored.phase, 'rejected')
  assert.equal(restored.draftText, '')
  assert.equal(restored.rejectedAt, rejected.rejectedAt)
  assert.ok(restored.rejectionExpiresAt > review.expiresAt)
  assert.equal(hasHitlNotification(restored, review.expiresAt), false)
})

test('read state is shared, but dismissing a delivered toast does not mark the message read', () => {
  const state = deliver()
  const dismissed = hitlReducer(state, { type: 'dismiss-toast' })
  assert.equal(dismissed.unread, true)
  const read = hitlReducer(dismissed, { type: 'read', now })
  assert.equal(read.unread, false)
  assert.equal(hasHitlNotification(read, now), true)
})

test('notification expires before message; expiry survives restore and blocks stale approval', () => {
  const state = deliver()
  const notificationEnd = state.notificationExpiresAt
  assert.equal(hasHitlNotification(state, notificationEnd - 1), true)
  assert.equal(hasHitlNotification(state, notificationEnd), false)
  assert.equal(restoreHitlState(JSON.stringify(state), notificationEnd).phase, 'review')
  const expired = hitlReducer(state, { type: 'share', now: state.expiresAt })
  assert.equal(expired.phase, 'expired')
  assert.equal(expired.sharedText, undefined)
  assert.equal(expired.draftText, '')
  assert.equal(expired.toastDismissed, false)
  assert.equal(restoreHitlState(JSON.stringify(state), state.expiresAt).phase, 'expired')
})

test('reload restores an active review; corrupt storage resets safely', () => {
  const state = deliver()
  assert.deepEqual(restoreHitlState(JSON.stringify(state), now), state)
  assert.deepEqual(restoreHitlState('{broken', now), initialHitlState)
  assert.deepEqual(restoreHitlState('{"phase":"review"}', now), initialHitlState)
})

test('duplicate requests and obsolete delivery timers cannot replace an active review', () => {
  const state = deliver()
  assert.equal(request(state), state)
  const pending = request()
  assert.equal(hitlReducer(pending, { type: 'deliver', id: 'old-request', now }), pending)
})

test('blank edits cannot be saved and cancel preserves the original response', () => {
  let state = hitlReducer(deliver(), { type: 'edit', now })
  state = hitlReducer(state, { type: 'change-draft', text: '  ', now })
  assert.equal(hitlReducer(state, { type: 'save-edit', now }), state)
  state = hitlReducer(state, { type: 'cancel-edit', now })
  assert.equal(state.draftText, 'Kevin owns JIRA-4593.')
  assert.equal(state.editText, null)
})
