import { useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Item } from '../db/db'
import { DEFAULT_ELO, DEFAULT_K } from '../elo/calculator'
import Button from '../components/Button'
import Modal from '../components/Modal'
import { parseCSVFile, exportItemsToCSV } from '../utils/csv'
import { searchWikipedia, fetchWikipediaList } from '../utils/wikipedia'
import type { WikiItem } from '../utils/wikipedia'
import styles from './ListEditor.module.css'

type DraftItem = Omit<Item, 'id' | 'listId' | 'elo' | 'wins' | 'losses' | 'skips' | 'matchCount' | 'currentStreak' | 'maxStreak' | 'skipped' | 'createdAt'>

const emptyDraft = (): DraftItem => ({
  name: '',
  description: '',
  imageData: null,
  tags: [],
  url: null,
})

export default function ListEditor() {
  const { listId } = useParams()
  const isEdit = Boolean(listId)
  const navigate = useNavigate()

  const list = useLiveQuery(() =>
    listId ? db.lists.get(Number(listId)) : undefined,
    [listId]
  )
  const existingItems = useLiveQuery(() =>
    listId ? db.items.where('listId').equals(Number(listId)).toArray() : [],
    [listId]
  )

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kFactor, setKFactor] = useState(DEFAULT_K)
  const [initialized, setInitialized] = useState(false)

  if (list && !initialized) {
    setName(list.name)
    setDescription(list.description)
    setKFactor(list.kFactor)
    setInitialized(true)
  }

  // Item editing
  const [editingItem, setEditingItem] = useState<(DraftItem & { id?: number }) | null>(null)
  const [tagInput, setTagInput] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Wikipedia modal
  const [showWiki, setShowWiki] = useState(false)
  const [wikiQuery, setWikiQuery] = useState('')
  const [wikiResults, setWikiResults] = useState<{ title: string; pageId: number }[]>([])
  const [wikiItems, setWikiItems] = useState<WikiItem[]>([])
  const [wikiSelected, setWikiSelected] = useState<Set<number>>(new Set())
  const [wikiLoading, setWikiLoading] = useState(false)
  const [wikiPage, setWikiPage] = useState('')

  // CSV
  const csvInputRef = useRef<HTMLInputElement>(null)

  async function saveList() {
    if (!name.trim()) return
    const now = new Date()
    if (isEdit && listId) {
      await db.lists.update(Number(listId), { name: name.trim(), description, kFactor, updatedAt: now })
    } else {
      const id = await db.lists.add({ name: name.trim(), description, kFactor, createdAt: now, updatedAt: now })
      navigate(`/list/${id}/edit`, { replace: true })
      return
    }
  }

  async function deleteList() {
    if (!listId) return
    if (!confirm(`Delete "${list?.name}"? This cannot be undone.`)) return
    const id = Number(listId)
    await db.items.where('listId').equals(id).delete()
    await db.matches.where('listId').equals(id).delete()
    await db.eloHistory.where('listId').equals(id).delete()
    await db.lists.delete(id)
    navigate('/', { replace: true })
  }

  function openNewItem() {
    setEditingItem(emptyDraft())
    setTagInput('')
  }

  function openEditItem(item: Item) {
    setEditingItem({ id: item.id, name: item.name, description: item.description, imageData: item.imageData, tags: [...item.tags], url: item.url })
    setTagInput('')
  }

  async function saveItem() {
    if (!editingItem || !listId || !editingItem.name.trim()) return
    const base = {
      name: editingItem.name.trim(),
      description: editingItem.description,
      imageData: editingItem.imageData,
      tags: editingItem.tags,
      url: editingItem.url,
    }
    if (editingItem.id) {
      await db.items.update(editingItem.id, base)
    } else {
      await db.items.add({
        ...base,
        listId: Number(listId),
        elo: DEFAULT_ELO,
        wins: 0,
        losses: 0,
        skips: 0,
        matchCount: 0,
        currentStreak: 0,
        maxStreak: 0,
        skipped: false,
        createdAt: new Date(),
      })
    }
    await db.lists.update(Number(listId), { updatedAt: new Date() })
    setEditingItem(null)
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Remove "${item.name}"?`)) return
    await db.items.delete(item.id!)
    await db.eloHistory.where('itemId').equals(item.id!).delete()
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editingItem) return
    const reader = new FileReader()
    reader.onload = () => {
      setEditingItem({ ...editingItem, imageData: reader.result as string })
    }
    reader.readAsDataURL(file)
  }

  function addTag() {
    const t = tagInput.trim()
    if (!t || !editingItem || editingItem.tags.includes(t)) return
    setEditingItem({ ...editingItem, tags: [...editingItem.tags, t] })
    setTagInput('')
  }

  // Wikipedia import
  async function searchWiki() {
    setWikiLoading(true)
    setWikiItems([])
    setWikiResults([])
    setWikiSelected(new Set())
    try {
      const results = await searchWikipedia(wikiQuery)
      setWikiResults(results)
    } finally {
      setWikiLoading(false)
    }
  }

  async function loadWikiPage(title: string) {
    setWikiPage(title)
    setWikiLoading(true)
    setWikiSelected(new Set())
    try {
      const items = await fetchWikipediaList(title)
      setWikiItems(items)
    } finally {
      setWikiLoading(false)
    }
  }

  async function importWikiSelected() {
    if (!listId) return
    const toImport = wikiItems.filter((_, i) => wikiSelected.has(i))
    const now = new Date()
    for (const wi of toImport) {
      await db.items.add({
        listId: Number(listId),
        name: wi.name,
        description: wi.description,
        imageData: null,
        tags: [],
        url: wi.url,
        elo: DEFAULT_ELO,
        wins: 0,
        losses: 0,
        skips: 0,
        matchCount: 0,
        currentStreak: 0,
        maxStreak: 0,
        skipped: false,
        createdAt: now,
      })
    }
    await db.lists.update(Number(listId), { updatedAt: new Date() })
    setShowWiki(false)
    setWikiItems([])
    setWikiResults([])
    setWikiPage('')
    setWikiQuery('')
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !listId) return
    const items = await parseCSVFile(file)
    const now = new Date()
    for (const item of items) {
      await db.items.add({
        ...item,
        imageData: null,
        listId: Number(listId),
        elo: DEFAULT_ELO,
        wins: 0,
        losses: 0,
        skips: 0,
        matchCount: 0,
        currentStreak: 0,
        maxStreak: 0,
        skipped: false,
        createdAt: now,
      })
    }
    await db.lists.update(Number(listId), { updatedAt: new Date() })
    e.target.value = ''
  }

  async function handleCSVExport() {
    if (!existingItems || !list) return
    exportItemsToCSV(existingItems, list.name)
  }

  const toggleWikiItem = (i: number) => {
    const next = new Set(wikiSelected)
    if (next.has(i)) next.delete(i); else next.add(i)
    setWikiSelected(next)
  }

  const selectAllWiki = () => {
    if (wikiSelected.size === wikiItems.length) setWikiSelected(new Set())
    else setWikiSelected(new Set(wikiItems.map((_, i) => i)))
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{isEdit ? 'Edit List' : 'New List'}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>List Settings</h2>
        <div className={styles.form}>
          <label className={styles.label}>
            Name *
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Best Movies of 2024" />
          </label>
          <label className={styles.label}>
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..." rows={2} />
          </label>
          <label className={styles.label}>
            ELO K-Factor
            <select value={kFactor} onChange={(e) => setKFactor(Number(e.target.value))}>
              <option value={16}>16 — Low volatility (slow ranking)</option>
              <option value={32}>32 — Standard</option>
              <option value={64}>64 — High volatility (fast ranking)</option>
            </select>
          </label>
          <div className={styles.formActions}>
            <Button variant="primary" onClick={saveList} disabled={!name.trim()}>
              {isEdit ? 'Save Changes' : 'Create List'}
            </Button>
            {isEdit && (
              <Button variant="danger" onClick={deleteList}>Delete List</Button>
            )}
          </div>
        </div>
      </section>

      {isEdit && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Items ({existingItems?.length ?? 0})
            </h2>
            <div className={styles.itemActions}>
              <Button size="sm" variant="primary" onClick={openNewItem}>+ Add Item</Button>
              <Button size="sm" onClick={() => setShowWiki(true)}>🌐 Wikipedia</Button>
              <Button size="sm" onClick={() => csvInputRef.current?.click()}>📂 Import CSV</Button>
              {(existingItems?.length ?? 0) > 0 && (
                <Button size="sm" variant="ghost" onClick={handleCSVExport}>⬇ Export CSV</Button>
              )}
              <input ref={csvInputRef} type="file" accept=".csv" className={styles.hidden} onChange={handleCSVImport} />
            </div>
          </div>

          <div className={styles.itemList}>
            {existingItems?.length === 0 && (
              <div className={styles.noItems}>Add items to start ranking</div>
            )}
            {existingItems?.sort((a, b) => b.elo - a.elo).map((item) => (
              <div key={item.id} className={styles.itemRow}>
                {item.imageData && (
                  <img src={item.imageData} className={styles.itemThumb} alt="" />
                )}
                {!item.imageData && (
                  <div className={styles.itemThumbPlaceholder}>📄</div>
                )}
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{item.name}</span>
                  {item.tags.length > 0 && (
                    <div className={styles.itemTags}>
                      {item.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                    </div>
                  )}
                </div>
                <span className={styles.itemElo}>{item.elo}</span>
                <div className={styles.itemRowActions}>
                  <button className={styles.iconBtn} onClick={() => openEditItem(item)} title="Edit">✏️</button>
                  <button className={styles.iconBtn} onClick={() => deleteItem(item)} title="Delete">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Item edit modal */}
      {editingItem !== null && (
        <Modal title={editingItem.id ? 'Edit Item' : 'Add Item'} onClose={() => setEditingItem(null)}>
          <div className={styles.form}>
            <label className={styles.label}>
              Name *
              <input
                value={editingItem.name}
                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                placeholder="Item name"
                autoFocus
              />
            </label>
            <label className={styles.label}>
              Description
              <textarea
                value={editingItem.description}
                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
              />
            </label>
            <label className={styles.label}>
              URL
              <input
                value={editingItem.url ?? ''}
                onChange={(e) => setEditingItem({ ...editingItem, url: e.target.value || null })}
                placeholder="https://..."
                type="url"
              />
            </label>
            <div className={styles.label}>
              Image
              <div className={styles.imageRow}>
                {editingItem.imageData && (
                  <img src={editingItem.imageData} className={styles.previewImg} alt="preview" />
                )}
                <Button size="sm" onClick={() => imageInputRef.current?.click()}>
                  {editingItem.imageData ? 'Change Image' : 'Upload Image'}
                </Button>
                {editingItem.imageData && (
                  <Button size="sm" variant="ghost" onClick={() => setEditingItem({ ...editingItem, imageData: null })}>
                    Remove
                  </Button>
                )}
                <input ref={imageInputRef} type="file" accept="image/*" className={styles.hidden} onChange={handleImageUpload} />
              </div>
            </div>
            <div className={styles.label}>
              Tags
              <div className={styles.tagInputRow}>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="Add tag + Enter"
                />
                <Button size="sm" onClick={addTag}>Add</Button>
              </div>
              {editingItem.tags.length > 0 && (
                <div className={styles.tagList}>
                  {editingItem.tags.map((t) => (
                    <span key={t} className={styles.tag}>
                      {t}
                      <button onClick={() => setEditingItem({ ...editingItem, tags: editingItem.tags.filter((x) => x !== t) })}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.formActions}>
              <Button variant="primary" onClick={saveItem} disabled={!editingItem.name.trim()}>Save</Button>
              <Button onClick={() => setEditingItem(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Wikipedia modal */}
      {showWiki && (
        <Modal title="Import from Wikipedia" onClose={() => setShowWiki(false)}>
          <div className={styles.wikiModal}>
            <div className={styles.wikiSearch}>
              <input
                value={wikiQuery}
                onChange={(e) => setWikiQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchWiki() }}
                placeholder="Search Wikipedia (e.g. Marvel movies, World Cup winners)..."
                autoFocus
              />
              <Button variant="primary" onClick={searchWiki} disabled={!wikiQuery.trim() || wikiLoading}>
                {wikiLoading ? '...' : 'Search'}
              </Button>
            </div>

            {wikiResults.length > 0 && !wikiPage && (
              <div className={styles.wikiResultList}>
                <p className={styles.wikiHint}>Select a page to import its linked items:</p>
                {wikiResults.map((r) => (
                  <button key={r.title} className={styles.wikiResultBtn} onClick={() => loadWikiPage(r.title)}>
                    {r.title} →
                  </button>
                ))}
              </div>
            )}

            {wikiLoading && <div className={styles.wikiLoading}>Loading…</div>}

            {wikiItems.length > 0 && (
              <>
                <div className={styles.wikiPageHeader}>
                  <span className={styles.wikiPageTitle}>"{wikiPage}"</span>
                  <button className={styles.wikiBack} onClick={() => { setWikiPage(''); setWikiItems([]) }}>← Back</button>
                </div>
                <div className={styles.wikiSelectAll}>
                  <button onClick={selectAllWiki}>
                    {wikiSelected.size === wikiItems.length ? 'Deselect all' : `Select all (${wikiItems.length})`}
                  </button>
                </div>
                <div className={styles.wikiItemList}>
                  {wikiItems.map((wi, i) => (
                    <label key={i} className={`${styles.wikiItem} ${wikiSelected.has(i) ? styles.wikiItemSelected : ''}`}>
                      <input type="checkbox" checked={wikiSelected.has(i)} onChange={() => toggleWikiItem(i)} />
                      {wi.imageUrl && <img src={wi.imageUrl} className={styles.wikiItemThumb} alt="" />}
                      <div className={styles.wikiItemText}>
                        <span className={styles.wikiItemName}>{wi.name}</span>
                        {wi.description && <span className={styles.wikiItemDesc}>{wi.description}</span>}
                      </div>
                    </label>
                  ))}
                </div>
                <div className={styles.formActions}>
                  <Button
                    variant="primary"
                    onClick={importWikiSelected}
                    disabled={wikiSelected.size === 0}
                  >
                    Import {wikiSelected.size} item{wikiSelected.size !== 1 ? 's' : ''}
                  </Button>
                  <Button onClick={() => setShowWiki(false)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
