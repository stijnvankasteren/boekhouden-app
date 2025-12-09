import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateVatAmount, calculateAmountInclVat } from '@/lib/vat'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const year = searchParams.get('year')
    const type = searchParams.get('type')
    const relationId = searchParams.get('relationId')

    const where: any = {}

    if (year) {
      const yearNum = parseInt(year)
      where.date = {
        gte: new Date(`${yearNum}-01-01`),
        lte: new Date(`${yearNum}-12-31`),
      }
    }

    if (type) {
      where.type = type
    }

    if (relationId) {
      where.relationId = relationId
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        relation: true,
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(transactions)
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij ophalen transacties' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const vatAmount = calculateVatAmount(data.amountExclVat, data.vatRate)
    const amountInclVat = calculateAmountInclVat(data.amountExclVat, vatAmount)

    const transaction = await prisma.transaction.create({
      data: {
        ...data,
        date: new Date(data.date),
        vatAmount,
        amountInclVat,
      },
      include: {
        relation: true,
      },
    })

    return NextResponse.json(transaction)
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij aanmaken transactie' },
      { status: 500 }
    )
  }
}
