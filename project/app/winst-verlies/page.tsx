'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { formatCurrency } from '@/lib/vat'
import { Transaction } from '@prisma/client'

interface CategoryTotal {
  category: string
  amount: number
}

export default function ProfitLossPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [year, setYear] = useState<number>(new Date().getFullYear())

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

    fetchSettings()
  }, [])

  useEffect(() => {
    if (year) {
      fetchTransactions()
    }
  }, [year])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/transactions?year=${year}`)
      if (!response.ok) throw new Error('Fout bij ophalen transacties')

      const data = await response.json()
      setTransactions(data)
    } catch (err) {
      setError('Fout bij ophalen transacties')
    } finally {
      setLoading(false)
    }
  }

  const incomeTransactions = transactions.filter((t) => t.type === 'INCOME')
  const expenseTransactions = transactions.filter((t) => t.type === 'EXPENSE')

  const totalIncome = incomeTransactions.reduce(
    (sum, t) => sum + t.amountExclVat,
    0
  )
  const totalExpenses = expenseTransactions.reduce(
    (sum, t) => sum + t.amountExclVat,
    0
  )
  const result = totalIncome - totalExpenses

  const getIncomeByCategory = (): CategoryTotal[] => {
    const categoryMap = new Map<string, number>()

    incomeTransactions.forEach((t) => {
      const category = t.category || 'Overig'
      categoryMap.set(category, (categoryMap.get(category) || 0) + t.amountExclVat)
    })

    return Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }

  const getExpensesByCategory = (): CategoryTotal[] => {
    const categoryMap = new Map<string, number>()

    expenseTransactions.forEach((t) => {
      const category = t.category || 'Overig'
      categoryMap.set(category, (categoryMap.get(category) || 0) + t.amountExclVat)
    })

    return Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />

  return (
    <div>
      <PageHeader
        title="Winst & Verlies"
        description={`Overzicht boekjaar ${year}`}
      />

      <div className="mb-6 card max-w-xs">
        <label className="label">Selecteer jaar</label>
        <input
          type="number"
          className="input"
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            Totale Omzet
          </h3>
          <p className="text-3xl font-bold text-green-600">
            {formatCurrency(totalIncome)}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            Totale Kosten
          </h3>
          <p className="text-3xl font-bold text-red-600">
            {formatCurrency(totalExpenses)}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Resultaat</h3>
          <p
            className={`text-3xl font-bold ${
              result >= 0 ? 'text-blue-600' : 'text-red-600'
            }`}
          >
            {formatCurrency(result)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Omzet per categorie</h3>
          {getIncomeByCategory().length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Geen omzet gevonden
            </p>
          ) : (
            <div className="space-y-4">
              {getIncomeByCategory().map(({ category, amount }) => (
                <div
                  key={category}
                  className="flex justify-between items-center pb-2 border-b"
                >
                  <span className="text-gray-700">{category}</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(amount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 font-bold">
                <span>Totaal omzet</span>
                <span className="text-green-600">
                  {formatCurrency(totalIncome)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Kosten per categorie</h3>
          {getExpensesByCategory().length === 0 ? (
            <p className="text-gray-500 text-center py-8">Geen kosten gevonden</p>
          ) : (
            <div className="space-y-4">
              {getExpensesByCategory().map(({ category, amount }) => (
                <div
                  key={category}
                  className="flex justify-between items-center pb-2 border-b"
                >
                  <span className="text-gray-700">{category}</span>
                  <span className="font-semibold text-red-600">
                    {formatCurrency(amount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 font-bold">
                <span>Totaal kosten</span>
                <span className="text-red-600">
                  {formatCurrency(totalExpenses)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card mt-6">
        <div className="flex justify-between items-center text-xl font-bold">
          <span>Netto resultaat</span>
          <span className={result >= 0 ? 'text-blue-600' : 'text-red-600'}>
            {formatCurrency(result)}
          </span>
        </div>
      </div>
    </div>
  )
}
