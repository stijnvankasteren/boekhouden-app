import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { city: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const relations = await prisma.relation.findMany({
      where,
      orderBy: { number: 'asc' },
    })

    return NextResponse.json(relations)
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij ophalen relaties' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const lastRelation = await prisma.relation.findFirst({
      orderBy: { number: 'desc' },
    })

    const nextNumber = (lastRelation?.number || 0) + 1

    const relation = await prisma.relation.create({
      data: {
        ...data,
        number: nextNumber,
      },
    })

    return NextResponse.json(relation)
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij aanmaken relatie' },
      { status: 500 }
    )
  }
}
