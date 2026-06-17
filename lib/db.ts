// lib/db.ts
// Semua fungsi untuk baca & tulis data ke Supabase
// Analogi: Ini kayak "daftar instruksi" ke petugas arsip — ambil ini, simpan itu, hapus ini

import { supabase } from './supabase';
import type { Folder, Summary, CreateFolderInput, CreateSummaryInput, ChatMessage, StudyGroup, GroupMember, ChatThread } from './types';

// ─────────────────────────────────────────────
// FOLDER OPERATIONS
// ─────────────────────────────────────────────

/** Ambil semua folder, diurutkan dari yang terbaru */
export async function getFolders(): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching folders:', error.message);
    return [];
  }
  return data || [];
}

/** Buat folder baru */
export async function createFolder(input: CreateFolderInput, userId: string): Promise<Folder | null> {
  const { data, error } = await supabase
    .from('folders')
    .insert({ ...input, user_id: userId })
    .select()
    .single();

  if (error) {
    console.error('Error creating folder:', error.message);
    return null;
  }
  return data;
}

/** Update nama/warna/icon folder */
export async function updateFolder(
  id: string,
  updates: Partial<CreateFolderInput>
): Promise<boolean> {
  const { error } = await supabase
    .from('folders')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating folder:', error.message);
    return false;
  }
  return true;
}

/** Hapus folder (summaries di dalamnya tidak ikut terhapus, folder_id-nya jadi null) */
export async function deleteFolder(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting folder:', error.message);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// SUMMARY OPERATIONS
// ─────────────────────────────────────────────

/** Ambil semua riwayat rangkuman, dari yang terbaru */
export async function getAllSummaries(): Promise<Summary[]> {
  const { data, error } = await supabase
    .from('summaries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching summaries:', error.message);
    return [];
  }
  return data || [];
}

/** Ambil rangkuman berdasarkan folder tertentu */
export async function getSummariesByFolder(folderId: string): Promise<Summary[]> {
  const { data, error } = await supabase
    .from('summaries')
    .select('*')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching summaries by folder:', error.message);
    return [];
  }
  return data || [];
}

/** Ambil satu rangkuman berdasarkan ID */
export async function getSummaryById(id: string): Promise<Summary | null> {
  const { data, error } = await supabase
    .from('summaries')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching summary:', error.message);
    return null;
  }
  return data;
}

/** Simpan rangkuman baru ke database */
export async function createSummary(input: CreateSummaryInput, userId: string): Promise<Summary | null> {
  const { data, error } = await supabase
    .from('summaries')
    .insert({ ...input, user_id: userId })
    .select()
    .single();

  if (error) {
    console.error('Error creating summary:', error.message);
    return null;
  }
  return data;
}

/** Update folder yang berisi rangkuman ini */
export async function moveSummaryToFolder(
  summaryId: string,
  folderId: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from('summaries')
    .update({ folder_id: folderId })
    .eq('id', summaryId);

  if (error) {
    console.error('Error moving summary:', error.message);
    return false;
  }
  return true;
}

/** Rename judul rangkuman */
export async function renameSummary(id: string, title: string): Promise<boolean> {
  const { error } = await supabase
    .from('summaries')
    .update({ title })
    .eq('id', id);

  if (error) {
    console.error('Error renaming summary:', error.message);
    return false;
  }
  return true;
}

/** Hapus satu rangkuman */
export async function deleteSummary(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('summaries')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting summary:', error.message);
    return false;
  }
  return true;
}

/** Mengaktifkan atau menonaktifkan status berbagi publik untuk rangkuman */
export async function toggleSummaryPublic(
  id: string,
  isPublic: boolean,
  slug?: string | null
): Promise<{ is_public: boolean; public_slug: string | null } | null> {
  const { data, error } = await supabase
    .from('summaries')
    .update({
      is_public: isPublic,
      public_slug: isPublic ? (slug || Math.random().toString(36).substring(2, 10)) : null
    })
    .eq('id', id)
    .select('is_public, public_slug')
    .single();

  if (error) {
    console.error('Error toggling public status:', error.message);
    return null;
  }
  return data;
}

/** Mengambil rangkuman publik berdasarkan slug unik */
export async function getSummaryBySlug(slug: string): Promise<Summary | null> {
  const { data, error } = await supabase
    .from('summaries')
    .select('*')
    .eq('public_slug', slug)
    .eq('is_public', true)
    .single();

  if (error) {
    console.error('Error fetching summary by slug:', error.message);
    return null;
  }
  return data;
}

