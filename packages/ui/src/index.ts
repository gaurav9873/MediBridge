/**
 * MediBridge design system.
 *
 * Import components from here, never from a deep path — that keeps the public
 * surface reviewable and makes it obvious when something new is added.
 *
 * The components that enforce the product's UX rules:
 *   TextField / SelectField / …  require a FieldHelp object, so no field ships
 *                                without helper text or with hardcoded copy
 *   PageShell                    requires a title, subtitle and Help content
 *   DataView                     requires an empty state
 *   Button                       has built-in double-submit prevention
 *   ResponsiveTable              gives every table a real mobile layout
 *   StatusBadge                  never communicates with colour alone
 */

export { cn } from './lib/cn'

export { Alert, type AlertTone } from './components/alert'
export { AppShell, BottomNav, Sidebar, StickyActionBar, type NavItem } from './components/app-shell'
export { Button, buttonVariants, type ButtonProps } from './components/button'
export { Card, CardBody, CardHeader, StatTile } from './components/card'
export { ConfirmDialog } from './components/confirm-dialog'
export { DataView } from './components/data-view'
export { EmptyState } from './components/empty-state'
export {
  CheckboxField,
  FieldSection,
  FormField,
  SelectField,
  TextAreaField,
  TextField,
  type CheckboxFieldProps,
  type SelectFieldProps,
  type SelectOption,
  type TextAreaFieldProps,
  type TextFieldProps,
} from './components/form-field'
export { HelpPanel } from './components/help-panel'
export {
  OnboardingTour,
  hasSeenTour,
  markTourSeen,
  resetTour,
  useOnboardingTour,
} from './components/onboarding-tour'
export { PageShell } from './components/page-shell'
export {
  ResponsiveTable,
  type Column,
  type ResponsiveTableProps,
} from './components/responsive-table'
export { CardSkeleton, FormSkeleton, Skeleton, TableSkeleton } from './components/skeleton'
export {
  StatusBadge,
  orderStatusPresentation,
  paymentStatusPresentation,
  stockPresentation,
  type StatusTone,
} from './components/status-badge'
export { ToastProvider, notify } from './components/toast'
export { Tooltip, TooltipProvider } from './components/tooltip'
