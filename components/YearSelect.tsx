'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'


interface Props {
  currentYear: number
  years: number[]
}

/**
 * Kleine client-component om het jaar via de URL (search param) te wijzigen.
 * Hiermee hoeft de dashboard-pagina zelf geen client component te zijn.
 */
export default function YearSelect({ currentYear, years }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const year = event.target.value
    const params = new URLSearchParams(searchParams.toString())
    params.set('year', year)
    router.push(`/?${params.toString()}`)
  }

  return (
    <select
      className="select w-auto"
      value={currentYear}
      onChange={handleChange}
    >
      {years.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>
  )
}
