# FFmpeg Dönüşüm Yetenekleri ve Donanım Hızlandırma Raporu

## 1. Genel Bakış

FFmpeg; ses, video, altyazı ve medya akışları üzerinde dönüştürme, işleme, paketleme, çözme, encode etme ve yayınlama işlemleri yapabilen güçlü bir medya aracıdır.

Temel kullanım örneği:

```bash
ffmpeg -i input.mp4 output.webm
```

Bu komut bir MP4 dosyasını WebM formatına dönüştürür.

FFmpeg ile çalışırken iki temel kavramı ayırmak gerekir:

1. **Container / kapsayıcı format**
2. **Codec / sıkıştırma biçimi**

Örneğin:

```text
video.mp4
```

Burada `.mp4` dosya kapsayıcısıdır. Dosyanın içinde video codec’i olarak H.264, H.265, AV1; ses codec’i olarak AAC, MP3 veya Opus bulunabilir.

---

## 2. FFmpeg Neleri Nelere Dönüştürebilir?

FFmpeg çok geniş format desteğine sahiptir. Dosya kapsayıcısını değiştirebilir, video codec’ini dönüştürebilir, ses codec’ini değiştirebilir, altyazı ekleyebilir veya medya dosyasını streaming formatlarına dönüştürebilir.

### 2.1 Yaygın Container Dönüşümleri

| Kaynak Format | Hedef Format |
|---|---|
| MP4 | MKV |
| MKV | MP4 |
| MOV | MP4 |
| AVI | MP4 |
| WebM | MP4 |
| TS | MP4 |
| FLV | MP4 |
| MP4 | HLS |
| MP4 | DASH |
| MP3 | WAV |
| WAV | FLAC |
| FLAC | MP3 |
| AAC | MP3 |
| OGG | MP3 |

Örnek:

```bash
ffmpeg -i input.mkv output.mp4
```

Bu işlem hedef formata göre yeniden encode yapabilir veya yalnızca kapsayıcıyı değiştirebilir.

---

## 3. Re-mux: Kalite Kaybı Olmadan Container Değiştirme

Eğer video ve ses codec’leri hedef container ile uyumluysa, yeniden sıkıştırma yapmadan sadece kapsayıcı değiştirilebilir.

```bash
ffmpeg -i input.mkv -c copy output.mp4
```

Bu işlemin avantajları:

- Çok hızlıdır.
- Kalite kaybı oluşturmaz.
- CPU kullanımı düşüktür.
- Sadece medya dosyasının ambalajı değişir.

Ancak kaynak dosyadaki codec hedef container tarafından desteklenmiyorsa hata alınabilir veya ilgili stream yeniden encode edilmelidir.

---

## 4. Video Codec Dönüşümleri

FFmpeg ile birçok video codec’ine encode yapılabilir.

| Codec | Kullanım Alanı |
|---|---|
| H.264 / AVC | En yaygın ve uyumlu video formatı |
| H.265 / HEVC | Daha iyi sıkıştırma, modern cihaz desteği |
| AV1 | Yüksek sıkıştırma, modern açık codec |
| VP9 | WebM ve YouTube tarafında yaygın |
| ProRes | Profesyonel kurgu iş akışları |
| DNxHD / DNxHR | Profesyonel kurgu iş akışları |
| MPEG-2 | Eski yayın ve DVD işleri |
| Theora | Eski açık video formatı |

### 4.1 H.264 Encode

```bash
ffmpeg -i input.mov -c:v libx264 -crf 23 -preset medium -c:a aac output.mp4
```

### 4.2 H.265 Encode

```bash
ffmpeg -i input.mp4 -c:v libx265 -crf 28 -c:a aac output.mp4
```

### 4.3 AV1 Encode

```bash
ffmpeg -i input.mp4 -c:v libsvtav1 -crf 30 -c:a libopus output.mkv
```

---

## 5. Ses Dönüşümleri

FFmpeg ses formatları arasında da geniş dönüşüm desteği sağlar.

| Kaynak | Hedef |
|---|---|
| WAV | MP3 |
| WAV | FLAC |
| FLAC | AAC |
| MP3 | AAC |
| AAC | Opus |
| OGG | MP3 |
| M4A | MP3 |

