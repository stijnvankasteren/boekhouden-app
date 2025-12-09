import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const year = searchParams.get('year')
    const quarter = searchParams.get('quarter')

    if (!year || !quarter) {
      return NextResponse.json(
        { error: 'Jaar en kwartaal zijn verplicht' },
        { status: 400 }
      )
    }

    const yearNum = parseInt(year)
    const quarterNum = parseInt(quarter)

    const quarterMonths = {
      1: [1, 2, 3],
      2: [4, 5, 6],
      3: [7, 8, 9],
      4: [10, 11, 12],
    }

    const months = quarterMonths[quarterNum as keyof typeof quarterMonths]
    const startMonth = months[0]
    const endMonth = months[2]

    const startDate = new Date(yearNum, startMonth - 1, 1)
    const endDate = new Date(yearNum, endMonth, 0)

    const transactions = await prisma.transaction.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
    })

    const income21 = { base: 0, vat: 0 }
    const income9 = { base: 0, vat: 0 }
    const income0 = { base: 0 }
    const expense21 = { base: 0, vat: 0 }
    const expense9 = { base: 0, vat: 0 }
    const expense0 = { base: 0 }

    transactions.forEach((t) => {
      if (t.type === 'INCOME') {
        if (t.vatRate === 'HIGH') {
          income21.base += t.amountExclVat
          income21.vat += t.vatAmount
        } else if (t.vatRate === 'LOW') {
          income9.base += t.amountExclVat
          income9.vat += t.vatAmount
        } else {
          income0.base += t.amountExclVat
        }
      } else {
        if (t.vatRate === 'HIGH') {
          expense21.base += t.amountExclVat
          expense21.vat += t.vatAmount
        } else if (t.vatRate === 'LOW') {
          expense9.base += t.amountExclVat
          expense9.vat += t.vatAmount
        } else {
          expense0.base += t.amountExclVat
        }
      }
    })

    const totalVatDue = income21.vat + income9.vat - expense21.vat - expense9.vat

    return NextResponse.json({
      income21,
      income9,
      income0,
      expense21,
      expense9,
      expense0,
      totalVatDue,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij ophalen BTW-rapport' },
      { status: 500 }
    )
  }
}
