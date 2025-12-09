import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const relation = await prisma.relation.findUnique({
      where: { id: params.id },
      include: {
        transactions: {
          orderBy: { date: 'desc' },
        },
      },
    })

    if (!relation) {
      return NextResponse.json(
        { error: 'Relatie niet gevonden' },
        { status: 404 }
      )
    }

    return NextResponse.json(relation)
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij ophalen relatie' },
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

    const relation = await prisma.relation.update({
      where: { id: params.id },
      data,
    })

    return NextResponse.json(relation)
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij bijwerken relatie' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.relation.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij verwijderen relatie' },
      { status: 500 }
    )
  }
}
