const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = toNumber(searchParams.get("lat"));
  const lon = toNumber(searchParams.get("lon"));
  const apiKey = process.env.OWM_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "Отсутствует API_KEY" }, { status: 500 });
  }

  if (lat === null || lon === null) {
    return Response.json({ error: "Не указаны координаты" }, { status: 400 });
  }

  const baseParams = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    units: "metric",
    appid: apiKey,
  });

  const currentUrl = `https://api.openweathermap.org/data/2.5/weather?${baseParams.toString()}`;
  const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?${baseParams.toString()}`;

  const [currentRes, forecastRes] = await Promise.all([
    fetch(currentUrl, { cache: "no-store" }),
    fetch(forecastUrl, { cache: "no-store" }),
  ]);

  if (!currentRes.ok || !forecastRes.ok) {
    return Response.json({ error: "Не удалось получить данные погоды" }, { status: 502 });
  }

  const currentData = await currentRes.json();
  const forecastData = await forecastRes.json();

  const windKmh = currentData.wind?.speed ? currentData.wind.speed * 3.6 : 0;
  const precipitation =
    currentData.rain?.["1h"] ??
    currentData.rain?.["3h"] ??
    currentData.snow?.["1h"] ??
    currentData.snow?.["3h"] ??
    0;

  const current = {
    dt: currentData.dt,
    temp: currentData.main?.temp ?? 0,
    feels_like: currentData.main?.feels_like ?? 0,
    humidity: currentData.main?.humidity ?? 0,
    wind_kmh: windKmh,
    precipitation_mm: precipitation,
    icon: currentData.weather?.[0]?.icon ?? "01d",
    description: currentData.weather?.[0]?.description ?? "",
  };

  const forecast = (forecastData.list || []).map((item) => {
    const windKmh = item.wind?.speed ? item.wind.speed * 3.6 : 0;
    return {
      dt: item.dt,
      temp: item.main?.temp ?? 0,
      feels_like: item.main?.feels_like ?? item.main?.temp ?? 0,
      humidity: item.main?.humidity ?? 0,
      wind_kmh: windKmh,
      icon: item.weather?.[0]?.icon ?? "01d",
      precipitation_mm: item.rain?.["3h"] ?? item.snow?.["3h"] ?? 0,
    };
  });

  const locationParts = [forecastData.city?.name, forecastData.city?.country].filter(Boolean);

  return Response.json({
    location: {
      name: forecastData.city?.name ?? currentData.name ?? "Unknown",
      country: forecastData.city?.country ?? "",
      label: locationParts.join(", "),
      lat,
      lon,
    },
    timezone: forecastData.city?.timezone ?? 0,
    current,
    forecast,
  });
}
