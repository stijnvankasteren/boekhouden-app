'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { formatCurrency } from '@/lib/vat'
import { VatReportData } from '@/lib/types'

export default function VatReportPage() {
  const [reportData, setReportData] = useState<VatReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [quarter, setQuarter] = useState<number>(1)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings')
        if (response.ok) {
          const settings = await response.json()
          setYear(settings.fiscalYear)
        }
      } catch (err) {
        console.error('Error fetching settings:', err)
      }
    }

    const currentMonth = new Date().getMonth() + 1
    const currentQuarter = Math.ceil(currentMonth / 3)
    setQuarter(currentQuarter)

    fetchSettings()
  }, [])

  useEffect(() => {
    if (year && quarter) {
      fetchReport()
    }
  }, [year, quarter])

  const fetchReport = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `/api/reports/vat?year=${year}&quarter=${quarter}`
      )
      if (!response.ok) throw new Error('Fout bij ophalen BTW-rapport')

      const data = await response.json()
      setReportData(data)
    } catch (err) {
      setError('Fout bij ophalen BTW-rapport')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!reportData) return null

  const totalVatIncome = reportData.income21.vat + reportData.income9.vat
  const totalVatExpense = reportData.expense21.vat + reportData.expense9.vat

  return (
    <div>
      <PageHeader
        title="BTW Rapport"
        description="Overzicht voor BTW-aangifte"
      />

      <div className="card mb-6 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Jaar</label>
            <input
              type="number"
              className="input"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Kwartaal</label>
            <select
              className="input"
              value={quarter}
              onChange={(e) => setQuarter(parseInt(e.target.value))}
            >
              <option value={1}>Q1 (Jan - Mrt)</option>
              <option value={2}>Q2 (Apr - Jun)</option>
              <option value={3}>Q3 (Jul - Sep)</option>
              <option value={4}>Q4 (Okt - Dec)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 text-green-700">
            BTW Omzet (te betalen)
          </h3>
          <div className="space-y-4">
            <div className="border-b pb-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Omzet 21% BTW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Grondslag:</span>
                <span className="font-medium">
                  {formatCurrency(reportData.income21.base)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">BTW-bedrag:</span>
                <span className="font-semibold text-green-600">
                  {formatCurrency(reportData.income21.vat)}
                </span>
              </div>
            </div>

            <div className="border-b pb-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Omzet 9% BTW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Grondslag:</span>
                <span className="font-medium">
                  {formatCurrency(reportData.income9.base)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">BTW-bedrag:</span>
                <span className="font-semibold text-green-600">
                  {formatCurrency(reportData.income9.vat)}
                </span>
              </div>
            </div>

            <div className="border-b pb-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Omzet 0% BTW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Grondslag:</span>
                <span className="font-medium">
                  {formatCurrency(reportData.income0.base)}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex justify-between font-bold text-lg">
                <span>Totaal BTW omzet:</span>
                <span className="text-green-600">
                  {formatCurrency(totalVatIncome)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4 text-blue-700">
            BTW Inkoop (voorbelasting)
          </h3>
          <div className="space-y-4">
            <div className="border-b pb-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Inkoop 21% BTW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Grondslag:</span>
                <span className="font-medium">
                  {formatCurrency(reportData.expense21.base)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">BTW-bedrag:</span>
                <span className="font-semibold text-blue-600">
                  {formatCurrency(reportData.expense21.vat)}
                </span>
              </div>
            </div>

            <div className="border-b pb-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Inkoop 9% BTW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Grondslag:</span>
                <span className="font-medium">
                  {formatCurrency(reportData.expense9.base)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">BTW-bedrag:</span>
                <span className="font-semibold text-blue-600">
                  {formatCurrency(reportData.expense9.vat)}
                </span>
              </div>
            </div>

            <div className="border-b pb-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Inkoop 0% BTW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Grondslag:</span>
                <span className="font-medium">
                  {formatCurrency(reportData.expense0.base)}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex justify-between font-bold text-lg">
                <span>Totaal voorbelasting:</span>
                <span className="text-blue-600">
                  {formatCurrency(totalVatExpense)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card bg-gray-50 border-2 border-gray-300">
        <h3 className="text-xl font-bold mb-4">Resultaat BTW-aangifte</h3>
        <div className="space-y-4">
          <div className="flex justify-between text-lg">
            <span>BTW op omzet (verschuldigd):</span>
            <span className="font-semibold text-green-600">
              {formatCurrency(totalVatIncome)}
            </span>
          </div>
          <div className="flex justify-between text-lg">
            <span>Voorbelasting (aftrekbaar):</span>
            <span className="font-semibold text-blue-600">
              - {formatCurrency(totalVatExpense)}
            </span>
          </div>
          <div className="border-t-2 border-gray-300 pt-4">
            <div className="flex justify-between text-2xl font-bold">
              <span>
                {reportData.totalVatDue >= 0
                  ? 'Te betalen aan Belastingdienst:'
                  : 'Terug te ontvangen:'}
              </span>
              <span
                className={
                  reportData.totalVatDue >= 0 ? 'text-red-600' : 'text-green-600'
                }
              >
                {formatCurrency(Math.abs(reportData.totalVatDue))}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-gray-700">
          <strong>Let op:</strong> Dit rapport is een samenvatting voor intern
          gebruik. Gebruik de officiële BTW-aangifte van de Belastingdienst voor
          het indienen van uw aangifte.
        </p>
      </div>
    </div>
  )
}
