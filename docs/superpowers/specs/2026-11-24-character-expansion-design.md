# Character Catalog Expansion Design

**Status:** Approved approach: hybrid image catalog (curated URLs + existing automatic resolver).

## Intent
Expand the chatbot's character catalog across all four requested areas while preserving the 118 existing profiles and the current per-user/per-chat selection and memory behavior.

## Scope
Add 91 new profiles, with no duplicate names or IDs against the current 118:

- **Zenless Zone Zero (21):** Grace Howard, Alexandrina Sebastiane, Von Lycaon, Koleda Belobog, Soldier 11, Burnice White, Lucy (Zenless Zone Zero), Seth Lowell, Lighter, Tsukishiro Yanagi, Asaba Harumasa, Astra Yao, Evelyn Chevalier, Hugo Vlad, Ukinami Yuzuha, Zhu Yuan, Aria, Alice Thymefield, Nangong Yu, Trigger, Vivian.
- **Tower of Fantasy (13):** Fenrir, Alyss, Fiona, Claudia, Frigg, Saki Fuwa, Ruby, Liu Huo, Yu Lan, Ling Han, Nan Yin, Mimi, Fei Se. Existing Lin and Nemesis profiles remain in place.
- **Arknights: Endfield (35):** Kay, Mimino, Endministrator, Chen Qianyu, Si, Argent Flow, Typhoeus, Purrchena, Arcane, Liino, Mi Fu, Camille, Zhuang Fangyi, Tangtang, Rossi, Laevatain, Yvonne, Gilberta, Ardelia, Ember, Last Rite, Lifeng, Pogranichnik, Alesh, Arclight, Avywenna, Da Pan, Snowshine, Wulfgard, Xaihi, Akekuri, Antal, Catcher, Estella, Fluorite. Perlica already exists. The two player-gender presentations of Endministrator are represented by one profile to avoid duplicate entries.
- **Anime (22):** Yuji Itadori, Satoru Gojo, Megumi Fushiguro, Nobara Kugisaki, Tanjiro Kamado, Zenitsu Agatsuma, Inosuke Hashibira, Giyu Tomioka, Kanao Tsuyuri, Hitori Gotoh, Nijika Ijichi, Ryo Yamada, Ikuyo Kita, Rimuru Tempest, Milim Nava, Benimaru, Saitama, Genos, Kaguya Shinomiya, Miyuki Shirogane, Aqua Hoshino, Ruby Hoshino.

## Image approach
Keep the existing automatic Jikan/Wikimedia resolver unchanged for the general catalog. Set curated HTTPS image URLs only for the priority profiles: Anby Demara, Nicole Demara, Grace Howard, Alexandrina Sebastiane, Zhu Yuan, and Laevatain. Do not download or commit image binaries; use remotely hosted source URLs. Other new profiles continue through the existing automatic lookup. Existing profiles without explicit URLs keep their current behavior.

Selected image sources:
- Anby: https://img.gachabase.net/conv/zzz/assets/b4ab0294ac888e092e88dad1b15eb993.png?q=50&sig=05c47ba96bcc4e0b12618a3bbfd293d8137412510ada0b5395f07536638ddf18
- Nicole: https://act-upload.hoyoverse.com/event-ugc-hoyowiki/2026/04/14/98205622/0d56606a746c3365983e8b641469ba10_1830848742467791339.png
- Grace: https://cdn.oneesports.gg/cdn-data/2024/07/ZenlessZoneZero_Agent_GraceHoward.jpg
- Alexandrina/Rina: https://zenless-zone-zero.gamemeta.ru/upload/resize_cache/iblock/5c6/kk2ow7uay8qtbuwl5bl8gn885gvc9uzd/1000_1000_1619711fa078991f0a23d032687646b21/5861537250d67fe4adcdc86009150c67_8472512953737197419.png
- Zhu Yuan: https://api.hakush.in/zzz/UI/IconRoleCrop23.webp
- Laevatain: https://endfield.gg/wp-content/uploads/sites/38/2025/08/laevatain-arknight-endfield-icon.webp

## Architecture and constraints
- Add new entries in `src/ai/characters-extra.js` and import/append them in `src/ai/characters.js`; do not rewrite existing character prompts.
- Keep the existing `id`, `name`, `aliases`, `description`, and `systemPrompt` interface.
- Keep all profile text in natural Brazilian Portuguese.
- Preserve `.personagem`, `.personagens`, `.falar`, and character memory behavior.
- Add no runtime dependencies and do not change the automatic resolver.
- Every new profile must have a unique ID, a non-empty description, at least one alias, and a distinct personality prompt.

## Validation
- The catalog contains exactly 209 profiles after the addition.
- All IDs remain unique and all entries retain the required fields.
- One representative profile from each expansion group is findable by name/alias.
- Curated URLs are HTTPS and attached to the intended profiles.
- Existing characters such as Furina, Anby, Nicole, and Perlica remain findable.
