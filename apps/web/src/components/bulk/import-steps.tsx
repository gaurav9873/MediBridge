'use client'

import { copy } from '@medibridge/copy'
import { Card, CardBody, CardHeader } from '@medibridge/ui'
import * as React from 'react'

const c = copy.inventory.bulkUpload

/**
 * The five steps, stated once.
 *
 * Before this, the only explanation of how an import works was buried in the
 * Help panel and inferable from a status chip after the fact. The two things
 * people get wrong — that the template's guidance rows have to be deleted, and
 * that nothing is written until they confirm — are now said before they upload
 * rather than discovered from an error report afterwards.
 */
export function ImportSteps(): React.JSX.Element {
  return (
    <Card>
      <CardHeader title={c.stepsHeading} />
      <CardBody>
        <ol className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          {c.steps.map((step, index) => (
            <li key={step.title} className="flex flex-1 gap-3">
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white dark:bg-brand-400 dark:text-brand-950"
              >
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-content-primary">{step.title}</span>
                <span className="text-sm text-content-secondary">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  )
}
