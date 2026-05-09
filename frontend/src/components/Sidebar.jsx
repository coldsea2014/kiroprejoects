export default function Sidebar({ me, contacts, selected, onSelect, search, onSearch, onLogout }) {
  return (
    <aside className="w-80 border-r border-gray-800 flex flex-col bg-wa-panelDark">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-wa-green flex items-center justify-center font-bold">
            {me?.fullName?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="font-medium text-sm">{me?.fullName}</div>
            <div className="text-xs text-gray-400">{me?.service}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-gray-400 hover:text-white"
          title="Deconnexion"
        >
          Quitter
        </button>
      </div>

      {/* Search */}
      <div className="p-3">
        <input
          type="text"
          placeholder="Rechercher un collegue..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full px-3 py-2 rounded bg-wa-bgDark border border-gray-700 text-sm focus:border-wa-green outline-none"
        />
      </div>

      {/* Contacts */}
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 && (
          <p className="text-sm text-gray-500 text-center p-4">Aucun collegue trouve</p>
        )}
        {contacts.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-bgDark/60 transition ${
              selected?.id === c.id ? 'bg-wa-bgDark' : ''
            }`}
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold text-sm">
                {c.fullName?.[0]?.toUpperCase()}
              </div>
              {c.online && (
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-wa-green border-2 border-wa-panelDark" />
              )}
            </div>
            <div className="flex-1 text-left overflow-hidden">
              <div className="text-sm font-medium truncate">{c.fullName}</div>
              <div className="text-xs text-gray-400 truncate">{c.service}</div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
