import { VatRate } from './types'

export function getVatRatePercentage(vatRate: VatRate | string): number {
  switch (vatRate) {
    case 'NONE':
      return 0
    case 'LOW':
      return 9
    case 'HIGH':
      return 21
    default:
      return 0
  }
}

export function calculateVatAmount(amountExclVat: number, vatRate: VatRate | string): number {
  const percentage = getVatRatePercentage(vatRate)
  return Math.round((amountExclVat * percentage) / 100 * 100) / 100
}

export function calculateAmountInclVat(amountExclVat: number, vatAmount: number): number {
  return Math.round((amountExclVat + vatAmount) * 100) / 100
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('nl-NL').format(d)
}
