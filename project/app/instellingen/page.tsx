'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { CompanySettings } from '@prisma/client'

export default function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/settings')
      if (!response.ok) throw new Error('Fout bij ophalen instellingen')

      const data = await response.json()
      setSettings(data)
    } catch (err) {
      setError('Fout bij ophalen instellingen')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!settings) return

    try {
      setSaving(true)
      setError('')
      setSuccess(false)

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!response.ok) throw new Error('Fout bij opslaan instellingen')

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError('Fout bij opslaan instellingen')
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (field: keyof CompanySettings, value: any) => {
    if (!settings) return
    setSettings({ ...settings, [field]: value })
  }

  if (loading) return <LoadingSpinner />
  if (!settings) return null

  return (
    <div>
      <PageHeader
        title="Bedrijfsinstellingen"
        description="Beheer de gegevens van uw bedrijf"
      />

      {error && (
        <div className="mb-6">
          <ErrorMessage message={error} />
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          <p className="text-sm">Instellingen succesvol opgeslagen</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card max-w-3xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="label">
                Bedrijfsnaam <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className="input"
                value={settings.companyName}
                onChange={(e) => handleChange('companyName', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Contactpersoon</label>
              <input
                type="text"
                className="input"
                value={settings.contactPerson || ''}
                onChange={(e) => handleChange('contactPerson', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Telefoon</label>
              <input
                type="tel"
                className="input"
                value={settings.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
            </div>

            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                value={settings.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Website</label>
              <input
                type="url"
                className="input"
                value={settings.website || ''}
                onChange={(e) => handleChange('website', e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">Adres</label>
              <input
                type="text"
                className="input"
                value={settings.address || ''}
                onChange={(e) => handleChange('address', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Postcode</label>
              <input
                type="text"
                className="input"
                value={settings.postalCode || ''}
                onChange={(e) => handleChange('postalCode', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Plaats</label>
              <input
                type="text"
                className="input"
                value={settings.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
              />
            </div>

            <div>
              <label className="label">KvK-nummer</label>
              <input
                type="text"
                className="input"
                value={settings.kvkNumber || ''}
                onChange={(e) => handleChange('kvkNumber', e.target.value)}
              />
            </div>

            <div>
              <label className="label">BTW-ID</label>
              <input
                type="text"
                className="input"
                value={settings.vatId || ''}
                onChange={(e) => handleChange('vatId', e.target.value)}
              />
            </div>

            <div>
              <label className="label">IBAN</label>
              <input
                type="text"
                className="input"
                value={settings.iban || ''}
                onChange={(e) => handleChange('iban', e.target.value)}
              />
            </div>

            <div>
              <label className="label">
                Standaard betalingstermijn (dagen){' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                className="input"
                value={settings.defaultPaymentTermDays}
                onChange={(e) =>
                  handleChange('defaultPaymentTermDays', parseInt(e.target.value))
                }
              />
            </div>

            <div>
              <label className="label">
                Boekjaar <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="2000"
                max="2100"
                className="input"
                value={settings.fiscalYear}
                onChange={(e) =>
                  handleChange('fiscalYear', parseInt(e.target.value))
                }
              />
            </div>
          </div>

          <div className="flex justify-end">
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
