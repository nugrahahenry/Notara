// lib/db.ts
// Semua fungsi untuk baca & tulis data ke Supabase
// Analogi: Ini kayak "daftar instruksi" ke petugas arsip — ambil ini, simpan itu, hapus ini

import { supabase } from './supabase';
import type { Folder, Summary, CreateFolderInput, CreateSummaryInput, ChatMessage } from './types';

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
export async function createFolder(input: CreateFolderInput): Promise<Folder | null> {
  const { data, error } = await supabase
    .from('folders')
    .insert(input)
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
export async function createSummary(input: CreateSummaryInput): Promise<Summary | null> {
  const { data, error } = await supabase
    .from('summaries')
    .insert(input)
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
// CHAT MESSAGE OPERATIONS
// ─────────────────────────────────────────────

/** Ambil riwayat chat berdasarkan ID rangkuman */
export async function getChatMessages(summaryId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('summary_id', summaryId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching chat messages:', error.message);
    return [];
  }
  return data || [];
}

/** Simpan chat message baru */
export async function createChatMessage(
  summaryId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      summary_id: summaryId,
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

/** Hapus riwayat chat untuk satu rangkuman */
export async function clearChatMessages(summaryId: string): Promise<boolean> {
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('summary_id', summaryId);

  if (error) {
    console.error('Error clearing chat messages:', error.message);
    return false;
  }
  return true;
}
