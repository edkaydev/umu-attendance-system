import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface BreadcrumbItem {
  label: string
  path?: string
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[]
  customLabel?: ReactNode
}

function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean)
  const breadcrumbs: BreadcrumbItem[] = []
  
  // Add home
  breadcrumbs.push({ label: 'Home', path: '/' })
  
  // Build path segments
  let currentPath = ''
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`
    const isLast = index === segments.length - 1
    
    // Format segment label
    const label = segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    
    breadcrumbs.push({
      label,
      path: isLast ? undefined : currentPath
    })
  })
  
  return breadcrumbs
}

export function Breadcrumb({ items, customLabel }: BreadcrumbProps) {
  const location = useLocation()
  const breadcrumbs = items || generateBreadcrumbs(location.pathname)
  
  // Don't show breadcrumbs on login or simple pages
  if (location.pathname === '/login' || location.pathname === '/') {
    return null
  }
  
  return (
    <nav className="mb-4" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            {index > 0 && (
              <span className="text-text-disabled" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </span>
            )}
            {item.path ? (
              <Link 
                to={item.path} 
                className="text-text-secondary hover:text-umu-red transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-text-primary" aria-current="page">
                {customLabel || item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}