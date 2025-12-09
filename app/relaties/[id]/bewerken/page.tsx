'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { RelationFormData } from '@/lib/types'

export default function EditRelationPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    fetchRelation()
  }, [params.id])

  const fetchRelation = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/relations/${params.id}`)
      if (!response.ok) throw new Error('Fout bij ophalen relatie')

      const data = await response.json()
      setFormData({
        name: data.name,
        address: data.address || '',
        postalCode: data.postalCode || '',
        city: data.city || '',
        phone: data.phone || '',
        email: data.email || '',
        vatNumber: data.vatNumber || '',
        notes: data.notes || '',
      })
    } catch (err) {
      setError('Fout bij ophalen relatie')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setSaving(true)
      setError('')

      const response = await fetch(`/api/relations/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) throw new Error('Fout bij bijwerken relatie')

      router.push(`/relaties/${params.id}`)
    } catch (err) {
      setError('Fout bij bijwerken relatie')
      setSaving(false)
    }
  }

  const handleChange = (field: keyof RelationFormData, value: string) => {
    setFormData({ ...formData, [field]: value })
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="Relatie bewerken"
        description="Pas de gegevens van deze relatie aan"
      />

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
