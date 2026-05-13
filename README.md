<p align="center">
  <img src="assets/logo-wordmark.png" alt="devscope" width="520" />
</p>

<p align="center">
  Yerel git depolarınızı tarayan, yapay zekâ destekli kişisel geliştirici üretkenlik aracı.<br/>
  Tüm verileriniz makinenizde kalır — hiçbir kod veya commit içeriği üçüncü taraf bir sunucuya gönderilmez
  <em>(kendinizin yapılandırdığı LLM çağrıları hariç)</em>.
</p>

<p align="center">
  <a href="../../releases/latest"><img alt="latest release" src="https://img.shields.io/github/v/release/ceyhunemre0/devscope?display_name=tag&color=8b5cf6" /></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-8b5cf6" /></a>
  <img alt="platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-8b5cf6" />
</p>

---

Ne yapar?
- Kayıtlı projelerinizin son N saatlik commit aktivitesinden **standup tarzı özetler** üretir.
- Çalışmamış dosyalardan akıllı **commit mesajları** önerir.
- Günlük katkı ısı haritası, proje istatistikleri ve geçmiş raporları uygulama içinde gösterir.
- Tek bir **masaüstü uygulaması** (Tauri) olarak çalışır — sunucu / kurulum gerekmez.

---

## 🚀 İndir ve çalıştır (önerilen)

Hiçbir şey kurmanıza gerek yok. İşletim sisteminize göre installer'ı [Releases](../../releases/latest) sayfasından indirin ve çift tıklayın:

| İşletim sistemi    | Dosya                                |
|--------------------|--------------------------------------|
| macOS (Apple Silicon) | `devscope_x.y.z_aarch64.dmg`       |
| macOS (Intel)      | `devscope_x.y.z_x64.dmg`             |
| Windows 10/11      | `devscope_x.y.z_x64-setup.exe` veya `.msi` |
| Linux (Debian/Ubuntu) | `devscope_x.y.z_amd64.deb`        |
| Linux (universal)  | `devscope_x.y.z_amd64.AppImage`      |

Açtığınızda devscope açılır. Yapılması gerekenler:

1. **Settings** sekmesinden bir LLM sağlayıcısı seçin:
   - **OpenAI** kullanmak istiyorsanız → API anahtarınızı (`sk-…`) yapıştırın.
   - **Yerel / ücretsiz** istiyorsanız → [Ollama](https://ollama.com/download)'yı kurun, ardından bir model çekin: `ollama pull llama3.1:8b`.
2. **Projects** sekmesinden bir veya birkaç git deposunun yolunu ekleyin (`~/code/my-app` gibi).
3. **Dashboard** sekmesinde "Run today's summary"e basın — son 24 saatin özetini görürsünüz.

> Notlar — kod imzalı değiliz (Apple Developer / Authenticode yok):
>
> **macOS:** İlk açılışta *"devscope is damaged and can't be opened"* uyarısı görürseniz, sebep macOS Gatekeeper'ın DMG'den kopyalanan `.app` bundle'ına `com.apple.quarantine` xattr'ı eklemesi. (Eski sürümlerdeki *"Backend couldn't start"* sidecar hatası artık görünmüyor — Python sidecar kaldırıldı.) Tek seferlik çözüm — Terminal'de:
> ```bash
> xattr -dr com.apple.quarantine /Applications/devscope.app
> ```
> Uygulamayı kapatıp tekrar açın. Sonraki başlatmalarda sormaz.
>
> **Windows:** SmartScreen "Daha fazla bilgi" → "Yine de çalıştır".

İlk sürüm henüz yayımlanmamışsa [Kaynaktan kurulum (geliştiriciler)](#kaynaktan-kurulum-geliştiriciler) bölümüne bakın.

---

## İçindekiler

1. [Çalışma şekli](#çalışma-şekli)
2. [LLM sağlayıcıları (OpenAI veya Ollama)](#llm-sağlayıcıları)
3. [Verilerin nerede tutulduğu](#verilerin-nerede-tutulduğu)
4. [Sorun giderme](#sorun-giderme)
5. [Kaynaktan kurulum (geliştiriciler)](#kaynaktan-kurulum-geliştiriciler)
6. [Yapılandırma](#yapılandırma)
7. [Sürüm yayımlama (maintainer)](#sürüm-yayımlama-maintainer)
8. [Lisans](#lisans)

## Çalışma şekli

```
   ┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
   │ Yerel git repo  │ ──▶ │  devscope (Tauri │ ──▶ │ LLM sağlayıcı  │
   │ (git2 ile       │     │  Rust + React)   │     │ OpenAI / Ollama│
   │ okunur)         │     │  SQLite          │     └────────────────┘
   └─────────────────┘     └──────────────────┘             │
                                   │                        ▼
                                   ▼               ┌────────────────┐
                          ┌────────────────┐       │ Standup özeti  │
                          │ ~/.devscope/   │       │ commit mesajı  │
                          │ devscope-v2.db │       └────────────────┘
                          └────────────────┘
```

| Bileşen   | Teknoloji                          |
|-----------|------------------------------------|
| Backend   | Rust (sqlx + git2 + reqwest + tera) |
| Frontend  | React 19 + Vite + Tailwind         |
| Shell     | Tauri 2                            |

Tüm backend mantığı Tauri shell'inin içinde Rust olarak çalışır; frontend Tauri `invoke()` üzerinden komutları çağırır. Ayrı bir sunucu / sidecar süreci yoktur. Veriler kullanıcının kişisel veri klasöründeki SQLite veritabanında tutulur.

## LLM sağlayıcıları

Yapılandırılmış sağlayıcı zincirine göre (`provider_chain`) sırayla denenir; örneğin önce OpenAI varsa onu, yoksa Ollama'yı kullanır.

**Ollama (ücretsiz, internet gerekmez):**

```bash
# macOS
brew install ollama
ollama serve &
ollama pull llama3.1:8b
```

**OpenAI (daha kaliteli, ücretli):**

Settings sekmesinde anahtarınızı (`sk-...`) yapıştırmanız yeterlidir; anahtar `~/.devscope/secrets.json` içinde (chmod 600) tutulur.

Bütçe koruyucusu (`llm.budget.hard_stop = true` iken) aylık limit aşıldığında çağrıları reddeder; tahmini maliyet her çağrıdan sonra veritabanına yazılır.

## Verilerin nerede tutulduğu

Tüm devscope durumu tek bir klasördedir:

```
~/.devscope/
├── config.toml         # TOML yapılandırması
├── devscope-v2.db      # SQLite (v0.1.0+; eski devscope.db dokunulmaz)
└── secrets.json        # API anahtarları (chmod 600)
```

Bu klasörü silmek devscope'un hatırladığı her şeyi silmek demektir. **Kayıtlı git depoları içindeki kodunuza dokunulmaz.**

> v0.0.x'ten geliyorsanız: eski `~/.devscope/devscope.db` dokunulmadan duruyor; istemediğinizde silebilirsiniz. v0.0.3 DMG'sini tekrar yükleyerek o sürüme dönebilirsiniz.

Klasörü taşımak isterseniz `DEVSCOPE_HOME` ortam değişkenini ayarlayın.

## Sorun giderme

| Sorun                                                          | Çözüm                                                                          |
|----------------------------------------------------------------|--------------------------------------------------------------------------------|
| macOS: "devscope is damaged and can't be opened"               | `xattr -dr com.apple.quarantine /Applications/devscope.app` (Gatekeeper quarantine xattr'ı). |
| macOS: "devscope bozuk / açılamaz"                             | Finder'da sağ tık → Open → Open. Apple imzalı değil; manuel onay yeterli.       |
| Windows SmartScreen uyarısı                                    | "Daha fazla bilgi" → "Yine de çalıştır".                                       |
| Linux'ta AppImage çalışmıyor                                   | `chmod +x devscope*.AppImage && ./devscope*.AppImage`.                          |
| "OpenAI key required"                                          | Settings sekmesinden API anahtarını girin.                                      |
| Ollama: `connection refused`                                   | `ollama serve` çalışıyor mu kontrol edin (`curl localhost:11434`).              |
| "is not a git repository"                                      | Eklediğiniz yol bir `.git` dizini içermeli. Bare repo'lar şu an desteklenmez.   |
| Bütçe nedeniyle özet üretilmiyor                               | `~/.devscope/config.toml` → `[llm.budget]` altında `monthly_usd`'yi artırın.    |

---

## Kaynaktan kurulum (geliştiriciler)

Yalnızca: yeni özellik eklemek isteyenler, henüz binary bulunmayan platformlar veya katkı sağlayanlar için.

### Gereksinimler

- Node.js ≥ 20 + `pnpm`
- Rust ≥ 1.77 (`rustup`)
- Platforma özgü Tauri ön koşulları → [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

### Geliştirme modunda çalıştırma

```bash
git clone https://github.com/ceyhunemre0/devscope.git
cd devscope
cd frontend && pnpm install && cd ..
cd src-tauri && cargo tauri dev
```

### Yerel installer üretmek

```bash
cd frontend && pnpm gen-types && pnpm build && cd ..
cd src-tauri && cargo tauri build
# → src-tauri/target/release/bundle/ altında platforma uygun dosya
```

Üretilen dosyayı arkadaşınıza vermek, "indir-çalıştır" deneyiminin yerel karşılığıdır.

## Yapılandırma

`~/.devscope/config.toml` (yoksa varsayılanlar uygulanır):

```toml
[llm]
provider_chain = ["ollama"]

[llm.default_model]
ollama = "llama3.1:8b"
openai = "gpt-4o-mini"

[llm.budget]
monthly_usd = 20.0
hard_stop   = true

[scanner]
auto_rescan_days   = 30
max_discover_depth = 4
```

Çevre değişkenleri:

| Değişken            | Anlamı                                                  |
|---------------------|---------------------------------------------------------|
| `DEVSCOPE_HOME`     | Veri klasörünün yerini değiştirir (varsayılan `~/.devscope`) |

## Sürüm yayımlama (maintainer)

Repo'da `.github/workflows/release.yml` mevcut. Yeni sürüm çıkarmak için tek yapmanız gereken:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Bu tag'i ittiğinizde GitHub Actions:

1. macOS arm64, macOS x64, Windows x64 ve Linux x64 runner'larında paralel build başlatır.
2. Her platformda frontend'i derler ve Tauri (Rust) uygulamasını paketler.
3. Tüm artefaktları **taslak (draft) bir GitHub Release**'e ekler.

Release sayfasında dosyaları gözden geçirin, açıklama yazın ve **Publish** butonuna basın. Bu noktada Releases sayfası kullanıcı için hazır.

Tag'i yanlış attıysanız:

```bash
git push --delete origin v0.1.0
git tag -d v0.1.0
```

## Repo yapısı

```
src-tauri/
├── src/
│   ├── lib.rs              Tauri Builder + invoke handler registry
│   ├── commands/           frontend-facing tauri commands (22)
│   ├── db/                 sqlx SQLite (migrations under db/migrations/)
│   ├── git/                git2-based local repo ops + remote parsing
│   ├── llm/                ollama + openai providers, budget guard, router
│   ├── prompts/            Tera template engine + render functions
│   ├── github_api/         reqwest GitHub REST + clone
│   ├── bin/export_types.rs build-time TS type generation
│   ├── config.rs, secrets.rs, error.rs, paths.rs
│   └── templates/          embedded .tera files
├── capabilities/           Tauri permission config
└── tauri.conf.json
frontend/                   React 19 + Vite SPA
.github/workflows/          ci.yml (test) + release.yml (cross-platform installers)
```

## Lisans

[MIT](LICENSE) © 2026 Ceyhun Emre