/** Menyalin (Fork) rangkuman publik ke koleksi pengguna aktif */
export async function forkSummary(
  summary: Summary,
  userId: string
): Promise<Summary | null> {
  const { data, error } = await supabase
    .from('summaries')
    .insert({
      folder_id: null,
      title: `${summary.title} (Salinan)`,
      file_name: summary.file_name,
      duration_sec: summary.duration_sec,
      transcript: summary.transcript,
      summary: summary.summary,
      word_count: summary.word_count,
      is_public: false,
      public_slug: null,
      user_id: userId
    })
    .select()
    .single();

  if (error) {
    console.error('Error forking summary:', error.message);
    return null;
  }
  return data;
}

// ─────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────

/** Format detik jadi "1:23:45" atau "23:45" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function extractTitleFromSummary(summaryText: string): string {
  const firstHeaderLine = summaryText.split('\n').find(line => line.trim().startsWith('# '));
  if (firstHeaderLine) {
    let title = firstHeaderLine.replace(/^#\s*/, '').trim();
    // Strip leading emojis
    title = title.replace(/^[\uD800-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uE000-\uF8FF\uD83C-\uD83E\uDC00-\uDFFF]\s*/u, '');
    // Strip common prefixes like "Rangkuman Kuliah:", "Rangkuman Pertemuan:", etc.
    title = title.replace(/^(?:Rangkuman\s+\w+:\s*|Rangkuman\s+:\s*)/i, '');
    return title.trim() || 'Rangkuman Materi';
  }
  return 'Rangkuman Materi';
}

// ─────────────────────────────────────────────
// CHAT MESSAGE & THREAD OPERATIONS
// ─────────────────────────────────────────────

/** Ambil semua thread obrolan berdasarkan ID rangkuman (atau global jika null) */
export async function getChatThreads(summaryId: string | null, userId: string): Promise<ChatThread[]> {
  let query = supabase
    .from('chat_threads')
    .select('*')
    .eq('user_id', userId);
  
  if (summaryId) {
    query = query.eq('summary_id', summaryId);
  } else {
    query = query.is('summary_id', null);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching chat threads:', error.message);
    return [];
  }
  return data || [];
}

/** Buat thread obrolan baru */
export async function createChatThread(
  summaryId: string | null,
  userId: string,
  title: string
): Promise<ChatThread | null> {
  const { data, error } = await supabase
    .from('chat_threads')
    .insert({
      summary_id: summaryId,
      user_id: userId,
      title
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating chat thread:', error.message);
    return null;
  }
  return data;
}

/** Hapus thread obrolan beserta seluruh pesannya */
export async function deleteChatThread(threadId: string): Promise<boolean> {
  const { error } = await supabase
    .from('chat_threads')
    .delete()
    .eq('id', threadId);

  if (error) {
    console.error('Error deleting chat thread:', error.message);
    return false;
  }
  return true;
}

/** Ubah nama judul thread chat */
export async function renameChatThread(threadId: string, title: string): Promise<boolean> {
  const { error } = await supabase
    .from('chat_threads')
    .update({ title })
    .eq('id', threadId);

  if (error) {
    console.error('Error renaming chat thread:', error.message);
    return false;
  }
  return true;
}

/** Ambil riwayat chat berdasarkan ID thread */
export async function getChatMessages(threadId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching chat messages:', error.message);
    return [];
  }
  return data || [];
}

/** Simpan chat message baru terhubung ke thread */
export async function createChatMessage(
  summaryId: string | null,
  threadId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      summary_id: summaryId,
      thread_id: threadId,
      role,
      content
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating chat message:', error.message);
    return null;
  }
  return data;
}

