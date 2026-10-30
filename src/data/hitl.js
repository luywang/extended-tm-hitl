export const hitlScenario = {
  chatId: 23,
  prompt: 'Draft a launch readiness update from this chat. Include the open blocker, rollout gates, and next checkpoint. Let me review it before sharing.',
  preview: 'Your launch update is ready to review. Only you can see this draft.',
  rejection: 'You rejected this launch update. I haven\'t shared it with the group.',
  draft: [
    'April 25 launch readiness',
    '',
    'JIRA-4593: the guest-tenant expired-token fix is in draft. Kevin owns the fix; Emma will rerun smoke tests after it lands.',
    '',
    'Rollout: 10% to 50% to 100%, gated on <0.5% error rate, no open P1s, and green smoke tests.',
    '',
    'Next checkpoint: Friday, 9 AM PT. Rachel owns the go/no-go call; James owns telemetry.',
    '',
    'Recommendation: keep the launch conditional until JIRA-4593 is verified in staging.',
  ].join('\n'),
}
