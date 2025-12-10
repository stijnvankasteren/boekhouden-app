import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import ErrorMessage from '@/components/ErrorMessage'
import YearSelect from '@/components/YearSelect'
import { formatCurrency, formatDate } from '@/lib/vat'
import { prisma } from '@/lib/prisma'
import { getOrCreateSettings } from '@/lib/settings'
import { Transaction } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface DashboardData {
  totalIncome: number
  totalExpenses: number
  result: number
  recentTransactions: (Transaction & { relation: any })[]
}

async function getDashboardData(year: number): Promise<DashboardData> {
  const startDate = new Date(`${year}-01-01`)
  const endDate = new Date(`${year}-12-31`)

  const income = await prisma.transaction.aggregate({
    where: {
      type: 'INCOME',
      date: { gte: startDate, lte: endDate },
    },
    _sum: { amountExclVat: true },
  })

  const expenses = await prisma.transaction.aggregate({
    where: {
      type: 'EXPENSE',
      date: { gte: startDate, lte: endDate },
    },
    _sum: { amountExclVat: true },
  })

  const recentTransactions = await prisma.transaction.findMany({
    take: 10,
    orderBy: { date: 'desc' },
    include: { relation: true },
  })

  const totalIncome = income._sum.amountExclVat || 0
  const totalExpenses = expenses._sum.amountExclVat || 0

  return {
    totalIncome,
    totalExpenses,
    result: totalIncome - totalExpenses,
    recentTransactions,
  }
}

ns runtime in de browser gebruikt.

export default async function Dashboard({
  searchParams,
}: {
  searchParams?: { year?: string }
}) {
  try {
    const settings = await getOrCreateSettings()
    const currentYear =
      searchParams?.year && !Number.isNaN(parseInt(searchParams.year))
        ? parseInt(searchParams.year)
        : settings.fiscalYear

    const data = await getDashboardData(currentYear)

    const years = Array.from({ length: 5 }, (_, i) => settings.fiscalYear - 2 + i)

    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="Overzicht van uw omzet, kosten en resultaat"
        />

        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Jaaroverzicht</h2>
            {/* In een volgende stap kun je YearSelect als aparte client component maken */}
            <YearSelect currentYear={currentYear} years={years} />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="card bg-green-50">
              <div className="text-sm text-gray-600">Omzet</div>
              <div className="text-2xl font-bold text-green-700">
                {formatCurrency(data.totalIncome)}
              </div>
            </div>

            <div className="card bg-red-50">
              <div className="text-sm text-gray-600">Kosten</div>
              <div className="text-2xl font-bold text-red-700">
                {formatCurrency(data.totalExpenses)}
              </div>
            </div>

            <div className="card bg-blue-50">
              <div className="text-sm text-gray-600">Resultaat</div>
              <div className="text-2xl font-bold text-blue-700">
                {formatCurrency(data.result)}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recente transacties</h2>
              <Link
                href="/transacties"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
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
                      <th>Omschrijving</th>
                      <th>Relatie</th>
                      <th className="text-right">Bedrag excl. btw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{formatDate(transaction.date)}</td>
                        <td>{transaction.description}</td>
                        <td>{transaction.relation?.name || '-'}</td>
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
      </div>
    )
  } catch (error) {
    console.error('Dashboard render error:', error)
    return <ErrorMessage message="Fout bij ophalen dashboard data" />
  }
}
