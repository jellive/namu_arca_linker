// 일회성 검증 스크립트. `node scripts/arca-spike.mjs`로 실행.
// curl/wget이 아니라 node 전역 fetch를 쓴다 (환경 훅이 curl/wget만 차단).
const ENDPOINT = "https://arca.live/api/app/list/channel/namuhotnow?limit=50";
const TOKEN = Array.from(
  { length: 64 },
  () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)],
).join("");
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const APP_UA = "net.umanle.arca.android.playstore/0.9.83";

async function hit(label, ua) {
  try {
    const res = await fetch(ENDPOINT, {
      headers: { "User-Agent": ua, "x-device-token": TOKEN },
    });
    console.log(`\n[${label}] status=${res.status}`);
    if (res.status !== 200) {
      const body = await res.text();
      console.log(`  body(head): ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const arts = data.articles ?? [];
    console.log(`  articles=${arts.length}`);
    if (arts[0]) {
      console.log(`  first article keys: ${Object.keys(arts[0]).join(", ")}`);
      console.log(`  commentCount field present: ${"commentCount" in arts[0]}`);
      console.log(
        `  sample: id=${arts[0].id} title=${JSON.stringify(arts[0].title)} cat=${JSON.stringify(arts[0].categoryDisplayName)} comments=${arts[0].commentCount}`,
      );
    }
    return data;
  } catch (e) {
    console.log(`\n[${label}] ERROR ${e.message}`);
    return null;
  }
}

console.log("device-token:", TOKEN);
await hit("APP_UA (경쟁확장과 동일, baseline)", APP_UA);
await hit("CHROME_UA (SW가 보낼 UA 시뮬레이션)", CHROME_UA);
