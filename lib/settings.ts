import { prisma } from '@/lib/prisma'
import { CompanySettings } from '@prisma/client'

/**
 * Haal de bedrijfsinstellingen op. 
 * Als er nog geen record is wordt er één aangemaakt met standaardwaarden.
 */
export async function getOrCreateSettings(): Promise<CompanySettings> {
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

  return settings
}
