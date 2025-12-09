'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { TransactionFormData, TransactionType, VatRate } from '@/lib/types'
import { Relation } from '@prisma/client'
import { calculateVatAmount, calculateAmountInclVat, formatCurrency } from '@/lib/vat'

export default function EditTransactionPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [relations, setRelations] = useState<Relation[]>([])
  const [formData, setFormData] = useState<TransactionFormData>({
    date: '',
    description: '',
    relationId: '',
    type: TransactionType.INCOME,
    amountExclVat: 0,
    vatRate: VatRate.HIGH,
    category: '',
  })

  const [calculatedAmounts, setCalculatedAmounts] = useState({
    vatAmount: 0,
    amountInclVat: 0,
  })

  useEffect(() => {
    const fetchRelations = async () => {
      try {
        const response = await fetch('/api/relations')
        if (response.ok) {
          const data = await response.json()
          setRelations(data)
        }
      } catch (err) {
        console.error('Error fetching relations:', err)
      }
    }

    fetchRelations()
    fetchTransaction()
  }, [params.id])

  const fetchTransaction = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/transactions/${params.id}`)
      if (!response.ok) throw new Error('Fout bij ophalen transactie')

      const data = await response.json()
      setFormData({
        date: new Date(data.date).toISOString().split('T')[0],
        description: data.description,
        relationId: data.relationId || '',
        type: data.type,
        amountExclVat: data.amountExclVat,
        vatRate: data.vatRate,
        category: data.category || '',
      })
    } catch (err) {
      setError('Fout bij ophalen transactie')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const vatAmount = calculateVatAmount(formData.amountExclVat, formData.vatRate)
    const amountInclVat = calculateAmountInclVat(formData.amountExclVat, vatAmount)
    setCalculatedAmounts({ vatAmount, amountInclVat })
  }, [formData.amountExclVat, formData.vatRate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setSaving(true)
      setError('')

      const dataToSend = {
        ...formData,
        relationId: formData.relationId || undefined,
        category: formData.category || undefined,
      }

      const response = await fetch(`/api/transactions/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      })

      if (!response.ok) throw new Error('Fout bij bijwerken transactie')

      router.push('/transacties')
    } catch (err) {
      setError('Fout bij bijwerken transactie')
      setSaving(false)
    }
  }

  const handleChange = (field: keyof TransactionFormData, value: any) => {
    setFormData({ ...formData, [field]: value })
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="Transactie bewerken"
        description="Pas de gegevens van deze transactie aan"
      />

      {error && (
        <div className="mb-6">
          <ErrorMessage message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="card max-w-3xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">
                Datum <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                className="input"
                value={formData.date}
                onChange={(e) => handleChange('date', e.target.value)}
              />
            </div>

            <div>
              <label className="label">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                required
                className="input"
                value={formData.type}
                onChange={(e) =>
                  handleChange('type', e.target.value as TransactionType)
                }
              >
                <option value="INCOME">Omzet</option>
                <option value="EXPENSE">Kosten</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label">
                Beschrijving <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className="input"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Relatie</label>
              <select
                className="input"
                value={formData.relationId}
                onChange={(e) => handleChange('relationId', e.target.value)}
              >
                <option value="">Geen relatie</option>
                {relations.map((relation) => (
                  <option key={relation.id} value={relation.id}>
                    {relation.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Categorie</label>
              <input
                type="text"
                className="input"
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
              />
            </div>

            <div>
              <label className="label">
                Bedrag excl. BTW <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                step="0.01"
                min="0"
                className="input"
                value={formData.amountExclVat}
                onChange={(e) =>
                  handleChange('amountExclVat', parseFloat(e.target.value) || 0)
                }
              />
            </div>

            <div>
              <label className="label">
                BTW-tarief <span className="text-red-500">*</span>
              </label>
              <select
                required
                className="input"
                value={formData.vatRate}
                onChange={(e) =>
                  handleChange('vatRate', e.target.value as VatRate)
                }
              >
                <option value="NONE">0%</option>
                <option value="LOW">9%</option>
                <option value="HIGH">21%</option>
              </select>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Berekende bedragen</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">BTW-bedrag</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(calculatedAmounts.vatAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Bedrag incl. BTW</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(calculatedAmounts.amountInclVat)}
                </p>
              </div>
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
