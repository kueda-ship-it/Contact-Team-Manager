import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from './useGanttAuth';

export const useTaskMembers = (taskId) => {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!taskId) { setMembers([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('task_members')
      .select(`
        task_id, user_id, role, invited_by, created_at,
        profile:user_id ( id, display_name, avatar_url, email )
      `)
      .eq('task_id', taskId);
    setLoading(false);
    if (!error && data) setMembers(data);
  }, [taskId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // メールアドレスでメンバーを招待
  const addMember = useCallback(async (email, role = 'viewer') => {
    email = email.trim().toLowerCase();
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, email')
      .ilike('email', email)
      .single();
    if (pErr || !profile) throw new Error('ユーザーが見つかりません。登録済みのメールアドレスを入力してください。');

    // オーナー自身は追加不可
    if (profile.id === user?.id) throw new Error('自分自身はメンバーとして追加できません。');

    const { error } = await supabase
      .from('task_members')
      .upsert({ task_id: taskId, user_id: profile.id, role, invited_by: user?.id });
    if (error) throw error;

    // 招待通知を送信
    await supabase.from('task_notifications').insert({
      user_id: profile.id,
      task_id: taskId,
      type: 'assigned',
      title: 'プロジェクトに招待されました',
      body: `${user?.user_metadata?.full_name ?? 'Someone'} があなたをプロジェクトに招待しました`,
    });

    await fetchMembers();
    return profile;
  }, [taskId, user, fetchMembers]);

  const removeMember = useCallback(async (memberId) => {
    const { error } = await supabase
      .from('task_members')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', memberId);
    if (!error) setMembers(prev => prev.filter(m => m.user_id !== memberId));
  }, [taskId]);

  const changeRole = useCallback(async (memberId, newRole) => {
    const { error } = await supabase
      .from('task_members')
      .update({ role: newRole })
      .eq('task_id', taskId)
      .eq('user_id', memberId);
    if (!error)
      setMembers(prev => prev.map(m => m.user_id === memberId ? { ...m, role: newRole } : m));
  }, [taskId]);

  return { members, loading, addMember, removeMember, changeRole, refetch: fetchMembers };
};