### 5.1 WAV Dosyasını MP3’e Dönüştürme

```bash
ffmpeg -i input.wav -c:a libmp3lame -b:a 192k output.mp3
```

### 5.2 WAV Dosyasını Opus’a Dönüştürme

```bash
ffmpeg -i input.wav -c:a libopus -b:a 128k output.opus
```

### 5.3 Videodan Ses Çıkarma

```bash
ffmpeg -i input.mp4 -vn -c:a mp3 output.mp3
```

---

## 6. Görsel ve Kare İşlemleri

FFmpeg videodan kare çıkarabilir veya görsellerden video oluşturabilir.

### 6.1 Videodan Kare Çıkarma

```bash
ffmpeg -i input.mp4 frame_%04d.png
```

### 6.2 Belirli Saniyeden Thumbnail Alma

```bash
ffmpeg -ss 00:00:10 -i input.mp4 -frames:v 1 thumb.jpg
```

### 6.3 Görsellerden Video Oluşturma

```bash
ffmpeg -framerate 30 -i frame_%04d.png -c:v libx264 output.mp4
```

---

## 7. Altyazı İşlemleri

FFmpeg altyazıları dönüştürebilir, medya dosyasına gömebilir veya videonun üzerine kalıcı olarak basabilir.

### 7.1 Altyazıyı Dosyaya Gömme

```bash
ffmpeg -i video.mp4 -i subtitle.srt -c copy -c:s mov_text output.mp4
```

### 7.2 Altyazıyı Videoya Kalıcı Basma

```bash
ffmpeg -i video.mp4 -vf subtitles=subtitle.srt output.mp4
```

---

## 8. Streaming ve Yayın Formatları

FFmpeg canlı yayın ve streaming senaryolarında da kullanılabilir.

Başlıca kullanım alanları:

- RTMP yayını
- HLS üretimi
- MPEG-DASH üretimi
- IP kamera stream alma
- Canlı yayın transcode işlemleri
- Medya sunucusu pipeline’ları

### 8.1 HLS Üretimi

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -c:a aac \
  -f hls \
  -hls_time 6 \
  -hls_playlist_type vod \
  output.m3u8
