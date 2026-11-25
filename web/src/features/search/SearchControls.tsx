import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SearchBar } from './SearchBar'
import { readSearchQuery, writeSearchQuery } from './searchUrl'

function isHistoryPath(pathname: string): boolean {
  return pathname.startsWith('/history/')
}

function searchKey(text: string, includeArchived: boolean): string {
  return `${includeArchived ? '1' : '0'}\n${text}`
}

function address(pathname: string, query: string, hash: string): string {
  return `${pathname}${query === '' ? '' : `?${query}`}${hash}`
}

/**
 * The search box in the top bar. The address is the memory the board reads.
 * The box keeps the letters as they are typed, then the address catches up.
 * On a history page, typing opens Notes instead of searching that page.
 */
export function SearchControls() {
  const location = useLocation()
  const navigate = useNavigate()
  const url = readSearchQuery(location.search)
  const urlKey = searchKey(url.text, url.includeArchived)
  const [text, setText] = useState(url.text)
  const [includeArchived, setIncludeArchived] = useState(url.includeArchived)
  const [seenKey, setSeenKey] = useState(urlKey)
  const pending = useRef(new Set<string>())
  const pushedHome = useRef(false)
  const locationRef = useRef(location)
  const textRef = useRef(text)
  const archivedRef = useRef(includeArchived)
  locationRef.current = location
  textRef.current = text
  archivedRef.current = includeArchived

  if (seenKey !== urlKey) {
    setSeenKey(urlKey)
    if (pending.current.has(urlKey)) pending.current.delete(urlKey)
    else {
      pending.current.clear()
      setText(url.text)
      setIncludeArchived(url.includeArchived)
    }
  }

  useEffect(() => {
    if (isHistoryPath(location.pathname)) pushedHome.current = false
  }, [location.pathname])

  function publish(pathname: string, query: string, replace: boolean, state: unknown, hash: string) {
    const next = readSearchQuery(query)
    pending.current.add(searchKey(next.text, next.includeArchived))
    navigate(address(pathname, query, hash), { replace, state })
  }

  function onQuery(next: string) {
    setText(next)
    textRef.current = next
    const loc = locationRef.current
    const archived = archivedRef.current
    if (isHistoryPath(loc.pathname) && next !== '') {
      const replace = pushedHome.current
      pushedHome.current = true
      publish('/home', writeSearchQuery('', { text: next, includeArchived: archived }), replace, null, '')
      return
    }
    pushedHome.current = false
    publish(
      loc.pathname,
      writeSearchQuery(loc.search, { text: next, includeArchived: archived }),
      true,
      loc.state,
      loc.hash,
    )
  }

  function onIncludeArchived(include: boolean) {
    setIncludeArchived(include)
    archivedRef.current = include
    const loc = locationRef.current
    publish(
      loc.pathname,
      writeSearchQuery(loc.search, { text: textRef.current, includeArchived: include }),
      true,
      loc.state,
      loc.hash,
    )
  }

  return <SearchBar query={text} includeArchived={includeArchived} onQuery={onQuery} onIncludeArchived={onIncludeArchived} />
}
