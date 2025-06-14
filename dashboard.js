(async function () {
  const currencyMap = {
    KR: "KRW",
    JP: "JPY",
    US: "USD",
    GB: "GBP",
    FR: "EUR",
    CN: "CNY",
    AU: "AUD",
    TH: "THB",
    DE: "EUR",
    CA: "CAD",
    PH: "PHP",
  };

  const countries = [
    { code: "KR", name: "대한민국" },
    { code: "JP", name: "일본" },
    { code: "CN", name: "중국" },
    { code: "TH", name: "태국" },
    { code: "PH", name: "필리핀" },
    { code: "US", name: "미국" },
    { code: "GB", name: "영국" },
    { code: "FR", name: "프랑스" },
    { code: "AU", name: "호주" },
    { code: "DE", name: "독일" },
    { code: "CA", name: "캐나다" },
  ];

  const timezoneMap = {
    KR: "Asia/Seoul",
    JP: "Asia/Tokyo",
    CN: "Asia/Shanghai",
    TH: "Asia/Bangkok",
    PH: "Asia/Manila",
    US: "America/New_York",
    GB: "Europe/London",
    FR: "Europe/Paris",
    AU: "Australia/Sydney",
    DE: "Europe/Berlin",
    CA: "America/Toronto",
  };

  const select = document.getElementById("countrySelect");
  countries.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = c.name;
    select.append(opt);
  });
  select.value = "KR";

  const map = L.map("map").setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  let marker;

  const ctx = document.getElementById("rateChart").getContext("2d");
  const rateChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "",
          data: [],
          borderColor: "#007ACC",
          tension: 0.3,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: { type: "time", time: { unit: "day" } },
        y: { beginAtZero: false },
      },
    },
  });

  // 전역 변수로 선택한 타임존 저장
  let selectedTimezone = timezoneMap["KR"];

  select.addEventListener("change", () => onCountrySelect(select.value));
  await onCountrySelect(select.value);

  async function onCountrySelect(code) {
    selectedTimezone = timezoneMap[code] || "UTC"; // 타임존 설정

    const infoRes = await fetch(`https://restcountries.com/v3.1/alpha/${code}`);
    const infoJson = await infoRes.json();
    const info = infoJson[0];
    const [lat, lon] = info.latlng;

    map.setView([lat, lon], 5);
    if (!marker) marker = L.marker([lat, lon]).addTo(map);
    else marker.setLatLng([lat, lon]);

    const currency = currencyMap[code];
    if (!currency) {
      alert("지원하지 않는 국가입니다.");
      return;
    }

    let curRate = null;
    let previousRate = null;
    try {
      const end = new Date(),
        start = new Date(end - 29 * 24 * 3600 * 1000),
        fmt = (d) => d.toISOString().slice(0, 10);
      const tsUrl = `https://api.frankfurter.app/${fmt(start)}..${fmt(
        end
      )}?from=USD&to=${currency}`;
      const tsRes = await fetch(tsUrl);
      const tsJson = await tsRes.json();
      const entries = Object.entries(tsJson.rates)
        .map(([date, obj]) => ({ date, rate: obj[currency] }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      rateChart.data.labels = entries.map((d) => d.date);
      rateChart.data.datasets[0].label = `USD → ${currency}`;
      rateChart.data.datasets[0].data = entries.map((d) => d.rate);
      rateChart.update();

      previousRate = entries.at(-2)?.rate;
      curRate = entries.at(-1)?.rate;
    } catch (err) {
      console.error(err);
      alert("환율 시계열 로드 실패");
    }

    let weatherText = "날씨 로드 실패";
    try {
      const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=${selectedTimezone}`;
      const wj = await fetch(wUrl).then((r) => r.json());
      const cw = wj.current_weather;
      const weatherMap = {
        0: "맑음",
        1: "주로 맑음",
        2: "구름 조금",
        3: "흐림",
        45: "안개",
        48: "착빙 안개",
        51: "가벼운 이슬비",
        53: "중간 이슬비",
        55: "강한 이슬비",
        61: "약한 비",
        63: "중간 비",
        65: "강한 비",
        71: "약한 눈",
        73: "중간 눈",
        75: "강한 눈",
        80: "약한 소나기",
        81: "중간 소나기",
        82: "강한 소나기",
      };
      const desc = weatherMap[cw.weathercode] || "알 수 없음";
      weatherText = `${desc}, ${cw.temperature}°C, 풍속 ${cw.windspeed} m/s`;
    } catch (e) {
      console.error("날씨 로드 실패", e);
    }
    document.getElementById("weatherInfo").textContent = weatherText;

    const ci = document.getElementById("countryInfo");
    const diff =
      curRate !== null && previousRate !== null ? curRate - previousRate : null;
    const diffColor = diff > 0 ? "red" : diff < 0 ? "blue" : "black";

    document.getElementById("countryFlag").src = info.flags.png;
    document.getElementById("countryName").textContent =
      info.translations.kor?.common || info.name.common;

    ci.innerHTML = `
      <li>수도: ${info.capital?.[0] || "-"}</li>
      <li>인구: ${info.population.toLocaleString()}명</li>
      <li>언어: ${Object.values(info.languages || {}).join(", ")}</li>
      <li>
        환율 (USD → ${currency}):
        <span style="color:${diffColor}">
          ${curRate ? curRate.toFixed(2) : "N/A"}
        </span>
        ${diff !== null ? ` (${diff.toFixed(2)})` : ""}
      </li>
    `;

    document.getElementById("updatedAt").textContent =
      "업데이트: " + new Date().toLocaleString("ko-KR");
  }

  // 실시간 시간 업데이트 함수 (선택된 타임존 기준)
  function updateTime() {
    const now = new Date();
    const formatted = now.toLocaleString("ko-KR", {
      timeZone: selectedTimezone,
      hour12: false,
    });
    document.getElementById("currentTime").textContent = formatted;
  }

  setInterval(updateTime, 1000);
  updateTime();
})();
