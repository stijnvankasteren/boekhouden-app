'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { formatCurrency, formatDate } from '@/lib/vat'
import { Transaction } from '@prisma/client'

interface DashboardData {
  totalIncome: number
  totalExpenses: number
  result: number
  recentTransactions: (Transaction & { relation: any })[]
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear())

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings')
        if (response.ok) {
          const settings = await response.json()
          setFiscalYear(settings.fiscalYear)
        }
      } catch (err) {
        console.error('Error fetching settings:', err)
      }
    }

    fetchSettings()
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/dashboard?year=${fiscalYear}`)
        if (!response.ok) throw new Error('Fout bij ophalen data')

        const result = await response.json()
        setData(result)
      } catch (err) {
        setError('Fout bij ophalen dashboard data')
      } finally {
        setLoading(false)
      }
    }

    if (fiscalYear) {
      fetchData()
    }
  }, [fiscalYear])

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!data) return null

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Overzicht boekjaar ${fiscalYear}`}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            Totale Omzet
          </h3>
          <p className="text-3xl font-bold text-green-600">
            {formatCurrency(data.totalIncome)}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            Totale Kosten
          </h3>
          <p className="text-3xl font-bold text-red-600">
            {formatCurrency(data.totalExpenses)}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Resultaat</h3>
          <p
            className={`text-3xl font-bold ${
              data.result >= 0 ? 'text-blue-600' : 'text-red-600'
            }`}
          >
            {formatCurrency(data.result)}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Recente Transacties</h2>
          <Link href="/transacties" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            Bekijk alle →
          </Link>
        </div>

        {data.recentTransactions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            Nog geen transacties
          </p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Beschrijving</th>
                  <th>Relatie</th>
                  <th>Type</th>
                  <th className="text-right">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.date)}</td>
                    <td>{transaction.description}</td>
                    <td>{transaction.relation?.name || '-'}</td>
                    <td>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          transaction.type === 'INCOME'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {transaction.type === 'INCOME' ? 'Omzet' : 'Kosten'}
                      </span>
                    </td>
                    <td className="text-right font-medium">
                      {formatCurrency(transaction.amountExclVat)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
