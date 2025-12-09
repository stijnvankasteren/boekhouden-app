import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    let settings = await prisma.companySettings.findFirst()

    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          companyName: 'Mijn Bedrijf B.V.',
          defaultPaymentTermDays: 30,
          fiscalYear: new Date().getFullYear(),
        },
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij ophalen instellingen' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    let settings = await prisma.companySettings.findFirst()

    if (!settings) {
      settings = await prisma.companySettings.create({ data })
    } else {
      settings = await prisma.companySettings.update({
        where: { id: settings.id },
        data,
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    return NextResponse.json(
      { error: 'Fout bij opslaan instellingen' },
      { status: 500 }
    )
  }
}