```

### 8.2 RTMP Yayını

```bash
ffmpeg -re -i input.mp4 -c:v libx264 -c:a aac -f flv rtmp://server/app/key
```

---

# 9. FFmpeg’de Donanım Hızlandırma

Donanım hızlandırma, medya işleme sürecinin CPU yerine GPU veya özel medya donanımı tarafından yapılmasını sağlar.

FFmpeg’de donanım hızlandırma iki ana yerde kullanılır:

1. **Decode hızlandırma:** Videoyu çözme işlemi donanım tarafından yapılır.
2. **Encode hızlandırma:** Videoyu yeniden sıkıştırma işlemi donanım encoder tarafından yapılır.

Örnek:

```bash
ffmpeg -hwaccel cuda -i input.mp4 -c:v h264_nvenc output.mp4
```

Bu komutta:

- `-hwaccel cuda`: Decode tarafında CUDA kullanılmasını dener.
- `-c:v h264_nvenc`: Encode tarafında NVIDIA NVENC encoder kullanılır.

---

## 10. Yaygın Donanım Hızlandırma Teknolojileri

| Platform | Teknoloji | Encoder Örnekleri |
|---|---|---|
| NVIDIA | NVENC / CUDA | `h264_nvenc`, `hevc_nvenc`, `av1_nvenc` |
| Intel | Quick Sync Video / QSV | `h264_qsv`, `hevc_qsv`, `av1_qsv` |
| AMD | AMF | `h264_amf`, `hevc_amf`, `av1_amf` |
| Apple | VideoToolbox | `h264_videotoolbox`, `hevc_videotoolbox` |
| Linux | VAAPI | `h264_vaapi`, `hevc_vaapi`, `av1_vaapi` |
| Linux | Vulkan / OpenCL | Daha çok filtre ve işleme tarafında kullanılır |

Donanım desteği ekran kartına, sürücüye, işletim sistemine ve FFmpeg’in nasıl derlendiğine bağlıdır.

---

## 11. NVIDIA NVENC Örnekleri

### 11.1 H.264 NVENC

```bash
ffmpeg -i input.mp4 -c:v h264_nvenc -preset p5 -cq 23 -c:a copy output.mp4
```

### 11.2 HEVC NVENC

```bash
ffmpeg -i input.mp4 -c:v hevc_nvenc -preset p5 -cq 25 -c:a copy output.mp4
```

### 11.3 AV1 NVENC

AV1 NVENC yalnızca destekleyen yeni NVIDIA kartlarda kullanılabilir.

```bash
ffmpeg -i input.mp4 -c:v av1_nvenc -cq 30 -c:a copy output.mkv
```

---

## 12. Intel Quick Sync Örnekleri

### 12.1 H.264 QSV

```bash
ffmpeg -hwaccel qsv -i input.mp4 -c:v h264_qsv -global_quality 23 -c:a copy output.mp4
```

### 12.2 HEVC QSV

```bash
ffmpeg -hwaccel qsv -i input.mp4 -c:v hevc_qsv -global_quality 25 -c:a copy output.mp4
```

---

## 13. AMD AMF Örnekleri

### 13.1 H.264 AMF

```bash
ffmpeg -i input.mp4 -c:v h264_amf -quality quality -rc cqp -qp_i 23 -qp_p 23 output.mp4
```

### 13.2 HEVC AMF

```bash
ffmpeg -i input.mp4 -c:v hevc_amf -quality quality output.mp4
```

---

## 14. Apple VideoToolbox Örnekleri

### 14.1 H.264 VideoToolbox

```bash
ffmpeg -i input.mov -c:v h264_videotoolbox -b:v 5000k -c:a aac output.mp4
```

### 14.2 HEVC VideoToolbox

```bash
ffmpeg -i input.mov -c:v hevc_videotoolbox -b:v 5000k -c:a aac output.mp4
```

---

# 15. Donanım Hızlandırmanın Avantajları

Donanım encoder kullanmanın başlıca avantajları şunlardır:

- Encode işlemi çok daha hızlı olabilir.
- CPU kullanımı azalır.
- Canlı yayın ve toplu dönüştürme işlemlerinde avantaj sağlar.
- 4K ve 8K gibi yüksek çözünürlüklü işlemler daha pratik hale gelir.
- Medya sunucusu, kamera stream’i ve gerçek zamanlı transcode senaryolarında faydalıdır.

Özellikle gerçek zamanlı yayın, çok sayıda video dönüştürme ve düşük CPU kullanımı gereken sistemlerde donanım hızlandırma önemli bir avantaj sağlar.

---

## 16. Donanım Hızlandırmanın Dezavantajları

Donanım encode her zaman en iyi kaliteyi veya en küçük dosya boyutunu vermez.

Genel eğilim:

```text
CPU encoder kalite/verimlilikte daha iyi olabilir.
GPU encoder hızda daha iyi olabilir.
```

Örneğin `libx264` veya `libx265`, aynı bitrate değerinde çoğu durumda donanım encoder’lardan daha iyi görsel kalite verebilir. Ancak donanım encoder’lar genellikle çok daha hızlıdır.

| Amaç | Önerilen Tercih |
|---|---|
| En iyi kalite / küçük dosya | CPU encode |
| En hızlı dönüşüm | GPU encode |
| Canlı yayın | GPU encode |
| Arşivleme | CPU encode genelde daha uygundur |
| Çok sayıda video dönüştürme | GPU encode avantajlıdır |
| Eski cihaz uyumluluğu | H.264 + AAC + MP4 |

---

## 17. Decode Tarafında Donanım Hızlandırma

Sadece encode değil, decode işlemi de donanım hızlandırma ile yapılabilir.

### 17.1 NVIDIA CUDA Decode + NVENC Encode

```bash
ffmpeg -hwaccel cuda -i input.mp4 -c:v h264_nvenc output.mp4
```

### 17.2 VAAPI Decode / Encode

```bash
ffmpeg -hwaccel vaapi -i input.mp4 -c:v h264_vaapi output.mp4
```

Ancak bazı durumlarda donanım decode eklemek performansa ciddi katkı sağlamayabilir. Eğer darboğaz encode tarafındaysa veya kullanılan filtreler CPU’da çalışıyorsa, toplam hız artışı sınırlı kalabilir.

---

## 18. Filtrelerde GPU ve CPU Veri Transferi

FFmpeg’de filtre kullanırken dikkat edilmesi gereken önemli bir konu GPU ve CPU arasındaki veri transferidir.

Örneğin şu ölçekleme filtresi CPU tarafında çalışır:

```bash
-vf scale=1280:720
```

GPU ile encode yapılsa bile, filtre CPU’da çalışıyorsa veri GPU’dan CPU’ya, ardından tekrar GPU’ya taşınabilir. Bu durum performansı düşürebilir.

### 18.1 NVIDIA GPU Üzerinde Ölçekleme

```bash
ffmpeg -hwaccel cuda -hwaccel_output_format cuda \
  -i input.mp4 \
  -vf scale_cuda=1280:720 \
  -c:v h264_nvenc output.mp4
