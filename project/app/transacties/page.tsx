'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { formatCurrency, formatDate } from '@/lib/vat'
import { Transaction, Relation } from '@prisma/client'

interface TransactionWithRelation extends Transaction {
  relation: Relation | null
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionWithRelation[]>([])
  const [relations, setRelations] = useState<Relation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear())
  const [filters, setFilters] = useState({
    year: '',
    type: '',
    relationId: '',
  })

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings')
        if (response.ok) {
          const settings = await response.json()
          setFiscalYear(settings.fiscalYear)
          setFilters((prev) => ({ ...prev, year: settings.fiscalYear.toString() }))
        }
      } catch (err) {
        console.error('Error fetching settings:', err)
      }
    }

    fetchSettings()
  }, [])

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
  }, [])

  useEffect(() => {
    if (filters.year) {
      fetchTransactions()
    }
  }, [filters])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.year) params.append('year', filters.year)
      if (filters.type) params.append('type', filters.type)
      if (filters.relationId) params.append('relationId', filters.relationId)

      const response = await fetch(`/api/transactions?${params.toString()}`)
      if (!response.ok) throw new Error('Fout bij ophalen transacties')

      const data = await response.json()
      setTransactions(data)
    } catch (err) {
      setError('Fout bij ophalen transacties')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet u zeker dat u deze transactie wilt verwijderen?')) return

    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Fout bij verwijderen transactie')

      fetchTransactions()
    } catch (err) {
      alert('Fout bij verwijderen transactie')
    }
  }

  const totalIncome = transactions
    .filter((t) => t.type === 'INCOME')
    .reduce((sum, t) => sum + t.amountExclVat, 0)

  const totalExpenses = transactions
    .filter((t) => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.amountExclVat, 0)

  const totalVat = transactions.reduce((sum, t) => sum + t.vatAmount, 0)

  return (
    <div>
      <PageHeader
        title="Transacties"
        description="Overzicht van alle inkomsten en uitgaven"
        action={
          <Link href="/transacties/nieuw" className="btn-primary">
            + Nieuwe transactie
          </Link>
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Jaar</label>
            <input
              type="number"
              className="input"
              value={filters.year}
              onChange={(e) =>
                setFilters({ ...filters, year: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            >
              <option value="">Alle</option>
              <option value="INCOME">Omzet</option>
              <option value="EXPENSE">Kosten</option>
            </select>
          </div>
          <div>
            <label className="label">Relatie</label>
            <select
              className="input"
              value={filters.relationId}
              onChange={(e) =>
                setFilters({ ...filters, relationId: e.target.value })
              }
            >
              <option value="">Alle</option>
              {relations.map((relation) => (
                <option key={relation.id} value={relation.id}>
                  {relation.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="card mb-6">
            {transactions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Geen transacties gevonden
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
                      <th className="text-right">Excl. BTW</th>
                      <th className="text-right">BTW %</th>
                      <th className="text-right">BTW</th>
                      <th className="text-right">Incl. BTW</th>
                      <th className="text-right">Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
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
                        <td className="text-right">
                          {formatCurrency(transaction.amountExclVat)}
                        </td>
                        <td className="text-right">
                          {transaction.vatRate === 'NONE'
                            ? '0%'
                            : transaction.vatRate === 'LOW'
                            ? '9%'
                            : '21%'}
                        </td>
                        <td className="text-right">
                          {formatCurrency(transaction.vatAmount)}
                        </td>
                        <td className="text-right font-medium">
                          {formatCurrency(transaction.amountInclVat)}
                        </td>
                        <td className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Link
                              href={`/transacties/${transaction.id}/bewerken`}
                              className="text-blue-600 hover:text-blue-700 text-sm"
                            >
                              Bewerken
                            </Link>
                            <button
                              onClick={() => handleDelete(transaction.id)}
                              className="text-red-600 hover:text-red-700 text-sm"
                            >
                              Verwijderen
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {transactions.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Totalen</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Totale omzet</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(totalIncome)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Totale kosten</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(totalExpenses)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Totale BTW</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(totalVat)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Resultaat</p>
                  <p
                    className={`text-2xl font-bold ${
                      totalIncome - totalExpenses >= 0
                        ? 'text-blue-600'
                        : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(totalIncome - totalExpenses)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