/** Hapus riwayat chat untuk satu thread */
export async function clearChatMessages(threadId: string): Promise<boolean> {
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('thread_id', threadId);

  if (error) {
    console.error('Error clearing chat messages:', error.message);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// STUDY GROUP OPERATIONS (Sprint 16)
// ─────────────────────────────────────────────

/** Ambil semua kelompok belajar yang diikuti user */
export async function getStudyGroups(userId: string): Promise<StudyGroup[]> {
  // Ambil group_id yang diikuti user ini
  const { data: memberData, error: memberError } = await supabase
    .from('group_members')
    .select('group_id, role')
    .eq('user_id', userId);

  if (memberError || !memberData?.length) return [];

  const groupIds = memberData.map(m => m.group_id);
  const roleMap = Object.fromEntries(memberData.map(m => [m.group_id, m.role]));

  const { data, error } = await supabase
    .from('study_groups')
    .select('*')
    .in('id', groupIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching study groups:', error.message);
    return [];
  }

  return (data || []).map(g => ({ ...g, user_role: roleMap[g.id] }));
}

/** Buat kelompok belajar baru */
export async function createStudyGroup(
  name: string,
  description: string,
  userId: string
): Promise<StudyGroup | null> {
  const { data: group, error: groupError } = await supabase
    .from('study_groups')
    .insert({ name, description, owner_id: userId })
    .select()
    .single();

  if (groupError || !group) {
    console.error('Error creating study group:', groupError?.message);
    return null;
  }

  // Tambahkan pembuat sebagai owner di group_members
  const { error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: userId, role: 'owner' });

  if (memberError) {
    console.error('Error adding owner to group:', memberError.message);
  }

  return { ...group, user_role: 'owner' };
}

/** Bergabung ke kelompok belajar dengan kode undangan */
export async function joinStudyGroup(
  inviteCode: string,
  userId: string
): Promise<StudyGroup | null> {
  // Cari group berdasarkan kode undangan
  const { data: group, error: groupError } = await supabase
    .from('study_groups')
    .select('*')
    .eq('invite_code', inviteCode.trim())
    .single();

  if (groupError || !group) {
    console.error('Kode undangan tidak ditemukan.');
    return null;
  }

  // Cek apakah sudah menjadi anggota
  const { data: existing } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', group.id)
    .eq('user_id', userId)
    .single();

  if (existing) {
    // Sudah anggota, kembalikan grup saja
    return { ...group, user_role: existing ? 'member' : 'member' };
  }

  // Tambahkan user sebagai member
  const { error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: userId, role: 'member' });

  if (memberError) {
    console.error('Error joining group:', memberError.message);
    return null;
  }

  return { ...group, user_role: 'member' };
}

interface GroupMemberDbPayload {
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profiles: {
    email: string | null;
    full_name: string | null;
  } | null | undefined;
}

/** Ambil daftar anggota kelompok */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select(`
      group_id,
      user_id,
      role,
      joined_at,
      profiles:user_id (
        email,
        full_name
      )
    `)
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Error fetching group members:', error.message);
    return [];
  }

  const typedData = data as unknown as GroupMemberDbPayload[];

  // Make sure to map the nested profile data into the returned GroupMember array:
  return (typedData || []).map((m) => ({
    group_id: m.group_id,
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    email: m.profiles?.email ?? undefined,
    full_name: m.profiles?.full_name ?? undefined
  }));
}

/** Bagikan folder ke kelompok belajar */
export async function shareFolderWithGroup(
  folderId: string,
  groupId: string
): Promise<boolean> {
  // Cek apakah sudah dibagikan
  const { data: existing } = await supabase
    .from('group_folders')
    .select('folder_id')
    .eq('group_id', groupId)
    .eq('folder_id', folderId)
    .single();

  if (existing) return true; // Sudah dibagikan

  const { error } = await supabase
    .from('group_folders')
    .insert({ group_id: groupId, folder_id: folderId });

  if (error) {
    console.error('Error sharing folder with group:', error.message);
    return false;
  }
  return true;
}

/** Hentikan berbagi folder dari kelompok */
export async function unshareFolderFromGroup(
  folderId: string,
  groupId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('group_folders')
    .delete()
    .eq('group_id', groupId)
    .eq('folder_id', folderId);

  if (error) {
    console.error('Error unsharing folder:', error.message);
    return false;
  }
  return true;
}

/** Ambil daftar folder yang dibagikan ke kelompok */
export async function getGroupFolders(groupId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('group_folders')
    .select('folder_id')
    .eq('group_id', groupId);

  if (error) {
    console.error('Error fetching group folders:', error.message);
    return [];
  }
  return (data || []).map(r => r.folder_id);
}

/** Keluar dari kelompok belajar */
export async function leaveStudyGroup(
  groupId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error leaving group:', error.message);
    return false;
  }
  return true;
}
