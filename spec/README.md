# Indeks Dokumentasi Notara

> Status: aktif. Terakhir diverifikasi: 28 Juli 2026.
> Sumber kebenaran: kode runtime, route API, `lib/`, dan `supabase/migrations/`.
> Perbarui indeks ini saat dokumen ditambah, dipindahkan, atau statusnya berubah.

Dokumen di folder ini adalah kontrak kerja Notara. Ia membedakan perilaku yang benar-benar ada di kode, rancangan yang belum dibangun, dan risiko yang belum ditutup. README lama atau dokumen historis di `docs/` tidak otomatis menjadi sumber kebenaran.

| Dokumen | Kegunaan | Baca ketika |
| --- | --- | --- |
| [PRD.md](PRD.md) | masalah, pengguna, keputusan dan arah produk | menentukan prioritas fitur |
| [BRD.md](BRD.md) | tujuan bisnis, tier, monetisasi, KPI | mengubah harga atau paket |
| [SRS.md](SRS.md) | kebutuhan sistem dan acceptance criteria | mengimplementasikan / menguji fitur |
| [FSD.md](FSD.md) | perilaku rinci setiap alur pengguna | mengubah dashboard atau flow |
| [TECHNICAL-REQUIREMENTS.md](TECHNICAL-REQUIREMENTS.md) | stack, batas platform, konfigurasi, trade-off | mengubah arsitektur/deploy |
| [API-REQUIREMENTS.md](API-REQUIREMENTS.md) | kontrak route API dan batasnya | mengubah client, API, atau abuse controls |
| [DATA-SECURITY-REQUIREMENTS.md](DATA-SECURITY-REQUIREMENTS.md) | data, RLS, threat model, security gaps | menyentuh auth, data, share, atau billing |
| [STUDY-CANVAS.md](STUDY-CANVAS.md) | kontrak UX masa depan Study Canvas | redesign dan component extraction |
| [PROMPT-MASTER-DESIGN-BRAINSTORM.md](PROMPT-MASTER-DESIGN-BRAINSTORM.md) | prompt riset/prototype eksternal | menyiapkan redesign dengan ChatGPT |

Dokumen pendukung di luar folder ini:

- [Documentation audit](../docs/DOCUMENTATION-AUDIT.md): bukti audit, kontradiksi, dan pertanyaan terbuka.
- [Speaker Context](../docs/SPEAKER-CONTEXT.md): kontrak privasi/diarization yang belum diimplementasikan.
- [Handoff](../HANDOFF.md): keadaan operasional sesi terakhir dan titik lanjut.
- `supabase/migrations/`: sumber canonical untuk keadaan database yang telah dipulihkan; bukan `schema.sql` mentah.

## Urutan baca untuk agent baru

1. `README.md`, `HANDOFF.md`, `docs/DOCUMENTATION-AUDIT.md`, lalu `git status`.
2. Dokumen spesifik tugas: security/API untuk backend, FSD/SRS untuk flow, Study Canvas/Speaker Context untuk redesign.
3. Kode dan migrasi yang relevan. Jika dokumen berbeda dari kode terbaru, perbarui dokumen dalam checkpoint yang sama.

## Aturan update checkpoint

- Setiap checkpoint yang mengubah produk atau teknis wajib memperbarui dokumen yang terdampak, metadata verifikasi, `HANDOFF.md`, dan `CHANGELOG.md` bila perilaku rilis berubah.
- Jangan menyatakan fitur production-ready tanpa bukti test/deploy yang dicatat.
- Jangan masukkan key, token, URL privat, email pengujian, ekspor database, atau transkrip pengguna ke dokumen tracked.
- Perubahan keamanan, RLS, auth, webhook, dan retensi data wajib memperbarui `DATA-SECURITY-REQUIREMENTS.md` pada checkpoint yang sama.
