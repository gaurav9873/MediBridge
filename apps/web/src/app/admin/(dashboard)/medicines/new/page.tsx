'use client'

import { copy } from '@medibridge/copy'
import type { MedicineInput } from '@medibridge/types'
import { PageShell, notify } from '@medibridge/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { MedicineForm } from '@/components/medicine-form'
import { medicineKeys, medicinesApi } from '@/lib/medicines'

const c = copy.admin.medicines

/**
 * Adding a medicine to the shared catalogue.
 *
 * The mutation deliberately does not swallow its error: MedicineForm catches
 * it and puts the server's message against the field it belongs to. A name
 * that clashes with an existing medicine is a sentence under the name box, not
 * a toast that vanishes before it can be read.
 */
export default function NewMedicinePage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: (input: MedicineInput) => medicinesApi.create(input),
    onSuccess: (medicine) => {
      void queryClient.invalidateQueries({ queryKey: medicineKeys.all })
      notify.success(c.success.created)
      // Straight to the medicine that was just created: the next thing anyone
      // does is check it reads correctly, or look for duplicates of it.
      router.push(`/admin/medicines/${medicine.id}`)
    },
  })

  return (
    <PageShell
      page={c.form.addPage}
      help={c.form.addHelp}
      secondaryAction={{ label: c.form.cancel, onClick: () => router.push('/admin/medicines') }}
    >
      <MedicineForm
        submitLabel={c.form.submitAdd}
        isSubmitting={create.isPending}
        onSubmit={(values) => create.mutateAsync(values)}
        onCancel={() => router.push('/admin/medicines')}
      />
    </PageShell>
  )
}