```

### 18.2 VAAPI Üzerinde Ölçekleme

```bash
ffmpeg -vaapi_device /dev/dri/renderD128 \
  -i input.mp4 \
  -vf 'format=nv12,hwupload,scale_vaapi=w=1280:h=720' \
  -c:v h264_vaapi output.mp4
```

---

# 19. Hangi Codec Ne Zaman Seçilmeli?

| Senaryo | Öneri |
|---|---|
| Maksimum uyumluluk | MP4 + H.264 + AAC |
| Daha küçük dosya | H.265 / HEVC |
| Modern açık web formatı | WebM + VP9 veya AV1 |
| YouTube yükleme | H.264 veya HEVC |
| Profesyonel kurgu | ProRes / DNxHR |
| Canlı yayın | H.264 NVENC / QSV / AMF |
| Ses arşivi | FLAC |
| Ses streaming | AAC veya Opus |
| En iyi sıkıştırma | AV1 |

---

## 20. FFmpeg’de Desteklenen Özellikleri Kontrol Etme

Kullanılan FFmpeg derlemesinde hangi encoder, decoder, format ve filtrelerin bulunduğu aşağıdaki komutlarla kontrol edilebilir.

### 20.1 Encoder Listesi

```bash
ffmpeg -encoders
```

### 20.2 Decoder Listesi

```bash
ffmpeg -decoders
```

### 20.3 Donanım Hızlandırma Listesi

```bash
ffmpeg -hwaccels
```

### 20.4 Belirli Bir Encoder Hakkında Bilgi

```bash
ffmpeg -h encoder=h264_nvenc
```

### 20.5 Filtre Listesi

```bash
ffmpeg -filters
```

### 20.6 Format Listesi

```bash
ffmpeg -formats
```

---

# 21. Önerilen Varsayılan Komutlar

## 21.1 Uyumlu ve Güvenli CPU Encode

```bash
ffmpeg -i input.mkv -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 160k output.mp4
```

Bu komut genel uyumluluk için iyi bir varsayılandır.

## 21.2 NVIDIA ile Hızlı Encode

```bash
ffmpeg -i input.mkv -c:v h264_nvenc -cq 23 -preset p5 -c:a aac -b:a 160k output.mp4
```

Bu komut NVIDIA GPU bulunan sistemlerde hızlı encode için kullanılabilir.

---

# 22. Sonuç

FFmpeg aşağıdaki işlemler için kullanılabilir:

- Video formatı dönüştürme
- Ses formatı dönüştürme
- Container değiştirme
- Codec değiştirme
- Video kırpma, ölçekleme ve döndürme
- Altyazı ekleme veya altyazıyı videoya yakma
- Görsellerden video üretme
- Videodan kare çıkarma
- Canlı yayın yapma
- HLS ve DASH paketleri üretme
- Donanım hızlandırma ile GPU encoder/decoder kullanma

Genel karar mantığı:

```text
Kalite ve küçük dosya önemliyse: CPU encoder
Hız ve gerçek zamanlı işlem önemliyse: GPU encoder
```

En yaygın uyumluluk hedefi için önerilen kombinasyon:

```text
MP4 + H.264 + AAC
```

Daha modern ve yüksek sıkıştırma odaklı senaryolarda ise H.265/HEVC veya AV1 tercih edilebilir.
