/** Records every message and extracts the magic-link token from the last one. */
export function createFakeMailer({ fail = false } = {}) {
  const sent = []
  return {
    kind: 'fake',
    sent,
    async send(message) {
      if (fail) return { sent: false, reason: 'fake_failure' }
      sent.push(message)
      return { sent: true, messageId: `fake-${sent.length}` }
    },
    lastToken() {
      const last = sent[sent.length - 1]
      return last ? last.text.match(/#([a-f0-9]{64})/)?.[1] : null
    },
  }
}
