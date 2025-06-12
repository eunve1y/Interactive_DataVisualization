(async function () {
  // 0) 국가코드 -> 통화 코드 매핑
  const currencyMap = {
    KR: "KRW",
    JP: "JPY",
    US: "USD",
    GB: "GBP",
    FR: "EUR",
  };

  // 1) 국가 목록 (ISO 코드 + 한글명)
  const countries = [
    { code: "KR", name: "대한민국" },
    { code: "JP", name: "일본" },
    { code: "US", name: "미국" },
    { code: "GB", name: "영국" },
    { code: "FR", name: "프랑스" },
  ];

  // 2) 드롭다운 초기화
  const select = document.getElementById("countrySelect");
  countries.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = c.name;
    select.append(opt);
  });

  // 3) Leaflet 지도 세팅
  const map = L.map("map").setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  let marker;

  // 4) Chart.js 차트 세팅
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

  // 5) 이벤트 바인딩 & 초기 호출
  select.addEventListener("change", () => onCountrySelect(select.value));
  await onCountrySelect(select.value);

  // --- 핵심 로직 ---
  async function onCountrySelect(code) {
    // 5-1) RestCountries에서 위도/경도 & 국가정보 가져오기
    const infoRes = await fetch(`https://restcountries.com/v3.1/alpha/${code}`);
    const infoJson = await infoRes.json();
    const info = infoJson[0];
    const [lat, lon] = info.latlng;

    // 지도 중앙 이동 & 마커
    map.setView([lat, lon], 5);
    if (!marker) marker = L.marker([lat, lon]).addTo(map);
    else marker.setLatLng([lat, lon]);

    // 5-2) 통화코드 매핑
    const currency = currencyMap[code];
    if (!currency) {
      alert("지원하지 않는 국가입니다.");
      return;
    }

    // --- 환율 시계열 (Frankfurter.app, 무료) ---
    try {
      const end = new Date(),
        start = new Date(end - 29 * 24 * 3600 * 1000),
        fmt = (d) => d.toISOString().slice(0, 10);
      const tsUrl = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=USD&to=${currency}`;
      console.log("Frankfurter timeseries URL:", tsUrl);

      const tsRes = await fetch(tsUrl);
      if (!tsRes.ok) throw new Error("Timeseries API 응답 오류");
      const tsJson = await tsRes.json();
      // tsJson.rates = { "2025-05-01": { KRW: 1305 }, ... }
      const entries = Object.entries(tsJson.rates)
        .map(([date, obj]) => ({ date, rate: obj[currency] }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      rateChart.data.labels = entries.map((d) => d.date);
      rateChart.data.datasets[0].label = `USD → ${currency}`;
      rateChart.data.datasets[0].data = entries.map((d) => d.rate);
      rateChart.update();
    } catch (err) {
      console.error(err);
      alert("환율 시계열 로드 실패");
    }

    // --- 최신 환율 ---
    let curRate = null;
    try {
      const curUrl = `https://api.frankfurter.app/latest?from=USD&to=${currency}`;
      console.log("Frankfurter latest URL:", curUrl);

      const curRes = await fetch(curUrl);
      if (!curRes.ok) throw new Error("Latest API 응답 오류");
      const curJson = await curRes.json();
      curRate = curJson.rates[currency];
    } catch (e) {
      console.error("현재 환율 로드 실패", e);
    }

    // --- Open-Meteo 날씨 (무료) ---
    let weatherText = "날씨 로드 실패";
    try {
      const wUrl =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&current_weather=true&timezone=Asia/Seoul`;
      console.log("Open-Meteo URL:", wUrl);

      const wj = await fetch(wUrl).then((r) => r.json());
      const cw = wj.current_weather;
      const weatherMap = {
        0: "맑음", 1: "주로 맑음", 2: "구름 조금", 3: "흐림",
        45: "안개", 48: "착빙 안개", 51: "가벼운 이슬비",
        53: "중간 이슬비", 55: "강한 이슬비", 61: "약한 비",
        63: "중간 비", 65: "강한 비", 71: "약한 눈",
        73: "중간 눈", 75: "강한 눈", 80: "약한 소나기",
        81: "중간 소나기", 82: "강한 소나기"
      };
      const desc = weatherMap[cw.weathercode] || "알 수 없음";
      weatherText = `${desc}, ${cw.temperature}°C, 풍속 ${cw.windspeed} m/s`;
    } catch (e) {
      console.error("날씨 로드 실패", e);
    }
    document.getElementById("weatherInfo").textContent = weatherText;

    // --- 국가 정보 & 환율 렌더링 ---
    const ci = document.getElementById("countryInfo");
    ci.innerHTML = `
      <li>수도: ${info.capital[0]}</li>
      <li>인구: ${info.population.toLocaleString()}명</li>
      <li>언어: ${Object.values(info.languages).join(", ")}</li>
      <li>${
        curRate !== null
          ? `환율 (USD → ${currency}): ${curRate.toFixed(2)}`
          : `<span style="color:red">환율 로드 실패</span>`
      }</li>
    `;
  }
})();
