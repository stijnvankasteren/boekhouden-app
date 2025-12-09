import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const year = searchParams.get('year')

    if (!year) {
      return NextResponse.json(
        { error: 'Jaar is verplicht' },
        { status: 400 }
      )
    }

    const yearNum = parseInt(year)
    const startDate = new Date(`${yearNum}-01-01`)
    const endDate = new Date(`${yearNum}-12-31`)

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

    return NextResponse.json({
      totalIncome,
      totalExpenses,
      result: totalIncome - totalExpenses,
      recentTransactions,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij ophalen dashboard data' },
      { status: 500 }
    )
  }
}
