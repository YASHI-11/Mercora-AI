import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Archive, Bath, Box, CakeSlice, ChefHat, Clock, DoorOpen, Egg, Flame, Flower2, Frame, Gem, Gift, Mail,
  Package, PartyPopper, PawPrint, PenLine, Sandwich, ShoppingBag, Signpost, Sofa, Sparkles, ToyBrick,
  TreePine, Umbrella, UtensilsCrossed, Wallet,
} from 'lucide-react'

// Products whose image URL is empty or fails to load get a generated tile.
// Nothing here names a category: the taxonomy lives in the database, so the
// tile's colour is derived from a hash of the category name and its icon from
// words in the subcategory/name. Rendered locally -- no network request, so
// it can never be a broken image.
const ICON_KEYWORDS: [RegExp, LucideIcon][] = [
  [/clock/i, Clock], [/cushion|throw|furniture/i, Sofa], [/door|hook/i, DoorOpen], [/frame|album|mirror/i, Frame],
  [/light|candle|lantern|lamp/i, Flame], [/christmas/i, TreePine], [/easter|egg/i, Egg],
  [/party|birthday|balloon/i, PartyPopper], [/bak|cake/i, CakeSlice], [/textile|apron|towel/i, ChefHat],
  [/storage|jar|tin/i, Archive], [/table|mug|tea|glass|kitchen|dining/i, UtensilsCrossed],
  [/lunch/i, Sandwich], [/purse|wallet|travel/i, Wallet], [/bag|tote/i, ShoppingBag], [/card/i, Mail],
  [/wrap|gift/i, Gift], [/pen|paper|notebook|sticker|craft|sewing/i, PenLine], [/toy|game|kid|baby/i, ToyBrick],
  [/jewel|necklace|bracelet|earring|ring|brooch|charm|hair/i, Gem], [/umbrella|rain/i, Umbrella],
  [/garden|plant|bird|flower/i, Flower2], [/bath|beauty/i, Bath], [/pet/i, PawPrint], [/sign|wall art/i, Signpost],
  [/decor|ornament|hanging|fragrance/i, Sparkles], [/box/i, Box],
]

// [from, to, ink] -- soft enough to sit under the gold/ink theme.
const PALETTES: [string, string, string][] = [
  ['#fbf3e4', '#f0dcb8', '#966826'], ['#eef6f1', '#cfe6d8', '#2f6b4f'], ['#fdeeee', '#f6cfcf', '#9b3434'],
  ['#eef2fb', '#d2dcf3', '#34508f'], ['#f5effb', '#e0d2f1', '#6a4596'], ['#fff6e0', '#fde3a7', '#9a6a08'],
  ['#fbeef5', '#f2d0e2', '#8f3765'], ['#f0f7e8', '#d6e8c2', '#4c7426'], ['#eaf6f8', '#c9e7ec', '#2b6d7a'],
  ['#f3f0ea', '#e2d9c8', '#6b5a3a'],
]
const NEUTRAL_PALETTE: [string, string, string] = ['#f4f4f5', '#e4e4e7', '#52525b']

function hash(text: string) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

export default function ProductImage({ src, name, category, subcategory, className = '', compact = false }: {
  src?: string
  name: string
  category?: string
  subcategory?: string
  className?: string
  /** Thumbnail sizes (cart rows, chat, tables): icon only, no label. */
  compact?: boolean
}) {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)}
                className={`object-cover ${className}`} />
  }

  const [from, to, ink] = category ? PALETTES[hash(category) % PALETTES.length] : NEUTRAL_PALETTE
  const iconText = `${subcategory ?? ''} ${category ?? ''} ${name}`
  const Icon = ICON_KEYWORDS.find(([pattern]) => pattern.test(iconText))?.[1] ?? Package
  // Per-product variation so neighbouring tiles in the same subcategory differ.
  const h = hash(name)
  const angle = 120 + (h % 90)
  const label = subcategory && subcategory !== category ? subcategory : category

  return (
    <div role="img" aria-label={name}
         className={`relative flex items-center justify-center overflow-hidden ${className}`}
         style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }}>
      <Icon aria-hidden className="absolute opacity-[0.08]"
            style={{ color: ink, width: '85%', height: '85%', transform: `rotate(${(h % 40) - 20}deg)`,
                     right: `${-10 - (h % 15)}%`, bottom: `${-12 - (h % 10)}%` }} />
      <Icon aria-hidden strokeWidth={1.5} style={{ color: ink, width: compact ? '55%' : '34%', height: compact ? '55%' : '34%' }} />
      {!compact && label && (
        <span className="absolute bottom-2.5 left-2.5 right-2.5 truncate text-center text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: ink }}>
          {label}
        </span>
      )}
    </div>
  )
}
