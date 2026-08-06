import { en } from './en/index.js'

export type {
  EmptyState,
  FieldHelp,
  HelpTopic,
  OnboardingStep,
  OnboardingTour,
  PageHelp,
  PageMeta,
} from './types.js'

/**
 * Locales the product can ship. MVP is English only; the rest of the codebase
 * is written so adding one is a new folder, not a refactor.
 */
export const LOCALES = ['en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

/**
 * The shape every locale must satisfy. Derived from English, so a new
 * translation that misses a key fails to compile rather than falling back
 * silently at runtime.
 */
export type CopyTree = typeof en

const locales: Record<Locale, CopyTree> = { en }

/**
 * All user-facing text.
 *
 * Import this rather than writing strings inline:
 *
 *   import { copy } from '@medibridge/copy'
 *   <Button>{copy.common.actions.save}</Button>
 *
 * When a second locale arrives this becomes `useCopy()` reading from context;
 * every call site above keeps working unchanged.
 */
export const copy: CopyTree = locales[DEFAULT_LOCALE]

/** Explicit lookup, for the server rendering in a user's chosen language. */
export function getCopy(locale: Locale = DEFAULT_LOCALE): CopyTree {
  return locales[locale] ?? locales[DEFAULT_LOCALE]
}

export { en }
