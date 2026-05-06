const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

let lastTime = -1
let lastRandom = 0n

function encode(value: bigint, length: number): string {
  let out = ''
  let input = value
  const base = 32n
  for (let i = 0; i < length; i += 1) {
    const index = Number(input % base)
    out = ENCODING[index] + out
    input /= base
  }
  return out
}

function nextRandom(): bigint {
  const now = Date.now()
  if (now !== lastTime) {
    lastTime = now
    const seed = BigInt(Math.floor(Math.random() * 2 ** 24))
    lastRandom = seed << 56n
    return lastRandom
  }
  lastRandom += 1n
  return lastRandom
}

/**
 * Generates a monotonic ULID-like identifier.
 *
 * Subsequent calls within the same millisecond increment the random suffix to preserve ordering.
 */
export function ulid(): string {
  const timePart = encode(BigInt(Date.now()), 10)
  const randomPart = encode(nextRandom(), 16)
  return `${timePart}${randomPart}`
}
