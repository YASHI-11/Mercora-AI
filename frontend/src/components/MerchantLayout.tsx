import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/merchant', label: 'Overview', end: true },
  { to: '/merchant/analytics', label: 'Analytics' },
  { to: '/merchant/products', label: 'Products' },
  { to: '/merchant/opportunities', label: 'Growth Opportunities' },
  { to: '/merchant/copilot', label: 'AI Copilot' },
  { to: '/merchant/audit', label: 'Audit Trail' },
  { to: '/merchant/settings', label: 'Settings' },
]

export default function MerchantLayout() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-zinc-200">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}
                   className={({ isActive }) =>
                     `whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                       isActive ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-900'
                     }`
                   }>
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
