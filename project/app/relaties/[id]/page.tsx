'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { formatCurrency, formatDate } from '@/lib/vat'
import { Relation, Transaction } from '@prisma/client'

interface RelationWithTransactions extends Relation {
  transactions: Transaction[]
}

export default function RelationDetailPage() {
  const params = useParams()
  const [relation, setRelation] = useState<RelationWithTransactions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchRelation()
  }, [params.id])

  const fetchRelation = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/relations/${params.id}`)
      if (!response.ok) throw new Error('Fout bij ophalen relatie')

      const data = await response.json()
      setRelation(data)
    } catch (err) {
      setError('Fout bij ophalen relatie')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!relation) return null

  const totalIncome = relation.transactions
    .filter((t) => t.type === 'INCOME')
    .reduce((sum, t) => sum + t.amountExclVat, 0)

  const totalExpenses = relation.transactions
    .filter((t) => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.amountExclVat, 0)

  return (
    <div>
      <PageHeader
        title={relation.name}
        description={`Relatie #${relation.number}`}
        action={
          <Link
            href={`/relaties/${relation.id}/bewerken`}
            className="btn-primary"
          >
            Bewerken
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Contactgegevens</h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-gray-500">Adres</dt>
              <dd className="text-sm font-medium">
                {relation.address || '-'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Postcode en plaats</dt>
              <dd className="text-sm font-medium">
                {relation.postalCode || ''} {relation.city || '-'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Telefoon</dt>
              <dd className="text-sm font-medium">{relation.phone || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">E-mail</dt>
              <dd className="text-sm font-medium">{relation.email || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">BTW-nummer</dt>
              <dd className="text-sm font-medium">
                {relation.vatNumber || '-'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Financieel overzicht</h3>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm text-gray-500">Totale omzet</dt>
              <dd className="text-2xl font-bold text-green-600">
                {formatCurrency(totalIncome)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Totale kosten</dt>
              <dd className="text-2xl font-bold text-red-600">
                {formatCurrency(totalExpenses)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {relation.notes && (
        <div className="card mb-8">
          <h3 className="text-lg font-semibold mb-2">Notities</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{relation.notes}</p>
        </div>
      )}

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Transacties</h3>

        {relation.transactions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            Nog geen transacties voor deze relatie
          </p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Beschrijving</th>
                  <th>Type</th>
                  <th className="text-right">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {relation.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.date)}</td>
                    <td>{transaction.description}</td>
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
