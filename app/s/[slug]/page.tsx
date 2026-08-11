import { notFound } from 'next/navigation';
import Link from 'next/link';
import { 
  Calendar, Clock, FileText, Brain, ArrowLeft, BookOpen, 
  FileAudio, Sparkles, Check, ChevronRight 
} from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { getSummaryBySlug, formatDuration } from '@/lib/db';
import ForkButton from './ForkButton';

// 1. DYNAMIC METADATA (SEO)
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const summary = await getSummaryBySlug(slug);

  if (!summary) {
    return {
      title: 'Halaman Tidak Ditemukan - Nalira',
      description: 'Rangkuman materi yang Anda cari tidak ditemukan atau telah diubah menjadi privat.',
    };
  }

  return {
    title: `${summary.title} - Rangkuman Nalira`,
    description: `Baca rangkuman materi "${summary.title}" (${summary.word_count || 0} kata) secara gratis di Nalira. Dibuat menggunakan AI asisten pintar.`,
    openGraph: {
      title: `${summary.title} - Rangkuman Nalira`,
      description: `Baca rangkuman materi "${summary.title}" secara gratis di Nalira.`,
      type: 'article',
    },
  };
}

// 2. PARSE MARKDOWN UTILITY (Server-side compatible)
function renderMarkdownServer(text: string) {
  const parseInline = (str: string) => {
    let html = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-violet-300 font-mono text-xs font-semibold">$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em class="italic text-zinc-200">$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em class="italic text-zinc-200">$1</em>');
    
    return html;
  };

  const lines = text.split('\n');
  let insideList = false;
  let listItems: React.ReactNode[] = [];
  const elements: React.ReactNode[] = [];

  // Table state
  let tableLines: string[] = [];
  let insideTable = false;

  const flushList = (keyPrefix: string) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`${keyPrefix}-list`} className="space-y-2.5 my-4 list-disc pl-6 text-zinc-300">
          {listItems}
        </ul>
      );
      listItems = [];
      insideList = false;
    }
  };

  const flushTable = (keyPrefix: string) => {
    if (tableLines.length < 2) {
      tableLines = [];
      insideTable = false;
      return;
    }
    const rows = tableLines.filter(l => !l.replace(/[|\-:\s]/g, '').trim() === false || !/^[|\s\-:]+$/.test(l));
    if (rows.length === 0) {
      tableLines = [];
      insideTable = false;
      return;
    }
    const headerRow = rows[0];
    const dataRows = rows.slice(1);
    const parseRow = (row: string) =>
      row.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    const headers = parseRow(headerRow);
    elements.push(
      <div key={`table-${keyPrefix}`} className="overflow-x-auto my-6 rounded-xl border border-white/[0.07] shadow-xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-violet-600/10 border-b border-white/[0.07]">
              {headers.map((h, hi) => (
                <th
                  key={hi}
                  className="px-4 py-3 text-left text-xs font-bold text-violet-300 uppercase tracking-wider"
                  dangerouslySetInnerHTML={{ __html: parseInline(h) }}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, ri) => {
              const cells = parseRow(row);
              return (
                <tr
                  key={ri}
                  className={ri % 2 === 0 ? 'bg-white/[0.01]' : 'bg-white/[0.03]'}
                >
                  {cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-4 py-2.5 text-zinc-300 leading-relaxed border-t border-white/[0.04]"
                      dangerouslySetInnerHTML={{ __html: parseInline(cell) }}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    tableLines = [];
    insideTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanLine = line.trim();

    const isTableRow = cleanLine.startsWith('|') && cleanLine.endsWith('|') && (cleanLine.match(/\|/g) || []).length >= 2;
    if (isTableRow) {
      flushList(`tbl-pre-${i}`);
      insideTable = true;
      tableLines.push(cleanLine);
      const nextLine = lines[i + 1]?.trim() || '';
      const nextIsTableRow = nextLine.startsWith('|') && nextLine.endsWith('|') && (nextLine.match(/\|/g) || []).length >= 2;
      if (!nextIsTableRow) {
        flushTable(`${i}`);
      }
      continue;
    }

    if (insideTable) {
      flushTable(`flush-${i}`);
    }

    if (cleanLine === '---' || cleanLine === '***' || cleanLine === '___') {
      flushList(`hr-${i}`);
      elements.push(
        <hr key={`hr-${i}`} className="my-6 border-white/[0.07]" />
      );
      continue;
    }

    if (cleanLine.startsWith('# ')) {
      flushList(`h1-${i}`);
      elements.push(
        <h1 key={`h1-${i}`} className="text-2xl md:text-3xl font-extrabold text-white mt-8 mb-4 border-b border-white/10 pb-3 tracking-tight">
          {cleanLine.replace('# ', '')}
        </h1>
      );
      continue;
    }

    if (cleanLine.startsWith('## ')) {
      flushList(`h2-${i}`);
      elements.push(
        <h2 key={`h2-${i}`} className="text-xl md:text-2xl font-bold text-violet-400 mt-8 mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 inline-block"></span>
          {cleanLine.replace('## ', '')}
        </h2>
      );
      continue;
    }

    if (cleanLine.startsWith('### ')) {
      flushList(`h3-${i}`);
      elements.push(
        <h3 key={`h3-${i}`} className="text-lg md:text-xl font-semibold text-zinc-100 mt-6 mb-2">
          {cleanLine.replace('### ', '')}
        </h3>
      );
      continue;
    }

    if (cleanLine.startsWith('> ')) {
      flushList(`bq-${i}`);
      const content = cleanLine.replace(/^>\s+/, '');
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-4 border-violet-500 bg-violet-500/5 px-4 py-3 rounded-r-xl my-4 text-zinc-300 italic">
          <p dangerouslySetInnerHTML={{ __html: parseInline(content) }} />
        </blockquote>
      );
      continue;
    }

    if (cleanLine.startsWith('* ') || cleanLine.startsWith('- ')) {
      insideList = true;
      const content = cleanLine.replace(/^[\*\-]\s+/, '');
      listItems.push(
        <li 
          key={`li-${i}`} 
          className="leading-relaxed"
          dangerouslySetInnerHTML={{ __html: parseInline(content) }}
        />
      );
      continue;
    }

    const orderListMatch = cleanLine.match(/^\d+\.\s+(.+)$/);
    if (orderListMatch) {
      flushList(`ol-${i}`);
      const content = orderListMatch[1];
      const num = cleanLine.match(/^\d+/)?.[0] || '1';
      elements.push(
        <div key={`ol-${i}`} className="flex gap-3 items-start my-2.5 pl-2">
          <span className="flex-shrink-0 h-6 w-6 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 font-bold text-xs flex items-center justify-center mt-0.5">
            {num}
          </span>
          <p 
            className="text-zinc-300 leading-relaxed flex-1"
            dangerouslySetInnerHTML={{ __html: parseInline(content) }}
          />
        </div>
      );
      continue;
    }

    if (cleanLine === '') {
      flushList(`empty-${i}`);
      elements.push(<div key={`empty-${i}`} className="h-3" />);
      continue;
    }

    flushList(`p-${i}`);
    elements.push(
      <p 
        key={`p-${i}`} 
        className="text-zinc-300 leading-relaxed mb-4"
        dangerouslySetInnerHTML={{ __html: parseInline(line) }}
      />
    );
  }

  if (insideList && listItems.length > 0) {
    elements.push(
      <ul key="end-list" className="space-y-2.5 my-4 list-disc pl-6 text-zinc-300">
        {listItems}
      </ul>
    );
  }

  if (insideTable) flushTable('end');

  return elements;
}

// 3. MAIN SERVER COMPONENT
export default async function PublicSummaryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const summary = await getSummaryBySlug(slug);

  // Jika tidak ditemukan atau privat, arahkan ke 404
  if (!summary) {
    notFound();
  }

  // Cek apakah user sedang login saat ini di server
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isLoggedIn = !!session;

  const formattedDate = new Date(summary.created_at).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-[#09080E] text-zinc-100 font-sans relative overflow-x-hidden selection:bg-violet-600/30 selection:text-violet-200">
      
      {/* Decorative background glow orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] aspect-square rounded-full bg-violet-900/10 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[20%] right-[-10%] w-[45%] aspect-square rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none z-0" />
      
      {/* Grid Pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0 opacity-80" />

      {/* HEADER BAR */}
      <header className="sticky top-0 z-50 bg-[#09080E]/60 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={isLoggedIn ? '/' : '/login'} className="flex items-center gap-2 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform duration-200">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400 tracking-tight">
              Nalira
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400">
              Bagikan
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link 
                href="/"
                className="h-10 px-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5"
              >
                <span>Ke Dashboard</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <Link 
                href="/login"
                className="h-10 px-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300 hover:text-white transition-all flex items-center"
              >
                Masuk
              </Link>
            )}
            
            <ForkButton summary={summary} />
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-4xl mx-auto px-4 py-8 relative z-10 space-y-6">
        
        {/* Breadcrumb back */}
        {isLoggedIn && (
          <Link href="/" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors group">
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-1 transition-transform" />
            <span>Kembali ke Perpustakaan Saya</span>
          </Link>
        )}

        {/* DETAILS CARD */}
        <div className="p-6 md:p-8 rounded-3xl bg-white/[0.01] border border-white/[0.04] backdrop-blur-md shadow-2xl space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-black text-white leading-tight tracking-tight select-text">
              {summary.title}
            </h1>
          </div>

          {/* METADATA GRID */}
          <div className="flex flex-wrap items-center gap-y-3 gap-x-5 text-xs text-zinc-400 border-t border-white/[0.04] pt-4">
            
            {summary.file_name && (
              <div className="flex items-center gap-1.5">
                <FileAudio className="h-3.5 w-3.5 text-zinc-500" />
                <span className="truncate max-w-[200px]" title={summary.file_name}>
                  {summary.file_name}
                </span>
              </div>
            )}

            {summary.duration_sec && (
              <div>
                <span className="font-semibold text-zinc-500">Durasi:</span>{' '}
                <span className="text-zinc-300 font-mono">
                  {formatDuration(summary.duration_sec)}
                </span>
              </div>
            )}

            {summary.word_count && (
              <div>
                <span className="font-semibold text-zinc-500">Total Kata:</span>{' '}
                <span className="text-zinc-300 font-medium">{summary.word_count} kata</span>
              </div>
            )}

            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-zinc-500" />
              <span>Dibuat {formattedDate}</span>
            </div>
          </div>
        </div>

        {/* SUMMARY RENDER CARD */}
        <div className="rounded-3xl bg-white/[0.01] border border-white/[0.04] backdrop-blur-md shadow-2xl p-6 md:p-10 min-h-[400px]">
          <div className="flex items-center gap-2 mb-6 text-xs text-violet-400 font-bold uppercase tracking-wider border-b border-white/[0.04] pb-4">
            <BookOpen className="h-4 w-4" />
            <span>Isi Rangkuman Materi</span>
          </div>

          <article className="prose prose-invert max-w-none prose-headings:text-white prose-p:leading-relaxed select-text">
            {renderMarkdownServer(summary.summary)}
          </article>
        </div>

        {/* BOTTOM CTA */}
        <div className="p-8 rounded-3xl bg-gradient-to-tr from-violet-950/20 via-indigo-950/10 to-transparent border border-violet-500/10 backdrop-blur-md text-center space-y-4 max-w-2xl mx-auto py-10 relative overflow-hidden">
          {/* Accent light element */}
          <div className="absolute top-[-50%] left-[25%] w-[50%] h-[100%] rounded-full bg-violet-600/5 blur-[50px] pointer-events-none" />

          <Brain className="h-10 w-10 text-violet-400 mx-auto animate-pulse" />
          <h3 className="text-lg font-black text-white">Ingin merangkum materi belajar Anda sendiri?</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            Nalira membantu Anda mencatat kuliah, rapat, atau rekaman audio lainnya menjadi rangkuman super rapi menggunakan kecerdasan buatan.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            {isLoggedIn ? (
              <Link 
                href="/"
                className="h-10 px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-lg shadow-violet-500/10 flex items-center"
              >
                Buka Nalira Saya
              </Link>
            ) : (
              <>
                <Link 
                  href="/login"
                  className="h-10 px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-lg shadow-violet-500/10 flex items-center"
                >
                  Daftar Gratis Sekarang
                </Link>
                <ForkButton summary={summary} />
              </>
            )}
          </div>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="py-8 border-t border-white/[0.03] text-center text-xs text-zinc-600 mt-16">
        <p>© {new Date().getFullYear()} Nalira. Semua hak cipta dilindungi.</p>
      </footer>

    </div>
  );
}
