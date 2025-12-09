export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum VatRate {
  NONE = 'NONE',
  LOW = 'LOW',
  HIGH = 'HIGH',
}

export interface TransactionFormData {
  date: string
  description: string
  relationId?: string
  type: TransactionType
  amountExclVat: number
  vatRate: VatRate
  category?: string
}

export interface RelationFormData {
  name: string
  address?: string
  postalCode?: string
  city?: string
  phone?: string
  email?: string
  vatNumber?: string
  notes?: string
}

export interface CompanySettingsFormData {
  companyName: string
  contactPerson?: string
  address?: string
  postalCode?: string
  city?: string
  phone?: string
  email?: string
  website?: string
  kvkNumber?: string
  vatId?: string
  iban?: string
  defaultPaymentTermDays: number
  fiscalYear: number
}

export interface DashboardStats {
  totalIncome: number
  totalExpenses: number
  result: number
}

export interface VatReportData {
  income21: { base: number; vat: number }
  income9: { base: number; vat: number }
  income0: { base: number }
  expense21: { base: number; vat: number }
  expense9: { base: number; vat: number }
  expense0: { base: number }
  totalVatDue: number
}
