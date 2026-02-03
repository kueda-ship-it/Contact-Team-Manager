import { useEffect, useState } from 'react';
import { db, seedDatabase } from './db';
import { Sidebar } from './components/Sidebar';
import type { SidebarItem } from './components/Sidebar';
import { DirectoryView } from './components/DirectoryView';
// import { TeamsView } from './components/TeamsView';
import { Settings, Users, LayoutDashboard, LogOut } from 'lucide-react';
import { supabase } from './lib/supabase'; // Corrected Supabase import path

function App() {
  const [activeView, setActiveView] = useState<'teams' | 'directory' | 'settings'>('directory');
  const [selectedTeamId, setSelectedTeamId] = useState('all');
  // Initialize with the default "All Teams" item
  const [teams, setTeams] = useState<{ id: string; name: string; icon: string; }[]>([
    { id: 'all', name: 'ALL Teams', icon: '📋' }
  ]);

  // Define fetchTeams here so it's accessible by handleAddTeam and useEffect
  const fetchTeams = async () => {
    console.log("Fetching teams...");
    const { data, error } = await supabase.from('teams').select('*').order('created_at');
    if (error) {
      console.error("Error fetching teams:", error);
      // alert("チームデータの取得に失敗しました: " + error.message);
      return;
    }
    if (data) {
      console.log("Teams fetched:", data);
      // Add 'all' team at the beginning
      const allTeam = { id: 'all', name: 'ALL Teams', icon: '📋' };
      setTeams([allTeam, ...data.map((t: any) => ({
        id: t.id,
        name: t.name,
        icon: t.icon || '📋'
      }))]);
    } else {
      console.log("No teams found");
    }
  };

  // Fetch teams from Supabase on mount and subscribe to changes
  useEffect(() => {
    fetchTeams(); // Initial fetch

    const subscription = supabase
      .channel('teams_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, fetchTeams)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array means this runs once on mount

  // Fetch messages for selected team
  useEffect(() => {
    if (selectedTeamId === 'all') return;

    const fetchMessages = async () => {
      // Use mock data for now or fetch actual messages if you want to go full generic
      // const { data } = await supabase.from('messages').eq('team_id', selectedTeamId).select('*');
    };
    fetchMessages();
  }, [selectedTeamId]);

  useEffect(() => {
    db.columns.count().then(count => {
      if (count === 0) seedDatabase();
    });
  }, []);

  /*
  const handleAddTeam = async () => {
    const teamName = prompt('チーム名を入力してください:');
    if (teamName) {
      await supabase.from('teams').insert([{ name: teamName, icon: '👥' }]);
      // fetchTeams will be called by realtime subscription, but we can call it manually too
      fetchTeams();
    }
  };
  */

  // Construct Sidebar Items
  // Teams are hidden for "Roster Only" mode
  /*
  const teamItems: SidebarItem[] = teams.map(team => ({
    id: team.id,
    label: team.name,
    icon: team.icon,
    // Add sub-items only if this team is selected and we are in teams view
    subItems: (activeView === 'teams' && selectedTeamId === team.id) ? [
      { id: 'general', label: '一般', icon: '#', onClick: () => console.log('General') },
      { id: 'unfinished', label: '未完了', icon: '#', badge: 12, onClick: () => console.log('Unfinished') },
      { id: 'self', label: '自分宛て', icon: '#', badge: 0, onClick: () => console.log('Self') },
      { id: 'members', label: 'メンバー一覧', icon: Users, onClick: () => console.log('Members') },
      { id: 'settings', label: '設定', icon: Settings, onClick: () => console.log('Settings') },
    ] : undefined
  }));
  */

  // App Navigation at the bottom
  const navItems: SidebarItem[] = [
    { id: 'directory', label: 'Employee List', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const allItems = [...navItems];

  const handleSidebarClick = (id: string) => {
    // Check if it's a team id
    const isTeam = teams.some(t => t.id === id);
    if (isTeam && false) { // Disabled team clicking
      setActiveView('teams');
      setSelectedTeamId(id);
    } else {
      setActiveView(id as any);
      // Keep selectedTeamId as is, or reset? Let's keep it.
    }
  };

  return (
    <div className="min-h-screen bg-[#11100F] flex">
      <Sidebar
        items={allItems}
        activeItemId={activeView === 'teams' ? selectedTeamId : activeView}
        onItemClick={handleSidebarClick}
        width={72}
        showLabels="hover"
        // onAddClick={handleAddTeam} // Removed Add Team button
        // addButtonLabel="チームを追加"
        logo={{
          icon: LayoutDashboard,
          title: 'Prograde',
          subtitle: 'Nova Dashboard'
        }}
        footer={
          <div>
            <div className="bg-[#2B2D31] p-2 rounded-xl flex items-center gap-3 overflow-hidden transition-all duration-300 group-hover:p-4 group-hover:rounded-[1.5rem] border border-slate-800">
              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-sm flex-shrink-0">
                KU
              </div>
              <div className="flex-1 min-w-0 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                <div className="font-black text-slate-200 text-xs truncate">K. Ueda</div>
                <div className="text-[10px] font-bold text-slate-500 truncate">Administrator</div>
              </div>
            </div>
            <button className="w-full mt-4 flex items-center justify-center gap-2 text-slate-400 hover:text-red-500 font-black text-xs transition-colors p-2 overflow-hidden">
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Sign Out</span>
            </button>
          </div>
        }
      />

      <main className="flex-1 ml-[72px] p-10">
        <div className="max-w-[1600px] mx-auto">
          {/* TeamsView removed for roster-only mode */}
          {activeView === 'directory' && <DirectoryView />}
          {activeView === 'settings' && (
            <div className="flex flex-col items-center justify-center py-40 text-slate-300">
              <Settings className="w-16 h-16 mb-4 animate-[spin_8s_linear_infinite]" />
              <h2 className="text-2xl font-black tracking-tighter">System Settings</h2>
              <p className="font-bold text-sm mt-2 uppercase tracking-widest text-slate-400">Under Construction</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
