/**
 * Shapes for the copy layer.
 *
 * Everything a user reads lives in this package — labels, helper text, empty
 * states, success toasts, validation errors, page help and onboarding tours.
 * Two reasons this is worth the indirection:
 *
 *   1. Every word in the product can be reviewed in one place, so nothing
 *      drifts into developer language.
 *   2. Adding Hindi or a regional language later becomes a new folder beside
 *      `en/`, not a rewrite of every component.
 *
 * MVP ships English only.
 */

/**
 * Guidance attached to a single form field.
 *
 * `helperText` is REQUIRED here on purpose. The FormField component in
 * @medibridge/ui also requires it, so a field cannot reach a user without an
 * explanation of what to type.
 */
export interface FieldHelp {
  /** Short label above the input. Plain words. e.g. "Drug License Number" */
  label: string
  /** One short sentence under the input saying exactly what to enter. */
  helperText: string
  /** Greyed-out example inside the empty input. */
  placeholder?: string
  /** Longer explanation behind the ⓘ icon, for rules that need more detail. */
  tooltip?: string
}

/** One question-and-answer pair in a page's Help panel. */
export interface HelpTopic {
  question: string
  answer: string
}

/**
 * The Help panel every page carries. Answers "what is this page for?" and
 * "what do I do here?" without the user having to ask anyone.
 */
export interface PageHelp {
  /** Plain-language description of the page's purpose. */
  whatIsThis: string
  /** Common tasks on this page, phrased as questions a real user would ask. */
  topics: HelpTopic[]
}

/** A single stop in a guided tour. */
export interface OnboardingStep {
  /** Matches the `data-tour` attribute on the element being pointed at. */
  target: string
  title: string
  body: string
}

/**
 * A first-time walkthrough for an important screen. Shown once, dismissible,
 * and re-openable from the Help panel.
 */
export interface OnboardingTour {
  /** Stable id — also the localStorage key recording that it has been seen. */
  id: string
  /** Greeting shown before the first step. */
  intro: {
    title: string
    body: string
    startLabel: string
    skipLabel: string
  }
  steps: OnboardingStep[]
  /** Shown after the last step. */
  outro: {
    title: string
    body: string
    doneLabel: string
  }
}

/**
 * What a screen shows when there is no data yet.
 *
 * `action` is required whenever the user can actually do something about it —
 * an empty state should point at the next step, not just report emptiness.
 */
export interface EmptyState {
  title: string
  body: string
  action?: {
    label: string
    href?: string
  }
  /** Different message when filters/search hid everything, vs. genuinely no data. */
  filteredTitle?: string
  filteredBody?: string
}

/** Page-level heading block rendered by PageShell. */
export interface PageMeta {
  title: string
  subtitle: string
}
