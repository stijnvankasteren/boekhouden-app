'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { Relation } from '@prisma/client'

export default function RelationsPage() {
  const [relations, setRelations] = useState<Relation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchRelations()
  }, [search])

  const fetchRelations = async () => {
    try {
      setLoading(true)
      const url = search
        ? `/api/relations?search=${encodeURIComponent(search)}`
        : '/api/relations'

      const response = await fetch(url)
      if (!response.ok) throw new Error('Fout bij ophalen relaties')

      const data = await response.json()
      setRelations(data)
    } catch (err) {
      setError('Fout bij ophalen relaties')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet u zeker dat u deze relatie wilt verwijderen?')) return

    try {
      const response = await fetch(`/api/relations/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Fout bij verwijderen relatie')

      fetchRelations()
    } catch (err) {
      alert('Fout bij verwijderen relatie')
    }
  }

  return (
    <div>
      <PageHeader
        title="Relaties"
        description="Beheer uw klanten en leveranciers"
        action={
          <Link href="/relaties/nieuw" className="btn-primary">
            + Nieuwe relatie
          </Link>
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="card mb-6">
        <input
          type="text"
          placeholder="Zoek op naam of plaats..."
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="card">
          {relations.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Geen relaties gevonden</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nummer</th>
                    <th>Naam</th>
                    <th>Plaats</th>
                    <th>Telefoon</th>
                    <th>E-mail</th>
                    <th className="text-right">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {relations.map((relation) => (
                    <tr key={relation.id}>
                      <td>{relation.number}</td>
                      <td>
                        <Link
                          href={`/relaties/${relation.id}`}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {relation.name}
                        </Link>
                      </td>
                      <td>{relation.city || '-'}</td>
                      <td>{relation.phone || '-'}</td>
                      <td>{relation.email || '-'}</td>
                      <td className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Link
                            href={`/relaties/${relation.id}/bewerken`}
                            className="text-blue-600 hover:text-blue-700 text-sm"
                          >
                            Bewerken
                          </Link>
                          <button
                            onClick={() => handleDelete(relation.id)}
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
      )}
    </div>
  )
}
