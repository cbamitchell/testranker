export interface WikiItem {
  name: string
  description: string
  url: string
  imageUrl: string | null
}

export async function searchWikipedia(query: string): Promise<{ title: string; pageId: number }[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json&origin=*`
  const res = await fetch(url)
  const [, titles, , links] = await res.json() as [string, string[], string[], string[]]
  return titles.map((title, i) => ({
    title,
    pageId: parseInt(new URL(links[i]).pathname.split('/').pop() || '0'),
  }))
}

export async function fetchWikipediaList(pageTitle: string): Promise<WikiItem[]> {
  // Fetch page sections to find lists
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`

  // Fetch the links on the page (which often contain the list items)
  const linksUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=links&pllimit=max&format=json&origin=*`

  const [summaryRes, linksRes] = await Promise.all([
    fetch(summaryUrl),
    fetch(linksUrl),
  ])

  const summary = await summaryRes.json() as { title: string; extract: string }
  const linksData = await linksRes.json() as {
    query: { pages: Record<string, { links?: { title: string }[] }> }
  }

  const pages = Object.values(linksData.query.pages)
  const links = pages[0]?.links ?? []

  // Filter to only article links (no Wikipedia: Talk: etc.)
  const articleLinks = links
    .map((l) => l.title)
    .filter((t) => !t.includes(':'))
    .slice(0, 50)

  if (articleLinks.length === 0) {
    // Fallback: return just the page itself
    return [
      {
        name: summary.title,
        description: summary.extract?.slice(0, 200) || '',
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`,
        imageUrl: null,
      },
    ]
  }

  // Fetch summaries for up to 20 linked articles in one batch
  const batch = articleLinks.slice(0, 20)
  const batchUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(batch.join('|'))}&prop=extracts|pageimages&exintro=1&exchars=200&piprop=thumbnail&pithumbsize=200&format=json&origin=*`

  const batchRes = await fetch(batchUrl)
  const batchData = await batchRes.json() as {
    query: {
      pages: Record<string, {
        title: string
        extract?: string
        thumbnail?: { source: string }
        missing?: string
      }>
    }
  }

  const items: WikiItem[] = []
  for (const page of Object.values(batchData.query.pages)) {
    if (page.missing !== undefined) continue
    items.push({
      name: page.title,
      description: (page.extract || '').replace(/<[^>]+>/g, '').slice(0, 200),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      imageUrl: page.thumbnail?.source ?? null,
    })
  }

  return items
}
