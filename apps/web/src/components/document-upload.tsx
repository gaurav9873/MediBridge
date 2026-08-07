'use client'

import type { FieldHelp } from '@medibridge/copy'
import { Alert, Button, Card, CardBody, CardHeader, TextField, notify } from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Upload } from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

interface DocumentSummary {
  id: string
  type: 'DRUG_LICENSE' | 'GST_CERTIFICATE'
  number: string
  expiresOn: string | null
  fileName: string
  sizeBytes: number
  verificationStatus: string
  rejectionReason: string | null
}

export interface DocumentUploadProps {
  type: 'DRUG_LICENSE' | 'GST_CERTIFICATE'
  field: FieldHelp
  numberField: FieldHelp
  /** Only a drug licence has one. */
  expiryField?: FieldHelp
  uploaded: boolean
}

/**
 * One document, uploaded or replaced.
 *
 * Shows what is already on file rather than an empty form, because the common
 * case after a rejection is replacing a blurry photo — and being told what the
 * reviewer objected to, next to the button that fixes it, is the difference
 * between one round trip and three.
 */
export function DocumentUpload({
  type,
  field,
  numberField,
  expiryField,
  uploaded,
}: DocumentUploadProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [number, setNumber] = React.useState('')
  const [expiresOn, setExpiresOn] = React.useState('')
  const [fileName, setFileName] = React.useState<string>()
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  const documents = useQuery({
    queryKey: ['onboarding', 'documents'],
    queryFn: () => api.get<DocumentSummary[]>('/onboarding/documents'),
  })
  const existing = documents.data?.find((document) => document.type === type)

  const upload = useMutation({
    mutationFn: async () => {
      const file = inputRef.current?.files?.[0]
      if (!file) {
        throw new ApiClientError({
          code: 'VALIDATION_FAILED',
          message: 'Please choose a file to upload.',
          status: 400,
          fields: [{ field: 'file', message: 'Please choose a file to upload.' }],
        })
      }

      const body = new FormData()
      body.append('type', type)
      body.append('number', number)
      if (expiresOn) body.append('expiresOn', expiresOn)
      body.append('file', file)
      return api.postForm<DocumentSummary>('/onboarding/documents', body)
    },
    onSuccess: () => {
      notify.success('Uploaded. We will check it and let you know.')
      setFieldErrors({})
      void queryClient.invalidateQueries({ queryKey: ['onboarding'] })
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.fields?.length) {
        setFieldErrors(Object.fromEntries(error.fields.map((f) => [f.field, f.message])))
        return
      }
      notify.error(error instanceof ApiClientError ? error.message : undefined)
    },
  })

  const title = type === 'DRUG_LICENSE' ? 'Drug Licence' : 'GST Certificate'

  return (
    <Card>
      <CardHeader
        title={title}
        description={uploaded ? 'On file. Upload again to replace it.' : field.helperText}
      />
      <CardBody>
        <div className="flex flex-col gap-4">
          {existing?.verificationStatus === 'REJECTED' ? (
            <Alert tone="danger" title="This document was not accepted.">
              {existing.rejectionReason ?? 'Please upload a clearer copy.'}
            </Alert>
          ) : existing ? (
            <div className="flex items-center gap-2 text-sm text-content-secondary">
              <CheckCircle2 className="size-4 text-success-600" aria-hidden />
              <span>
                {existing.fileName} · {existing.number}
                {existing.expiresOn ? ` · valid until ${existing.expiresOn}` : ''} ·{' '}
                {existing.verificationStatus === 'APPROVED' ? 'approved' : 'waiting for review'}
              </span>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault()
              upload.mutate()
            }}
            className="flex flex-col gap-4"
            noValidate
          >
            <TextField
              field={numberField}
              required
              error={fieldErrors.number}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />

            {expiryField ? (
              <TextField
                field={expiryField}
                required
                type="date"
                error={fieldErrors.expiresOn}
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
              />
            ) : null}

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-content-primary" htmlFor={`file-${type}`}>
                {field.label}
              </label>
              <input
                ref={inputRef}
                id={`file-${type}`}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setFileName(event.target.files?.[0]?.name)}
                className="block w-full rounded-[--radius-md] border border-border-default p-2 text-sm file:mr-3 file:rounded-[--radius-sm] file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-white"
              />
              <p className="text-sm text-content-secondary">
                {fieldErrors.file ?? field.helperText}
              </p>
              {fileName ? (
                <p className="text-sm text-content-primary">Selected: {fileName}</p>
              ) : null}
            </div>

            <Button type="submit" variant="secondary" icon={<Upload />} loading={upload.isPending}>
              {existing ? 'Replace' : 'Upload'}
            </Button>
          </form>
        </div>
      </CardBody>
    </Card>
  )
}
