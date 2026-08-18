import { getGuidedObjectiveLabel, normalizeGuidedObjective } from './objective';
import type {
  GuidedObjectiveDraft,
  GuidedObjectiveKind,
  GuidedRouteDraft,
  GuidedRouteNode,
} from './types';

type PromptSet = Record<GuidedRouteNode['kind'], string>;

function buildPrompts(objective: GuidedObjectiveDraft): PromptSet {
  const kind: GuidedObjectiveKind = objective.kind;
  if (kind === 'compare-concepts') {
    return {
      orient: 'Baca orientasi materi dan tentukan bagian yang relevan dengan perbandinganmu.',
      focus: 'Tuliskan dua konsep atau bagian yang ingin kamu bedakan.',
      connect: 'Bandingkan keduanya berdasarkan ciri, fungsi, atau konteks yang benar-benar ada pada materi.',
      recall: 'Jelaskan perbedaan itu tanpa melihat catatan, lalu periksa kembali sumber.',
      check: 'Nilai sendiri apakah perbedaannya sudah jelas dan tulis pertanyaan yang masih tersisa.',
    };
  }
  if (kind === 'prepare-quiz') {
    return {
      orient: 'Petakan ruang lingkup materi yang perlu kamu ingat untuk persiapan kuis.',
      focus: 'Pilih bagian yang paling penting untuk dapat dijelaskan tanpa bantuan catatan.',
      connect: 'Hubungkan istilah, alasan, atau contoh yang muncul pada materi agar lebih mudah diingat.',
      recall: 'Jelaskan kembali bagian pilihanmu tanpa membuka sumber. Tidak ada skor pada langkah ini.',
      check: 'Catat bagian yang sudah terasa mantap dan bagian yang perlu kamu ulangi atau tanyakan.',
    };
  }
  if (kind === 'review-material') {
    return {
      orient: 'Baca kembali orientasi materi dan ingat tujuan awal pembahasannya.',
      focus: 'Tandai bagian yang paling perlu kamu ulangi hari ini.',
      connect: 'Hubungkan bagian itu dengan penjelasan atau contoh lain yang memang ada pada materi.',
      recall: 'Ringkas kembali materi dengan bahasamu sendiri tanpa melihat seluruh rangkuman.',
      check: 'Nilai sendiri bagian yang sudah dapat dijelaskan dan bagian yang masih perlu ditinjau.',
    };
  }
  if (kind === 'custom') {
    const goal = getGuidedObjectiveLabel(objective);
    return {
      orient: `Baca orientasi materi sambil mengingat tujuanmu: ${goal}`,
      focus: `Pilih bagian materi yang paling relevan dengan tujuanmu: ${goal}`,
      connect: 'Hubungkan bagian pilihanmu dengan contoh, perbedaan, atau konteks yang benar-benar ada pada materi.',
      recall: 'Jelaskan kembali hubungan itu tanpa melihat seluruh sumber.',
      check: 'Nilai sendiri apakah tujuanmu sudah lebih jelas dan tulis pertanyaan yang masih tersisa.',
    };
  }
  return {
    orient: 'Baca orientasi materi dan catat ruang lingkup yang sedang dibahas.',
    focus: 'Jelaskan gagasan utama materi ini dengan bahasamu sendiri.',
    connect: 'Hubungkan gagasan utama dengan satu contoh atau konteks yang kamu pahami.',
    recall: 'Tutup sumber sejenak, lalu jelaskan kembali inti materi tanpa melihat catatan.',
    check: 'Nilai sendiri apa yang sudah dapat kamu jelaskan dan bagian yang masih perlu ditanya.',
  };
}

export function buildGuidedRoute(
  materialId: string,
  objective: GuidedObjectiveDraft,
): GuidedRouteDraft | null {
  const normalized = normalizeGuidedObjective(objective);
  if (!normalized) return null;

  const prompts = buildPrompts(normalized);
  const nodes: readonly GuidedRouteNode[] = [
    { id: 'orient', kind: 'orient', title: 'Orientasi', prompt: prompts.orient, sourceSurface: 'summary' },
    { id: 'focus', kind: 'focus', title: 'Fokus', prompt: prompts.focus, sourceSurface: 'summary' },
    { id: 'connect', kind: 'connect', title: 'Hubungkan', prompt: prompts.connect, sourceSurface: 'transcript' },
    { id: 'recall', kind: 'recall', title: 'Recall', prompt: prompts.recall, sourceSurface: 'reflection' },
    { id: 'check', kind: 'check', title: 'Cek', prompt: prompts.check, sourceSurface: 'reflection' },
  ];

  return {
    materialId,
    objective: normalized,
    builderVersion: 'deterministic-v1',
    nodes,
  };
}

