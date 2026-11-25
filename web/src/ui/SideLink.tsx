import { Icon, type IconName } from './icons'
import { useSideNames } from './sideNames'

/** A side-list row: icon plus the name, or the icon alone when the menu is collapsed. */
export function SideLink({
  label,
  icon,
  current = false,
  onClick,
}: {
  label: string
  icon: IconName
  current?: boolean
  onClick: () => void
}) {
  const { open } = useSideNames()
  return (
    <button
      type="button"
      className="side-link"
      aria-label={label}
      title={label}
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
    >
      <Icon name={icon} />
      {open ? <span className="side-link-name">{label}</span> : null}
    </button>
  )
}
