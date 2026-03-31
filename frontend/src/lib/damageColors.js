const CATEGORY_COLOR_MAP = {
  windscreen: [0, 120, 220],
  headlight: [240, 180, 15],
  taillight: [220, 70, 70],
  light: [240, 140, 40],
  mirror: [40, 150, 200],
  bumper: [20, 140, 20],
  'body dent': [185, 115, 25],
}

const FALLBACK_PALETTE = [
  [0, 120, 204],
  [22, 139, 168],
  [74, 163, 22],
  [105, 150, 5],
  [9, 83, 180],
  [7, 98, 161],
  [139, 83, 180],
  [30, 77, 211],
  [29, 81, 165],
  [108, 113, 120],
]

const hashString = (value) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const luminance = ([r, g, b]) => (0.299 * r) + (0.587 * g) + (0.114 * b)

const normalizeCategory = (category) => String(category || '').trim().toLowerCase()

const pickDamageColor = ({ label, category }) => {
  const normalizedCategory = normalizeCategory(category)
  if (CATEGORY_COLOR_MAP[normalizedCategory]) {
    return CATEGORY_COLOR_MAP[normalizedCategory]
  }

  const fallbackKey = String(label || category || 'damage')
  return FALLBACK_PALETTE[hashString(fallbackKey) % FALLBACK_PALETTE.length]
}

export const getDamageChipStyle = ({ label, category }) => {
  const [r, g, b] = pickDamageColor({ label, category })
  const textColor = luminance([r, g, b]) >= 150 ? '#111827' : '#f8fafc'

  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.22)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.65)`,
    color: textColor,
  }
}
