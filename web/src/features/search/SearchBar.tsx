import './search.css'

type SearchBarProps = {
  query: string
  includeArchived: boolean
  onQuery: (query: string) => void
  onIncludeArchived: (include: boolean) => void
}

/** The search box and the switch that brings archived notes into the results. */
export function SearchBar({ query, includeArchived, onQuery, onIncludeArchived }: SearchBarProps) {
  return (
    <div className="search-row">
      <input
        type="search"
        aria-label="Search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={includeArchived}
          onChange={(event) => onIncludeArchived(event.target.checked)}
        />
        Include archived
      </label>
    </div>
  )
}
