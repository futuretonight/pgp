import "./Sidebar.css";

// THE FIX IS HERE: The word "default" is required for your App.jsx import to work.
export default function Sidebar({ activeTab, onTabChange }) {
  const navItems = [
    { id: 'dashboard', icon: '⚡', label: 'Dashboard' }, 
    { id: 'chat', icon: '💬', label: 'Secure Chat' },   
    { id: 'contacts', icon: '👥', label: 'Contacts' },  
    { id: 'vault', icon: '🔐', label: 'Key Vault' },    
  ];

  return (
    <div className="sidebar">
      {navItems.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => onTabChange(item.id)}
          title={item.label} 
        >
          {item.icon}
        </button>
      ))}
      
      <div className="spacer" />
      
      <button 
        className="nav-item"
        onClick={() => onTabChange('settings')}
        title="Settings"
      >
        ⚙️
      </button>
      <button 
        className="nav-item danger" 
        onClick={() => onTabChange('lock')}
        title="Emergency Lock"
      >
        🔒
      </button>
    </div>
  );
}