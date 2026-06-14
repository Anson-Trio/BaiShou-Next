import { describe, it, expect } from 'vitest'
import { StreamAccumulator } from '../agent/stream-accumulator'

describe('StreamAccumulator text getter', () => {
  it('strips leaked message-content wrapper from streamed assistant text', () => {
    const acc = new StreamAccumulator()
    acc.add({
      type: 'text-delta',
      textDelta:
        '<message-time>2026-06-15 02:55</message-time>\n<message-content>\n哈哈\n</message-content>'
    } as any)
    expect(acc.text).toBe('哈哈')
  })
})
