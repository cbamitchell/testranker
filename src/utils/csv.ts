import type { Item } from '../db/db'

export function exportItemsToCSV(items: Item[], listName: string): void {
  const headers = ['Name', 'ELO', 'Wins', 'Losses', 'Matches', 'Win%', 'Tags', 'Description', 'URL']
  const rows = items.map((item) => [
    item.name,
    item.elo,
    item.wins,
    item.losses,
    item.matchCount,
    item.matchCount > 0 ? ((item.wins / item.matchCount) * 100).toFixed(1) + '%' : '0%',
    item.tags.join(';'),
    item.description,
    item.url ?? '',
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${listName.replace(/[^a-z0-9]/gi, '_')}_rankings.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface CSVItem {
  name: string
  description: string
  tags: string[]
  url: string | null
}

export async function parseCSVFile(file: File): Promise<CSVItem[]> {
  const text = await file.text()
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  // Try to detect if first row is a header
  const firstRow = lines[0].toLowerCase()
  const hasHeader =
    firstRow.includes('name') || firstRow.includes('title') || firstRow.includes('item')
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines
    .map((line) => {
      const cells = parseCSVRow(line)
      const name = cells[0]?.trim().replace(/^"|"$/g, '')
      if (!name) return null
      return {
        name,
        description: cells[3]?.trim().replace(/^"|"$/g, '') || '',
        tags: cells[6]?.split(';').map((t) => t.trim()).filter(Boolean) || [],
        url: cells[7]?.trim().replace(/^"|"$/g, '') || null,
      }
    })
    .filter((x): x is CSVItem => x !== null)
}

function parseCSVRow(row: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
