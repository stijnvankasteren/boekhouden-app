import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateVatAmount, calculateAmountInclVat } from '@/lib/vat'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: params.id },
      include: {
        relation: true,
      },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transactie niet gevonden' },
        { status: 404 }
      )
    }

    return NextResponse.json(transaction)
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij ophalen transactie' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()

    const vatAmount = calculateVatAmount(data.amountExclVat, data.vatRate)
    const amountInclVat = calculateAmountInclVat(data.amountExclVat, vatAmount)

    const transaction = await prisma.transaction.update({
      where: { id: params.id },
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
      { error: 'Fout bij bijwerken transactie' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.transaction.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij verwijderen transactie' },
      { status: 500 }
    )
  }
}
