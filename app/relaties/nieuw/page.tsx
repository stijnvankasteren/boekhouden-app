'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import ErrorMessage from '@/components/ErrorMessage'
import { RelationFormData } from '@/lib/types'

export default function NewRelationPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState<RelationFormData>({
    name: '',
    address: '',
    postalCode: '',
    city: '',
    phone: '',
    email: '',
    vatNumber: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setSaving(true)
      setError('')

      const response = await fetch('/api/relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) throw new Error('Fout bij aanmaken relatie')

      router.push('/relaties')
    } catch (err) {
      setError('Fout bij aanmaken relatie')
      setSaving(false)
    }
  }

  const handleChange = (field: keyof RelationFormData, value: string) => {
    setFormData({ ...formData, [field]: value })
  }

  return (
    <div>
      <PageHeader title="Nieuwe relatie" description="Voeg een nieuwe relatie toe" />

      {error && (
        <div className="mb-6">
          <ErrorMessage message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="card max-w-3xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="label">
                Naam <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className="input"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">Adres</label>
              <input
                type="text"
                className="input"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Postcode</label>
              <input
                type="text"
                className="input"
                value={formData.postalCode}
                onChange={(e) => handleChange('postalCode', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Plaats</label>
              <input
                type="text"
                className="input"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Telefoon</label>
              <input
                type="tel"
                className="input"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
            </div>

            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
            </div>

            <div>
              <label className="label">BTW-nummer</label>
              <input
                type="text"
                className="input"
                value={formData.vatNumber}
                onChange={(e) => handleChange('vatNumber', e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">Notities</label>
              <textarea
                rows={4}
                className="input"
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
